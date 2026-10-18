import { expect, test } from "@playwright/test";
import { cspViolations, expectClean, index, READONLY, skipIfReadonly, trackCSP, watch } from "./support";

// Defensive checks: the protections hold. Payloads are harmless markers: a
// successful injection would set window.__pwned or open a dialog.
const MARK = "qa-marker-7f3";
const PAYLOADS = [
	`<img src=x onerror="window.__pwned='${MARK}'">`,
	`"><script>window.__pwned='${MARK}'</script>`,
	`javascript:window.__pwned='${MARK}'`,
	`'-alert('${MARK}')-'`,
];

async function pwned(page: import("@playwright/test").Page): Promise<unknown> {
	return page.evaluate(() => (window as unknown as { __pwned?: unknown }).__pwned);
}

test("security headers on pages, fragments, static files and errors", async ({ request, baseURL }) => {
	const https = (baseURL ?? "").startsWith("https://");
	const page = await request.get("/");
	const id = /data-question-id="([^"]+)"/.exec(await page.text())?.[1] ?? "";

	for (const [path, headers] of [
		["/", {}],
		[`/questions/${id}`, { "HX-Request": "true" }],
		[`/questions/${id}/answers/a`, { "HX-Request": "true" }],
		["/review?items=", { "HX-Request": "true" }],
		["/favicon.svg", {}],
		["/questions/does-not-exist", {}],
		["/up", {}],
	] as const) {
		const r = await request.get(path, { headers });
		const h = r.headers();
		const where = `${path}`;
		expect.soft(h["x-content-type-options"], `${where}: nosniff`).toBe("nosniff");
		expect.soft(h["x-frame-options"], `${where}: X-Frame-Options`).toBe("DENY");
		expect.soft(h["referrer-policy"], `${where}: Referrer-Policy`).toBeTruthy();
		expect.soft(h["permissions-policy"], `${where}: Permissions-Policy`).toBeTruthy();
		expect.soft(h["set-cookie"], `${where}: no cookies`).toBeUndefined();
		// The app sends no Server header; a PaaS edge may add its own (QA-F5:
		// Railway adds "railway-hikari"), which must not name the app stack.
		expect.soft(h.server ?? "", `${where}: Server header does not reveal the stack`).not.toMatch(/go|vukem|net\/http/i);
		const csp = h["content-security-policy"] ?? "";
		expect.soft(csp, `${where}: CSP frame-ancestors`).toContain("frame-ancestors 'none'");
		expect.soft(csp, `${where}: CSP object-src`).toContain("object-src 'none'");
		expect.soft(csp, `${where}: CSP base-uri`).toContain("base-uri 'self'");
		expect.soft(csp, `${where}: no unsafe-inline/eval`).not.toMatch(/unsafe-inline|unsafe-eval/);
		if (path === "/") expect.soft(csp, "/: script nonce").toMatch(/script-src[^;]*'nonce-[A-Za-z0-9_-]{16,}'/);
		if (https) expect.soft(h["strict-transport-security"], `${where}: HSTS`).toMatch(/max-age=\d{7,}/);
	}

	// A fresh nonce per response.
	const n1 = /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"] ?? "")?.[1];
	const n2 = /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"] ?? "")?.[1];
	expect(n1).toBeTruthy();
	expect(n1).not.toBe(n2);
});

test("user-controlled query strings are never executed or reflected raw", async ({ page }) => {
	await trackCSP(page);
	const problems = watch(page, (_u, s) => s === 400 || s === 404);
	await page.goto("/");
	const id = (await index(page))[0]?.id ?? "";
	for (const p of READONLY ? PAYLOADS.slice(0, 2) : PAYLOADS) {
		const q = encodeURIComponent(p);
		for (const path of [`/?lang=${q}`, `/questions/${id}?lang=${q}&order=${q}`, `/questions/${q}`]) {
			await page.goto(path);
			expect.soft(await pwned(page), `${path}: executed`).toBeUndefined();
			const html = await page.content();
			expect.soft(html.includes(p), `${path}: reflected raw`).toBe(false);
		}
		const frag = await page.request.get(`/review?items=${q}`, { headers: { "HX-Request": "true" } });
		expect.soft(frag.status(), "review rejects junk items").toBe(400);
		expect.soft((await frag.text()).includes(p), "review does not reflect").toBe(false);
	}
	expect.soft(await cspViolations(page), "CSP violations").toEqual([]);
	expectClean({ ...problems, failedRequests: [] }, "query payloads");
});

