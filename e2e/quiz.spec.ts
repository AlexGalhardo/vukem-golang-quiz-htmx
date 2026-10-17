import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

interface IndexEntry {
	id: string;
	difficulty: string;
}

const STORAGE_KEY = "quiz:v1";

async function index(page: Page): Promise<IndexEntry[]> {
	return page.evaluate(() => JSON.parse(document.getElementById("quiz-index")?.textContent ?? "[]") as IndexEntry[]);
}

async function currentId(page: Page): Promise<string> {
	return (await page.getByTestId("question").getAttribute("data-question-id")) ?? "";
}

// The page never reveals the correct alternative before answering, so the
// tests ask the server, like the htmx button would.
async function correctAlt(request: APIRequestContext, id: string): Promise<string> {
	const res = await request.get(`/questions/${id}/answers/a`, { headers: { "HX-Request": "true" } });
	const m = /data-alt="([a-e])" data-key="\d" data-state="correct"/.exec(await res.text());
	if (!m?.[1]) throw new Error(`no correct alternative for ${id}`);
	return m[1];
}

async function answer(page: Page, alt: string): Promise<void> {
	await page.locator(`#alternatives button[data-alt="${alt}"]`).click();
	await expect(page.getByTestId("verdict")).toBeVisible();
}

// Next swaps the question in asynchronously; wait until the answered card
// is gone before reading the new question.
async function next(page: Page): Promise<void> {
	const before = await currentId(page);
	await page.getByTestId("next").click();
	await expect(page.getByTestId("verdict")).toHaveCount(0);
	// A slow swap can clear the card before the new question is in place.
	await expect
		.poll(
			async () =>
				(await page.locator('[data-testid="finished"], [data-testid="review-done"]').count()) > 0 ||
				(await currentId(page).catch(() => before)) !== before,
		)
		.toBe(true);
}

async function answerWrong(page: Page, request: APIRequestContext): Promise<void> {
	const ok = await correctAlt(request, await currentId(page));
	await answer(page, ok === "a" ? "b" : "a");
}

async function stored(page: Page): Promise<Record<string, unknown>> {
	return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}") as Record<string, unknown>, STORAGE_KEY);
}

async function closeSettings(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("settings")).toBeHidden();
}

async function openSettings(page: Page): Promise<void> {
	if (await page.getByTestId("settings").isVisible()) return;
	await page.getByTestId("settings-open").click();
	await expect(page.getByTestId("settings")).toBeVisible();
}

// Every test fails on uncaught page errors or console errors (CSP
// violations show up there). The 404 test's expected status is not one.
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
	const errors: string[] = [];
	pageErrors.set(page, errors);
	page.on("pageerror", (err) => errors.push(err.message));
	page.on("console", (msg) => {
		if (msg.type() === "error" && !msg.text().includes("404")) errors.push(msg.text());
	});
});

test.afterEach(({ page }) => {
	expect(pageErrors.get(page) ?? []).toEqual([]);
});

