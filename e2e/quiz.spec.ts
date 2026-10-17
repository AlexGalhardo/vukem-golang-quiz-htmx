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
	await page.getByTestId("next").click();
	await expect(page.getByTestId("verdict")).toHaveCount(0);
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
	await expect(page.getByTestId("settings")).not.toHaveAttribute("open", "");
}

async function openSettings(page: Page): Promise<void> {
	const settings = page.getByTestId("settings");
	if ((await settings.getAttribute("open")) === null) await settings.locator("summary").click();
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

	test("shortcuts are ignored while a settings control has focus", async ({ page }) => {
		await page.goto("/");
		await openSettings(page);
		await page.getByTestId("mode-ordered").focus();

		await page.keyboard.press("a");

		await expect(page.getByTestId("verdict")).toHaveCount(0);
	});
});

test.describe("settings", () => {
	test("random mode follows the stored shuffled order", async ({ page, request }) => {
		await page.goto("/");
		await openSettings(page);
		await page.getByTestId("mode-random").check();

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

	test("review mode replays wrong answers, then shows the finished card", async ({ page, request }) => {
		await page.goto("/");
		const idx = await index(page);
		const wrongId = idx[0]?.id ?? "";

		await answerWrong(page, request);
		await next(page);
		await answer(page, await correctAlt(request, await currentId(page)));

		await openSettings(page);
		await page.getByTestId("review").check();
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", wrongId);

		await closeSettings(page);
		await answer(page, await correctAlt(request, wrongId));
		await next(page);

		await expect(page.getByTestId("finished")).toBeVisible();
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

		page.once("dialog", (d) => void d.dismiss());
		await page.getByTestId("reset").click();
		await expect(page.getByTestId("progress")).toHaveText(`1/${idx.length}`);

		page.once("dialog", (d) => {
			expect(d.message()).toContain("Reset all progress");
			void d.accept();
		});
		await page.getByTestId("reset").click();
		await expect(page.getByTestId("progress")).toHaveText(`0/${idx.length}`);
		await expect(page.getByTestId("accuracy")).toHaveText("–");
		await expect(page.getByTestId("question")).toHaveAttribute("data-question-id", idx[0]?.id ?? "");
		expect((await stored(page)).answers).toEqual({});
	});
});

test.describe("navbar", () => {
	test("theme toggle switches and persists without a flash", async ({ page }) => {
		await page.emulateMedia({ colorScheme: "light" });
		await page.goto("/");
		const html = page.locator("html");
		await expect(html).toHaveAttribute("data-theme", "light");

		await page.getByTestId("theme-toggle").click();
		await expect(html).toHaveAttribute("data-theme", "dark");

		await page.goto("/", { waitUntil: "commit" });
		await page.waitForFunction(() => document.documentElement.dataset.theme !== undefined);
		await expect(html).toHaveAttribute("data-theme", "dark");

		await page.getByTestId("theme-toggle").click();
		await expect(html).toHaveAttribute("data-theme", "light");
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
		await expect(page.getByTestId("settings").locator("summary")).toHaveText("Configurações");
		await expect(page.getByTestId("lang-pt-BR")).toHaveAttribute("aria-current", "true");

		await page.goto("/");
		await expect(page).toHaveURL(/lang=pt-BR/);
		await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

		await page.getByTestId("lang-en").click();
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.getByTestId("settings").locator("summary")).toHaveText("Settings");
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
});