test("hostile localStorage and sessionStorage values render as text", async ({ page }) => {
	skipIfReadonly();
	await trackCSP(page);
	const problems = watch(page, (_u, s) => s === 400);
	await page.goto("/");
	const ids = (await index(page)).map((e) => e.id);
	const payload = PAYLOADS[0] ?? "";
	await page.addInitScript(
		([p, a, b]) => {
			localStorage.setItem(
				"quiz:v1",
				JSON.stringify({ settings: { lang: p, theme: p, mode: p, difficulties: [p, "easy"] }, answers: { [p]: { alt: p, correct: false, difficulty: "easy", at: 1 }, [a]: { alt: "a", correct: false, difficulty: "very-easy", at: 1 } }, order: [p, a] }),
			);
			localStorage.setItem("quiz:v1:history", JSON.stringify({ v: 1, runs: [{ startedAt: 1, endedAt: 2, mode: p, difficulties: [p], answered: 1, correct: 0, byDifficulty: { [p]: { answered: 1, correct: 0 } }, finished: true }] }));
			sessionStorage.setItem("quiz:v1:session", JSON.stringify({ wrong: [{ id: p, alt: "a" }, { id: b, alt: p }, { id: a, alt: "b" }] }));
		},
		[payload, ids[0] ?? "", ids[1] ?? ""] as const,
	);
	await page.goto("/");
	for (const panel of ["settings", "history", "review"]) {
		await page.getByTestId(`${panel}-open`).click();
		await expect(page.getByTestId(panel)).toBeVisible();
		await page.waitForLoadState("networkidle");
		expect.soft(await pwned(page), `${panel}: executed`).toBeUndefined();
		await page.keyboard.press("Escape");
	}
	expect.soft(await page.content(), "payload not rendered as markup").not.toContain(`onerror="window.__pwned`);
	expect.soft(await cspViolations(page), "CSP violations").toEqual([]);
	expectClean(problems, "storage payloads");
});

test("quiz routes accept only GET/HEAD and refuse cross-origin unsafe requests", async ({ request }) => {
	skipIfReadonly();
	const id = /data-question-id="([^"]+)"/.exec(await (await request.get("/")).text())?.[1] ?? "";
	for (const path of ["/", `/questions/${id}`, `/questions/${id}/answers/a`, "/review"]) {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			const r = await request.fetch(path, { method, data: "x=1", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
			expect.soft(r.status(), `${method} ${path}`).toBe(405);
			const cross = await request.fetch(path, {
				method,
				data: "x=1",
				headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
			});
			expect.soft([403, 405], `${method} ${path} cross-origin`).toContain(cross.status());
		}
		expect.soft((await request.head(path)).status(), `HEAD ${path}`).toBeLessThan(400);
	}
	// Method override must not turn a POST into something else.
	const override = await request.fetch(`/questions/${id}?_method=GET`, { method: "POST", data: "_method=GET", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
	expect.soft(override.status(), "_method override").toBe(405);
});

test("rate limiting answers 429 with RateLimit and Retry-After headers", async ({ playwright }) => {
	skipIfReadonly();
	// Second local app started with RATE_LIMIT_PER_MINUTE=5 (playwright.qa.config.ts).
	const limited = await playwright.request.newContext({ baseURL: "http://127.0.0.1:3871" });
	let last: Awaited<ReturnType<typeof limited.get>> | undefined;
	for (let i = 0; i < 12; i++) {
		last = await limited.get("/questions/does-not-exist");
		if (last.status() === 429) break;
	}
	expect(last?.status()).toBe(429);
	const h = last?.headers() ?? {};
	expect.soft(Number(h["retry-after"]), "Retry-After seconds").toBeGreaterThan(0);
	expect.soft(h["ratelimit-limit"], "RateLimit-Limit").toBe("5");
	expect.soft(h["ratelimit-remaining"], "RateLimit-Remaining").toBe("0");
	expect.soft((await last?.text()) ?? "", "429 body without internals").not.toMatch(/goroutine |\.go:\d+/);
	// The health check stays exempt.
	expect((await limited.get("/up")).status()).toBe(200);
	await limited.dispose();
});

test("framework error pages respect the CSP (405 from a form POST)", async ({ page }) => {
	skipIfReadonly();
	// QA-F2: fixed in vukem v0.27.0 (the built-in page no longer uses inline styles).
	await trackCSP(page);
	await page.goto("/");
	await page.evaluate(() => {
		const f = document.createElement("form");
		f.method = "post";
		f.action = "/";
		document.body.append(f);
		f.submit();
	});
	await page.waitForURL("**/");
	await expect(page.locator("h1")).toContainText("405");
	expect(await cspViolations(page)).toEqual([]);
});

test("oversized request headers are rejected well below 1 MiB", async () => {
	skipIfReadonly();
	// QA-F3: fixed in vukem v0.27.0 (HTTP_MAX_HEADER_BYTES, default 64 KiB).
	const res = await fetch("http://127.0.0.1:3870/", { headers: { "X-Big": "a".repeat(512 * 1024) } });
	expect(res.status).toBe(431);
});
