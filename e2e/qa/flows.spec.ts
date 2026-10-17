import { expect, type Page, test } from "@playwright/test";
import { currentId, expectClean, index, skipIfReadonly, watch } from "./support";

// Human-like flows: whole runs, impatient users, broken storage, odd URLs.
// They write client state and send many requests, so they run locally only.
test.beforeEach(() => skipIfReadonly());

async function answerAndNext(page: Page, key: string): Promise<void> {
	// QA-F4: a key pressed in the few ms between the swap and htmx wiring the
	// new buttons is ignored; retry like an impatient human would.
	await expect(async () => {
		if ((await page.getByTestId("verdict").count()) === 0) await page.keyboard.press(key);
		await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 10_000 });
	const before = await currentId(page);
	await page.keyboard.press("Enter");
	await expect
		.poll(async () => (await page.getByTestId("finished").count()) > 0 || (await currentId(page).catch(() => before)) !== before)
		.toBe(true);
}

async function onlyDifficulty(page: Page, d: string): Promise<void> {
	await page.getByTestId("settings-open").click();
	for (const other of ["very-easy", "easy", "medium", "hard", "very-hard"]) {
		const box = page.getByTestId(`difficulty-${other}`);
		if (other === d) await box.check();
	}
	for (const other of ["very-easy", "easy", "medium", "hard", "very-hard"]) {
		if (other !== d) await page.getByTestId(`difficulty-${other}`).uncheck();
	}
	await page.keyboard.press("Escape");
}

for (const mode of ["ordered", "random"] as const) {
	for (const d of ["very-easy", "easy", "medium", "hard", "very-hard"]) {
		test(`full ${mode} run of ${d}: every question once, then the finished card and a history entry`, async ({ page }) => {
			test.skip(mode === "random" && d !== "medium", "random mode is sampled on one difficulty");
			const problems = watch(page);
			await page.goto("/");
			const expected = (await index(page)).filter((e) => e.difficulty === d).map((e) => e.id);
			if (mode === "random") {
				await page.getByTestId("settings-open").click();
				await page.locator('label:has([data-testid="mode-random"])').click();
				await page.keyboard.press("Escape");
			}
			await onlyDifficulty(page, d);

			const seen: string[] = [];
			for (let i = 0; i < expected.length; i++) {
				await expect(page.getByTestId("question")).toHaveAttribute("data-difficulty", d);
				seen.push(await currentId(page));
				await answerAndNext(page, String((i % 5) + 1));
			}
			await expect(page.getByTestId("finished")).toBeVisible();
			expect(new Set(seen).size, "no question repeats").toBe(expected.length);
			expect([...seen].sort()).toEqual([...expected].sort());
			if (mode === "ordered") expect(seen).toEqual(expected);
			await expect(page.getByTestId("progress")).toHaveText(`${expected.length}/${expected.length}`);

			await page.getByTestId("history-open").click();
			const run = page.getByTestId("history-run").first();
			await expect(run).toHaveAttribute("data-status", "finished");
			await expect(run.getByTestId("run-answered")).toHaveText(String(expected.length));
			expectClean(problems, `${mode} ${d}`);
		});
	}
}

test("reset mid-run, back/forward and reload mid-question keep a consistent state", async ({ page }) => {
	const problems = watch(page);
	await page.goto("/");
	const ids = (await index(page)).map((e) => e.id);
	await answerAndNext(page, "1");
	await answerAndNext(page, "2");
	await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", ids[2] ?? "");

	await page.goBack();
	await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", ids[1] ?? "");
	await page.goForward();
	await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", ids[2] ?? "");

	await page.keyboard.press("3");
	await expect(page.getByTestId("verdict")).toBeVisible();
	await page.reload();
	// The answered question shows unanswered again but the answer is kept.
	await expect(page.getByTestId("progress")).toHaveText(`3/${ids.length}`);

	await page.getByTestId("settings-open").click();
	await page.getByTestId("reset").click();
	await page.getByTestId("reset-yes").click();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("progress")).toHaveText(`0/${ids.length}`);
	await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", ids[0] ?? "");
	expectClean(problems, "navigation");
});