test.describe("answer flow", () => {
	test("first visit shows the first very-easy question", async ({ page }) => {
		await page.goto("/");
		const idx = await index(page);
		expect(idx.length).toBeGreaterThanOrEqual(100);
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", idx[0]?.id ?? "");
		await expect(page.getByTestId("difficulty")).toHaveText("Very easy");
		await expect(page.locator("#alternatives button")).toHaveCount(5);
		await expect(page.getByTestId("progress")).toHaveText(`0/${idx.length}`);
		await expect(page.getByTestId("explanation")).toContainText("Pick an answer");
	});

	test("clicking the correct answer locks it and reveals explanation and sources", async ({ page, request }) => {
		await page.goto("/");
		const id = await currentId(page);
		const ok = await correctAlt(request, id);
		const order = await page.getByTestId("alternatives").getAttribute("data-order");

		await answer(page, ok);

		await expect(page.getByTestId("verdict")).toHaveAttribute("data-correct", "true");
		await expect(page.getByTestId("verdict")).toHaveText("Correct!");
		await expect(page.locator("#alternatives button:not([disabled])")).toHaveCount(0);
		await expect(page.locator(`#alternatives button[data-alt="${ok}"]`)).toHaveAttribute("data-state", "correct");
		// The lock keeps the order the user saw.
		await expect(page.getByTestId("alternatives")).toHaveAttribute("data-order", order ?? "");
		await expect(page.getByTestId("explanation-text")).not.toBeEmpty();
		await expect(page.getByTestId("why-wrong").locator("li")).toHaveCount(4);
		const sources = page.getByTestId("sources").locator("a");
		expect(await sources.count()).toBeGreaterThanOrEqual(1);
		for (const a of await sources.all()) {
			await expect(a).toHaveAttribute("href", /^https:\/\//);
			await expect(a).toHaveAttribute("target", "_blank");
			await expect(a).toHaveAttribute("rel", /noopener/);
		}
		await expect(page.getByTestId("next")).toBeFocused();
		await expect(page.getByTestId("progress")).toHaveText(/^1\//);
		await expect(page.getByTestId("accuracy")).toHaveText("100%");

		const s = await stored(page);
		expect((s.answers as Record<string, { correct: boolean }>)[id]?.correct).toBe(true);
	});

	test("a wrong answer is marked and counted", async ({ page, request }) => {
		await page.goto("/");
		await answerWrong(page, request);

		await expect(page.getByTestId("verdict")).toHaveAttribute("data-correct", "false");
		await expect(page.locator('#alternatives button[data-state="wrong"]')).toHaveCount(1);
		await expect(page.locator('#alternatives button[data-state="correct"]')).toHaveCount(1);
		await expect(page.getByTestId("why-wrong")).toContainText("your answer");
		await expect(page.getByTestId("accuracy")).toHaveText("0%");
	});

	test("Next loads the following question, updates the URL and the back button returns", async ({ page, request }) => {
		await page.goto("/");
		const first = await currentId(page);
		const idx = await index(page);

		await answer(page, await correctAlt(request, first));
		await next(page);

		const second = idx[1]?.id ?? "";
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", second);
		await expect(page).toHaveURL(new RegExp(`/questions/${second}(\\?lang=en)?$`));
		await expect(page.getByTestId("explanation")).toContainText("Pick an answer");

		await page.goBack();
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", first);
	});

	test("answers survive a reload and / resumes at the next unanswered question", async ({ page, request }) => {
		await page.goto("/");
		const idx = await index(page);
		await answer(page, await correctAlt(request, idx[0]?.id ?? ""));

		await page.goto("/");
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", idx[1]?.id ?? "");
		await expect(page.getByTestId("progress")).toHaveText(`1/${idx.length}`);
	});

	test("a deep link renders that question", async ({ page }) => {
		await page.goto("/");
		const target = (await index(page))[10]?.id ?? "";

		await page.goto(`/questions/${target}`);
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", target);
	});
});

test.describe("keyboard shortcuts", () => {
	for (const [key, pos] of [
		["1", 1],
		["3", 3],
		["5", 5],
		["a", 1],
		["c", 3],
		["E", 5],
	] as const) {
		test(`"${key}" answers alternative ${pos}`, async ({ page }) => {
			await page.goto("/");
			const alt = await page.locator(`#alternatives button[data-key="${pos}"]`).getAttribute("data-alt");

			await page.keyboard.press(key);

			await expect(page.getByTestId("verdict")).toBeVisible();
			const s = await stored(page);
			expect((s.answers as Record<string, { alt: string }>)[await currentId(page)]?.alt).toBe(alt);
		});
	}

	test("Enter goes to the next question and keys are ignored once answered", async ({ page }) => {
		await page.goto("/");
		const first = await currentId(page);

		await page.keyboard.press("1");
		await expect(page.getByTestId("verdict")).toBeVisible();
		await page.keyboard.press("2"); // locked: no second answer
		await page.keyboard.press("Enter");

		await expect(page.getByTestId("question")).not.toHaveAttribute("data-question-id", first);
		const answers = (await stored(page)).answers as Record<string, unknown>;
		expect(Object.keys(answers)).toEqual([first]);
	});

	test("shortcuts are ignored while the settings panel is open", async ({ page }) => {
		await page.goto("/");
		await openSettings(page);
		await page.getByTestId("mode-random").focus();

		await page.keyboard.press("a");

		await expect(page.getByTestId("verdict")).toHaveCount(0);
	});
});

test.describe("settings", () => {
	test("random mode follows the stored shuffled order", async ({ page, request }) => {
		await page.goto("/");
		await openSettings(page);
		await page.locator('label:has([data-testid="mode-random"])').click();

		const s = await stored(page);
		expect((s.settings as { mode: string }).mode).toBe("random");
		const order = s.order as string[];
		const first = await currentId(page);
		await closeSettings(page);

		await answer(page, await correctAlt(request, first));
		await next(page);

		const expected = order[(order.indexOf(first) + 1) % order.length] ?? "";
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", expected);

		await page.reload();
		await openSettings(page);
		await expect(page.getByTestId("mode-random")).toBeChecked();
	});

	test("the difficulty filter limits the queue and the progress", async ({ page }) => {
		await page.goto("/");
		const idx = await index(page);
		const hard = idx.filter((e) => e.difficulty === "hard");
		await openSettings(page);

		for (const d of ["very-easy", "easy", "medium", "very-hard"]) {
			await page.getByTestId(`difficulty-${d}`).uncheck();
		}

		await expect(page.getByTestId("question")).toHaveAttribute("data-difficulty", "hard");
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", hard[0]?.id ?? "");
		await expect(page.getByTestId("progress")).toHaveText(`0/${hard.length}`);

		// The last checked difficulty cannot be unchecked.
		await page.getByTestId("difficulty-hard").click();
		await expect(page.getByTestId("difficulty-hard")).toBeChecked();
	});

	test("settings dialog: large targets, Escape, backdrop and focus return", async ({ page }) => {
		await page.goto("/");
		const open = page.getByTestId("settings-open");
		await open.click();
		const dialog = page.getByTestId("settings");
		await expect(dialog).toBeVisible();
		// Native modal: the quiz behind it is inert.
		await expect(page.getByTestId("settings-close")).toBeFocused();

		const box = await dialog.boundingBox();
		if (test.info().project.name !== "mobile") expect(box?.width ?? 0).toBeGreaterThanOrEqual(320);
		for (const id of ["mode-ordered", "mode-random", "difficulty-easy", "settings-lang-en", "reset", "settings-close"]) {
			const el = page.getByTestId(id);
			const target = (await el.evaluate((n) => n.tagName)) === "INPUT" ? el.locator("xpath=ancestor::label[1]") : el;
			const b = await target.boundingBox();
			expect(b?.height ?? 0, `${id} height`).toBeGreaterThanOrEqual(44);
		}

		await page.keyboard.press("1"); // shortcuts are off while a panel is open
		await expect(page.getByTestId("verdict")).toHaveCount(0);

		// Arrow keys move inside the mode radiogroup.
		await page.getByTestId("mode-ordered").focus();
		await page.keyboard.press("ArrowRight");
		await expect(page.getByTestId("mode-random")).toBeChecked();

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(open).toBeFocused();

		await open.click();
		await page.mouse.click(5, 5); // backdrop
		await expect(dialog).toBeHidden();
	});

	test("settings opens as a full-width bottom sheet on small screens", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/");
		await page.getByTestId("settings-open").click();
		const dialog = page.getByTestId("settings");
		await expect(dialog).toBeVisible();

		const box = await dialog.boundingBox();
		expect(box?.width).toBe(375);
		expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(667);
		expect(box?.height ?? 0).toBeLessThanOrEqual(667 * 0.9);
		expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);

		// The header with the close button stays put while the sheet scrolls.
		await dialog.evaluate((d) => d.scrollTo({ top: d.scrollHeight }));
		await expect(page.getByTestId("settings-close")).toBeInViewport();
		await page.getByTestId("settings-close").click();
		await expect(dialog).toBeHidden();
	});

	test("accuracy per difficulty is shown in settings", async ({ page, request }) => {
		await page.goto("/");
		await answer(page, await correctAlt(request, await currentId(page)));
		await next(page);
		await answerWrong(page, request);

		await openSettings(page);
		await expect(page.getByTestId("accuracy-very-easy")).toHaveText("50% (1/2)");
		await expect(page.getByTestId("accuracy-hard")).toHaveText("–");
	});

	test("reset asks for confirmation and clears progress", async ({ page, request }) => {
		await page.goto("/");
		const idx = await index(page);
		await answer(page, await correctAlt(request, await currentId(page)));
		await openSettings(page);

		// Inline confirmation, no browser dialog.
		page.on("dialog", () => {
			throw new Error("unexpected browser dialog");
		});
		await page.getByTestId("reset").click();
		await expect(page.getByTestId("reset-confirm")).toBeVisible();
		await expect(page.getByTestId("reset-confirm")).toContainText("Reset all progress");
		await expect(page.getByTestId("reset-no")).toBeFocused();
		await page.getByTestId("reset-no").click();
		await expect(page.getByTestId("reset-confirm")).toBeHidden();
		await expect(page.getByTestId("progress")).toHaveText(`1/${idx.length}`);

		await page.getByTestId("reset").click();
		await page.getByTestId("reset-yes").click();
		await expect(page.getByTestId("progress")).toHaveText(`0/${idx.length}`);
		await expect(page.getByTestId("accuracy")).toHaveText("–");
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", idx[0]?.id ?? "");
		expect((await stored(page)).answers).toEqual({});
	});
});

