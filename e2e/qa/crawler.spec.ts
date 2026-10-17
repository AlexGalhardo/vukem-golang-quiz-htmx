import { expect, type Page, test } from "@playwright/test";
import { axe, brokenImages, cspViolations, currentId, expectClean, focusRingMissing, index, LANGS, prefs, READONLY, THEMES, trackCSP, watch } from "./support";

// Crawler: every reachable page and every control, in both themes and both
// languages (the desktop and mobile projects add the viewports).

const is404 = (u: URL, status: number): boolean => status === 404 && u.pathname === "/questions/does-not-exist";

async function links(page: Page): Promise<{ href: string; rel: string; target: string }[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({ href: a.href, rel: a.rel, target: a.target })),
	);
}

for (const theme of THEMES) {
	for (const lang of LANGS) {
		test.describe(`${theme} ${lang}`, () => {
			test.beforeEach(async ({ page }) => {
				await trackCSP(page);
				await prefs(page, theme, lang);
			});

			test("crawl every reachable page: no errors, broken links/images, CSP violations; axe and focus rings", async ({ page, request, baseURL }) => {
				const origin = new URL(baseURL ?? "").origin;
				const problems = watch(page, is404);

				await page.goto(`/?lang=${lang}`);
				const ids = (await index(page)).map((e) => e.id);
				expect(ids.length).toBeGreaterThan(100);

				// Seeds: home, first/middle/last question, a missing one; then every
				// same-origin link found on them (brand, language, review links).
				const queue = [`/?lang=${lang}`, ...[ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)].map((id) => `/questions/${id}?lang=${lang}`), "/questions/does-not-exist"];
				const seen = new Set<string>();
				const external = new Map<string, { rel: string; target: string }>();

				while (queue.length > 0 && seen.size < (READONLY ? 6 : 12)) {
					const path = queue.shift() ?? "";
					if (seen.has(path)) continue;
					seen.add(path);

					const res = await page.goto(path);
					expect.soft(res?.status(), `${path}: status`).toBe(path.includes("does-not-exist") ? 404 : 200);
					await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
					expect.soft(await brokenImages(page), `${path}: broken images`).toEqual([]);
					expect.soft(await cspViolations(page), `${path}: CSP violations`).toEqual([]);
					await axe(page, path);
					expect.soft(await focusRingMissing(page, 25), `${path}: focusable elements without a visible focus ring`).toEqual([]);

					for (const l of await links(page)) {
						const u = new URL(l.href);
						if (u.origin === origin) {
							const p = `${u.pathname}${u.search}`;
							if (!seen.has(p) && !queue.includes(p)) queue.push(p);
						} else {
							external.set(l.href, { rel: l.rel, target: l.target });
						}
					}
				}

				// Same-origin pages found but not visited still have to resolve.
				for (const p of queue.slice(0, READONLY ? 2 : 10)) {
					const r = await request.get(p);
					expect.soft(r.status(), `${p}: linked page status`).toBeLessThan(400);
				}

				for (const [href, a] of external) {
					expect.soft(href.startsWith("https://"), `${href}: external links use https`).toBe(true);
					if (a.target === "_blank") expect.soft(a.rel, `${href}: target=_blank needs rel=noopener`).toContain("noopener");
				}

				expectClean(problems, "crawl");
			});

			test("activate every control on the quiz page", async ({ page }) => {
				const problems = watch(page);
				await page.goto(`/?lang=${lang}`);

				// Every visible top-level control, one by one; any panel it opens
				// gets each of its own buttons pressed too, then is closed.
				const top = page.locator("body > header button:visible, main > section button:visible, [role=radio]:visible");
				const count = await top.count();
				expect(count).toBeGreaterThan(3);
				for (let i = 0; i < count; i++) {
					const b = top.nth(i);
					const label = `${(await b.getAttribute("data-testid")) ?? (await b.getAttribute("aria-label")) ?? (await b.textContent())?.trim()}`;
					await b.click();
					const dialog = page.locator("dialog[open]");
					if ((await dialog.count()) > 0) {
						const inner = dialog.locator("button:visible, label:visible");
						const n = await inner.count();
						for (let j = 0; j < n && (await dialog.count()) > 0; j++) {
							const el = inner.nth(j);
							if (!(await el.isVisible())) continue;
							const testid = await el.getAttribute("data-testid");
							if (testid?.endsWith("-close")) continue;
							await el.click();
						}
						if ((await dialog.count()) > 0) await page.keyboard.press("Escape");
						await expect(page.locator("dialog[open]"), `${label}: panel closes`).toHaveCount(0);
					}
				}

				// Answer through every shortcut style, then Next.
				for (const key of ["1", "b", "5", "C"]) {
					await expect(async () => {
						if ((await page.getByTestId("verdict").count()) === 0) await page.keyboard.press(key);
						await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 1000 });
					}).toPass({ timeout: 10_000 });
					const before = await currentId(page);
					await page.keyboard.press("Enter");
					// Wait for the next question itself: the card clears before the swap lands.
					await expect.poll(async () => (await page.getByTestId("finished").count()) > 0 || (await currentId(page).catch(() => before)) !== before).toBe(true);
				}

				// Every in-page link resolves (sources open in a new tab: not followed).
				for (const a of await page.locator("main a[href]:not([target=_blank])").all()) {
					const href = await a.getAttribute("href");
					if (href?.startsWith("/") || href?.startsWith("?")) {
						const r = await page.request.get(new URL(href, page.url()).toString());
						expect.soft(r.status(), `${href}: in-page link`).toBeLessThan(400);
					}
				}

				expect.soft(await cspViolations(page), "CSP violations").toEqual([]);
				expectClean(problems, "controls");
			});
		});
	}
}