test("double clicks and key mashing never record two answers for one question", async ({ page }) => {
	const problems = watch(page);
	await page.goto("/");
	const first = page.locator("#alternatives button").first();
	await first.dblclick();
	await expect(page.getByTestId("verdict")).toBeVisible();
	await expect(page.getByTestId("verdict")).toHaveCount(1);

	for (let i = 0; i < 5; i++) await page.keyboard.type("12345abcde", { delay: 5 });
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	for (let i = 0; i < 20; i++) await page.keyboard.press(String((i % 5) + 1));
	await page.waitForLoadState("networkidle");

	const answers = await page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem("quiz:v1") ?? "{}") as { answers?: object }).answers ?? {}));
	const progress = await page.getByTestId("progress").textContent();
	expect(progress?.split("/")[0], "progress matches stored answers").toBe(String(answers.length));
	await expect(page.locator("#question, [data-testid=finished]")).toHaveCount(1);
	expectClean(problems, "mashing");
});

for (const kind of ["corrupted", "blocked"] as const) {
	test(`${kind} localStorage and sessionStorage: the quiz still works`, async ({ page }) => {
		const problems = watch(page);
		await page.addInitScript((k) => {
			if (k === "corrupted") {
				localStorage.setItem("quiz:v1", '{"settings":{"theme":7,"difficulties":"x"},"answers":[1,2],"run":{"answered":-5}}');
				localStorage.setItem("quiz:v1:history", '{"runs":[{"startedAt":"x"},null,5]}');
				sessionStorage.setItem("quiz:v1:session", '{"wrong":"nope","reviewing":true}');
				return;
			}
			for (const name of ["localStorage", "sessionStorage"]) {
				Object.defineProperty(window, name, {
					get() {
						throw new DOMException("blocked", "SecurityError");
					},
				});
			}
		}, kind);
		await page.goto("/");
		await answerAndNext(page, "1");
		await page.keyboard.press("2");
		await expect(page.getByTestId("verdict")).toBeVisible();
		for (const panel of ["settings", "history", "review"]) {
			await page.getByTestId(`${panel}-open`).click();
			await expect(page.getByTestId(panel)).toBeVisible();
			await page.keyboard.press("Escape");
		}
		await page.getByTestId("theme").locator('[data-theme-choice="dark"]').click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		expectClean(problems, kind);
	});
}

test("very long and odd query strings and unknown routes fail softly", async ({ page, request }) => {
	const problems = watch(page, (u, s) => s === 404 && (u.pathname.startsWith("/nope") || u.pathname.startsWith("/questions/zz")));
	for (const q of [`?lang=${"x".repeat(4000)}`, "?lang=%00%ff", "?order=%E2%80%AE", "?lang=en&lang=pt-BR", "?%zz=1", `?${"a=1&".repeat(300)}`]) {
		const res = await page.goto(`/${q}`);
		expect.soft(res?.status(), `/${q.slice(0, 30)}`).toBeLessThan(500);
		if (res?.status() === 200) await expect(page.getByTestId("question")).toBeVisible();
	}
	for (const path of ["/nope", "/nope/../../etc/passwd", "/questions/zz-unknown", "/questions/%2e%2e%2fgo.mod", "/up/x", "/review/x", "/vendor/htmx-4.0.0/missing.js"]) {
		const r = await request.get(path);
		expect.soft(r.status(), path).toBe(404);
		expect.soft(await r.text(), `${path}: no internals`).not.toMatch(/goroutine |\.go:\d+|module github\.com/);
	}
	const res = await page.goto("/nope");
	expect(res?.status()).toBe(404);
	await page.getByRole("link").first().click();
	await expect(page.getByTestId("question")).toBeVisible();
	expectClean(problems, "odd urls");
});