test.describe("navbar", () => {
	test("theme radiogroup switches light, dark and system and persists without a flash", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		const html = page.locator("html");
		const radio = (v: string) => page.getByTestId("theme").locator(`[data-theme-choice="${v}"]`);
		await expect(html).toHaveAttribute("data-theme", "light");
		await expect(radio("system")).toHaveAttribute("aria-checked", "true");
		await expect(page.getByTestId("theme").getByRole("radio")).toHaveCount(3);

		await radio("dark").click();
		await expect(html).toHaveAttribute("data-theme", "dark");
		await expect(radio("dark")).toHaveAttribute("aria-checked", "true");
		await expect(radio("system")).toHaveAttribute("aria-checked", "false");

		await page.goto("/", { waitUntil: "commit" });
		await page.waitForFunction(() => document.documentElement.dataset.theme !== undefined);
		await expect(html).toHaveAttribute("data-theme", "dark");

		await radio("light").click();
		await expect(html).toHaveAttribute("data-theme", "light");

		// System follows the OS preference live.
		await radio("system").click();
		await expect(html).toHaveAttribute("data-theme", "light");
		await page.emulateMedia({ colorScheme: "dark" });
		await expect(html).toHaveAttribute("data-theme", "dark");
	});

	test("theme radiogroup supports arrow keys", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		const group = page.getByTestId("theme");
		await group.locator('[aria-checked="true"]').focus();
		await page.keyboard.press("ArrowLeft"); // system -> dark
		await expect(group.locator('[data-theme-choice="dark"]')).toHaveAttribute("aria-checked", "true");
		await expect(group.locator('[data-theme-choice="dark"]')).toBeFocused();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
		await page.keyboard.press("ArrowRight"); // dark -> system
		await expect(group.locator('[data-theme-choice="system"]')).toHaveAttribute("aria-checked", "true");
	});

	test("theme defaults to the OS preference", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "dark" });
		await page.goto("/");
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	});

	test("language switch translates the UI and is remembered", async ({ page }) => {
		await page.goto("/");
		await page.getByTestId("lang-pt-BR").click();

		await expect(page).toHaveURL(/lang=pt-BR/);
		await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
		await expect(page.getByTestId("settings-open")).toHaveText("Configurações");
		await expect(page.getByTestId("lang-pt-BR")).toHaveAttribute("aria-current", "true");

		await page.goto("/");
		await expect(page).toHaveURL(/lang=pt-BR/);
		await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

		await page.getByTestId("lang-en").click();
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.getByTestId("settings-open")).toHaveText("Settings");
	});

	test("answers and next question keep the chosen language", async ({ page }) => {
		await page.goto("/?lang=pt-BR");
		await page.keyboard.press("1");
		await expect(page.getByTestId("next")).toContainText("Próxima pergunta");
		await page.keyboard.press("Enter");
		await expect(page.getByTestId("explanation")).toContainText("Escolha");
	});

	test("brand link returns to the quiz", async ({ page }) => {
		await page.goto("/");
		await page.getByTestId("brand").click();
		await expect(page).toHaveURL(/\/(\?lang=en)?$/);
		await expect(page.getByTestId("question")).toBeVisible();
	});

	test("footer links point to the repositories", async ({ page }) => {
		await page.goto("/");
		const footer = page.locator("footer a");
		await expect(footer).toHaveCount(2);
		await expect(footer.nth(0)).toHaveAttribute("href", "https://github.com/AlexGalhardo/vukem-golang-quiz-htmx");
		await expect(footer.nth(1)).toHaveAttribute("href", "https://github.com/AlexGalhardo/vukem");
	});
});

