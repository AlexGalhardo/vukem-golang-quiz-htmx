import { defineConfig, devices } from "@playwright/test";

// QA suite: a crawler, human-like flows and defensive security checks
// (e2e/qa). Without QA_BASE_URL it starts two local apps: the main one and
// a second one with a tiny rate limit for the 429 check. QA_APP_CMD
// overrides how the app is started (CI passes the built binary).
//
// Read-only mode against a deployment (GET only, low request rate):
//   QA_BASE_URL=https://quiz.vukem.dev QA_READONLY=1 bun run test:qa
const external = process.env.QA_BASE_URL;
const baseURL = external ?? "http://127.0.0.1:3870";
const command = process.env.QA_APP_CMD ?? "go run -tags vukem_nosqlite ./cmd/app";
const inherited = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
const appEnv = (port: number, rateLimit: string): Record<string, string> => ({
	...inherited,
	APP_ENV: "production",
	APP_KEY: "base64:cWEtb25seS1rZXktZG8tbm90LXVzZS1pbi1wcm9kISE=",
	APP_URL: `http://127.0.0.1:${port}`,
	HOST: "127.0.0.1",
	PORT: String(port),
	RATE_LIMIT_PER_MINUTE: rateLimit,
});

export default defineConfig({
	testDir: "e2e/qa",
	outputDir: "test-results/qa",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: external ? 1 : undefined,
	timeout: 120_000,
	reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-qa" }]],
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
	webServer: external
		? undefined
		: [
				{ command, url: "http://127.0.0.1:3870/up", env: appEnv(3870, "100000"), reuseExistingServer: !process.env.CI, timeout: 180_000 },
				{ command, url: "http://127.0.0.1:3871/up", env: appEnv(3871, "5"), reuseExistingServer: !process.env.CI, timeout: 180_000 },
			],
});
