import { expect, test } from "@playwright/test";

test("health endpoint answers ok", async ({ request }) => {
	const res = await request.get("/up");
	expect(res.ok()).toBeTruthy();
	expect(await res.json()).toEqual({ status: "ok" });
});

test("quiz page renders with htmx and no console errors", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(err.message));

	await page.goto("/");

	await expect(page.getByTestId("quiz-grid")).toBeVisible();
	await expect.poll(() => page.evaluate(() => typeof (window as { htmx?: unknown }).htmx)).toBe("object");
	expect(errors).toEqual([]);
});