test.describe("resilience and layout", () => {
	test("corrupted storage falls back to defaults", async ({ page }) => {
		await page.addInitScript((k) => localStorage.setItem(k, "{not json"), STORAGE_KEY);
		await page.goto("/");
		const idx = await index(page);
		await expect(page.getByTestId("progress")).toHaveText(`0/${idx.length}`);
		await page.keyboard.press("1");
		await expect(page.getByTestId("verdict")).toBeVisible();
	});

	test("unknown question shows the 404 page with a way back", async ({ page }) => {
		const res = await page.goto("/questions/does-not-exist");
		expect(res?.status()).toBe(404);
		await expect(page.getByTestId("not-found")).toBeVisible();
		await page.getByRole("link", { name: "Back to the quiz" }).click();
		await expect(page.getByTestId("question")).toBeVisible();
	});

	test("grid is two columns on desktop and one on mobile", async ({ page }) => {
		await page.goto("/");
		const q = await page.getByTestId("question").boundingBox();
		const e = await page.getByTestId("explanation").boundingBox();
		if (!q || !e) throw new Error("grid not rendered");

		if (test.info().project.name === "mobile") {
			expect(e.y).toBeGreaterThanOrEqual(q.y + q.height);
		} else {
			expect(Math.abs(e.y - q.y)).toBeLessThan(2);
			expect(e.x).toBeGreaterThan(q.x + q.width - 1);
		}

		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
		expect(overflow).toBe(false);
	});

	test("long inline code wraps instead of widening the page", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 700 });
		await page.goto("/questions/t-context-canceled-before-cleanup");
		await page.keyboard.press("1");
		await expect(page.getByTestId("verdict")).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
	});
});

