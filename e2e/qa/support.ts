import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

export const READONLY = process.env.QA_READONLY === "1";
export const THEMES = ["light", "dark"] as const;
export const LANGS = ["en", "pt-BR"] as const;
export type Theme = (typeof THEMES)[number];
export type Lang = (typeof LANGS)[number];

// skipIfReadonly marks a check that writes client state, needs the second
// (rate-limited) local app, or sends many requests: skipped against a
// deployment.
export function skipIfReadonly(): void {
	test.skip(READONLY, "read-only run against a deployment");
}

export interface Problems {
	pageErrors: string[];
	consoleErrors: string[];
	failedRequests: string[];
	dialogs: string[];
}

// watch records everything a QA check treats as a bug: uncaught errors,
// console errors (CSP violations are reported there too), same-origin
// responses >= 400 and failed requests, and any JS dialog. allowStatus lists
// same-origin paths expected to fail (e.g. a deliberate 404).
export function watch(page: Page, allowStatus: (url: URL, status: number) => boolean = () => false): Problems {
	const p: Problems = { pageErrors: [], consoleErrors: [], failedRequests: [], dialogs: [] };
	const origin = (): string => new URL(page.url() === "about:blank" ? "http://x" : page.url()).origin;

	page.on("pageerror", (e) => p.pageErrors.push(e.message));
	page.on("console", (m) => {
		if (m.type() !== "error") return;
		const text = m.text();
		// The browser logs the 404 a test asked for; the response check owns it.
		if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
		p.consoleErrors.push(text);
	});
	page.on("dialog", (d) => {
		p.dialogs.push(`${d.type()}: ${d.message()}`);
		void d.dismiss();
	});
	page.on("response", (r) => {
		const url = new URL(r.url());
		if (url.origin !== origin() || r.status() < 400 || allowStatus(url, r.status())) return;
		p.failedRequests.push(`${r.status()} ${r.request().method()} ${url.pathname}${url.search}`);
	});
	page.on("requestfailed", (r) => {
		const url = new URL(r.url());
		// Navigations away abort in-flight fragment loads; that is not a failure.
		if (url.origin !== origin() || r.failure()?.errorText.includes("ERR_ABORTED")) return;
		p.failedRequests.push(`failed ${r.method()} ${url.pathname}: ${r.failure()?.errorText ?? ""}`);
	});

	return p;
}

export function expectClean(p: Problems, where: string): void {
	expect.soft(p.pageErrors, `${where}: uncaught errors`).toEqual([]);
	expect.soft(p.consoleErrors, `${where}: console errors / CSP violations`).toEqual([]);
	expect.soft(p.failedRequests, `${where}: failed same-origin requests`).toEqual([]);
	expect.soft(p.dialogs, `${where}: unexpected dialogs`).toEqual([]);
}

// CSP violations also fire a DOM event; collect them in the page so a check
// can read them even when the console is noisy.
export async function trackCSP(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __csp: string[] };
		w.__csp = [];
		document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
	});
}

export async function cspViolations(page: Page): Promise<string[]> {
	return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

export async function prefs(page: Page, theme: Theme, lang: Lang): Promise<void> {
	await page.addInitScript(
		([t, l]) => {
			try {
				if (!localStorage.getItem("quiz:v1")) localStorage.setItem("quiz:v1", JSON.stringify({ settings: { theme: t, lang: l } }));
			} catch {
				// storage blocked by the test itself
			}
		},
		[theme, lang] as const,
	);
}

export async function axe(page: Page, where: string): Promise<void> {
	const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
	const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
	expect.soft(blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `${where}: axe`).toEqual([]);
}

// brokenImages returns <img> elements that failed to load.
export async function brokenImages(page: Page): Promise<string[]> {
	return page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
}

// focusRingMissing tabs through the page and returns the focusable elements
// that show no visible focus indicator (outline or box-shadow).
export async function focusRingMissing(page: Page, maxTabs = 40): Promise<string[]> {
	const missing = new Set<string>();
	await page.locator("body").focus();
	for (let i = 0; i < maxTabs; i++) {
		await page.keyboard.press("Tab");
		const info = await page.evaluate(() => {
			const el = document.activeElement as HTMLElement | null;
			if (!el || el === document.body) return null;
			const s = getComputedStyle(el);
			const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
			const id = el.dataset.testid ?? el.id ?? "";
			return { visible, name: `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"` };
		});
		if (info && !info.visible) missing.add(info.name);
	}
	return [...missing];
}

export interface IndexEntry {
	id: string;
	difficulty: string;
}

export async function index(page: Page): Promise<IndexEntry[]> {
	return page.evaluate(() => JSON.parse(document.getElementById("quiz-index")?.textContent ?? "[]") as IndexEntry[]);
}

export async function currentId(page: Page): Promise<string> {
	return (await page.getByTestId("question").getAttribute("data-question-id")) ?? "";
}
