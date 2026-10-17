import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// axe runs on every page state in both themes and both languages; the
// chromium and mobile projects cover desktop and mobile. Serious and
// critical violations fail the test.
const themes = ["light", "dark"] as const;
const langs = ["en", "pt-BR"] as const;

async function audit(page: Page, state: string): Promise<void> {
	const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
	const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
	expect(
		blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
		`axe violations in ${state}`,
	).toEqual([]);
}

for (const theme of themes) {
	for (const lang of langs) {
		test.describe(`${theme} ${lang}`, () => {
			test.beforeEach(async ({ page }) => {
				await page.addInitScript(
					([t, l]) => localStorage.setItem("quiz:v1", JSON.stringify({ settings: { theme: t, lang: l } })),
					[theme, lang],
				);
			});

			test("question, settings, answer and 404 states", async ({ page }) => {
				await page.goto(`/?lang=${lang}`);
				await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
				await audit(page, "question");

				await page.getByTestId("settings-open").click();
				await audit(page, "settings open");
				await page.keyboard.press("Escape");

				await page.locator('#alternatives button[data-key="1"]').click();
				await expect(page.getByTestId("verdict")).toBeVisible();
				await audit(page, "answered");

				await page.goto(`/questions/does-not-exist?lang=${lang}`);
				await audit(page, "404");
			});

			test("finished card, history and review panels", async ({ page }) => {
				await page.goto(`/?lang=${lang}`);
				const hard = await page.evaluate(() =>
					(JSON.parse(document.getElementById("quiz-index")?.textContent ?? "[]") as { id: string; difficulty: string }[])
						.filter((e) => e.difficulty === "hard")
						.map((e) => e.id),
				);
				// Runs after the beforeEach init script, so this state wins.
				await page.addInitScript(
					([ids, t, l]) => {
						const answers = Object.fromEntries(ids.map((id) => [id, { alt: "a", correct: false, difficulty: "hard", at: 1 }]));
						localStorage.setItem("quiz:v1", JSON.stringify({ settings: { theme: t, lang: l, difficulties: ["hard"] }, answers }));
						sessionStorage.setItem("quiz:v1:session", JSON.stringify({ wrong: ids.slice(0, 3).map((id) => ({ id, alt: "a" })) }));
					},
					[hard, theme, lang] as const,
				);
				await page.goto(`/?lang=${lang}`);
				await expect(page.getByTestId("finished")).toBeVisible();
				await audit(page, "finished");

				await page.getByTestId("history-open").click();
				await audit(page, "history");
				await page.keyboard.press("Escape");

				await page.getByTestId("review-open").click();
				await expect(page.getByTestId("review-item")).toHaveCount(3);
				await audit(page, "review");
			});		});
	}
}