test.describe("history", () => {
	test("tracks the current run, saves it on reset, survives reloads and clears inline", async ({ page, request }) => {
		await page.goto("/");
		await answer(page, await correctAlt(request, await currentId(page)));
		await next(page);
		await answerWrong(page, request);

		await page.getByTestId("history-open").click();
		const dialog = page.getByTestId("history");
		await expect(dialog).toBeVisible();
		const runs = dialog.getByTestId("history-run");
		await expect(runs).toHaveCount(1);
		await expect(runs.first()).toHaveAttribute("data-status", "progress");
		await expect(runs.first().getByTestId("run-accuracy")).toHaveText("50%");
		await expect(runs.first().getByTestId("run-answered")).toHaveText("2");
		await expect(runs.first().getByTestId("run-correct")).toHaveText("1");
		await expect(runs.first().getByTestId("run-wrong")).toHaveText("1");
		await expect(runs.first().locator('[data-difficulty="very-easy"]')).toContainText("50% (1/2)");
		await page.keyboard.press("Escape");

		// Reset stops the run early and saves it.
		await openSettings(page);
		await page.getByTestId("reset").click();
		await page.getByTestId("reset-yes").click();
		await closeSettings(page);

		await page.reload();
		await page.getByTestId("history-open").click();
		await expect(runs).toHaveCount(1);
		await expect(runs.first()).toHaveAttribute("data-status", "partial");
		await expect(runs.first().getByTestId("run-answered")).toHaveText("2");

		page.on("dialog", () => {
			throw new Error("unexpected browser dialog");
		});
		await dialog.getByTestId("history-clear").click();
		await dialog.getByTestId("history-clear-no").click();
		await expect(runs).toHaveCount(1);
		await dialog.getByTestId("history-clear").click();
		await dialog.getByTestId("history-clear-yes").click();
		await expect(runs).toHaveCount(0);
		await expect(dialog.getByTestId("history-empty")).toBeVisible();
	});

	test("a finished selection is saved as a completed run", async ({ page, request }) => {
		await page.goto("/");
		const hard = (await index(page)).filter((e) => e.difficulty === "hard");
		const last = hard[hard.length - 1]?.id ?? "";
		// Every hard question but the last is already answered (from an earlier visit).
		await page.evaluate(
			([ids, k]) => {
				const answers = Object.fromEntries(ids.map((id) => [id, { alt: "a", correct: true, difficulty: "hard", at: 1 }]));
				localStorage.setItem(k, JSON.stringify({ settings: { mode: "ordered", difficulties: ["hard"] }, answers }));
			},
			[hard.slice(0, -1).map((e) => e.id), STORAGE_KEY] as const,
		);
		await page.goto("/");
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", last);
		await answer(page, await correctAlt(request, last));
		await next(page);
		await expect(page.getByTestId("finished")).toBeVisible();

		await page.getByTestId("history-open").click();
		const run = page.getByTestId("history").getByTestId("history-run").first();
		await expect(run).toHaveAttribute("data-status", "finished");
		await expect(run.getByTestId("run-accuracy")).toHaveText("100%");
		await expect(run.getByTestId("run-setup")).toContainText("Hard");
	});
});

