import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL points the suite at an already running app (Docker, staging);
// otherwise Playwright starts the Go app itself.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
	testDir: "e2e",
	// The human-like QA suite has its own config (playwright.qa.config.ts).
	testIgnore: "qa/**",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL,
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: "go run ./cmd/app",
				url: `${baseURL}/up`,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
			},
});