test.describe("review", () => {
	test("collects this session's wrong answers and replays them until right", async ({ page, request, context }) => {
		await page.goto("/");
		const idx = await index(page);
		const [q1, q2, q3] = [idx[0]?.id ?? "", idx[1]?.id ?? "", idx[2]?.id ?? ""];
		const badge = page.getByTestId("review-count");
		await expect(badge).toBeHidden();

		await answerWrong(page, request);
		await next(page);
		await answer(page, await correctAlt(request, q2));
		await next(page);
		await answerWrong(page, request);
		await expect(badge).toHaveText("2");

		await page.getByTestId("review-open").click();
		const dialog = page.getByTestId("review");
		await expect(dialog.getByTestId("review-item")).toHaveCount(2);
		await expect(dialog.getByTestId("review-item").nth(0)).toHaveAttribute("data-question-id", q1);
		await expect(dialog.getByTestId("review-item").nth(1)).toHaveAttribute("data-question-id", q3);
		await expect(dialog.getByTestId("review-item").first()).toContainText("Your answer");

		await dialog.getByTestId("review-start").click();
		await expect(dialog).toBeHidden();
		await expect(page.getByTestId("review-banner")).toBeVisible();
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", q1);

		await answer(page, await correctAlt(request, q1));
		await expect(badge).toHaveText("1");
		await next(page);
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", q3);
		await answerWrong(page, request);
		await expect(badge).toHaveText("1");
		// The last wrong question comes back until it is right.
		await page.getByTestId("next").click();
		await expect(page.getByTestId("verdict")).toHaveCount(0);
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", q3);
		await answer(page, await correctAlt(request, q3));
		await expect(badge).toBeHidden();
		await next(page);
		await expect(page.getByTestId("review-done")).toBeVisible();

		// Replays are not a new history run.
		await page.getByTestId("history-open").click();
		await expect(page.getByTestId("history").getByTestId("run-answered").first()).toHaveText("3");
		await page.keyboard.press("Escape");

		await page.getByTestId("review-exit").click();
		await expect(page.getByTestId("review-banner")).toBeHidden();
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", idx[3]?.id ?? "");

		// The list belongs to this browser tab's session only.
		const other = await context.newPage();
		await other.goto("/");
		await expect(other.getByTestId("review-count")).toBeHidden();
	});

	test("an empty review list says so", async ({ page }) => {
		await page.goto("/");
		await page.getByTestId("review-open").click();
		await expect(page.getByTestId("review").getByTestId("review-empty")).toBeVisible();
		await expect(page.getByTestId("review").getByTestId("review-start")).toBeHidden();
	});
});
