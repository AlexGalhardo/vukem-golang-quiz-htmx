// Client state for the quiz. The server is stateless: it renders questions
// and answers as htmx fragments, while progress, statistics and settings
// live here, in localStorage. Loaded by the layout through Vite.

import {
	addRun,
	type Difficulty,
	DIFFICULTIES,
	formatDuration,
	isDifficulty,
	loadHistory,
	type Mode,
	parseRun,
	percent,
	recordAnswer,
	type Run,
	saveHistory,
} from "./history";
import { emptySession, itemsParam, loadSession, nextInReview, recordAnswer as recordReview, type Session, saveSession } from "./review";

type Theme = "light" | "dark" | "system";

interface IndexEntry {
	id: string;
	difficulty: Difficulty;
}

interface Answer {
	alt: string;
	correct: boolean;
	difficulty: Difficulty;
	at: number;
}

interface Settings {
	theme?: Theme;
	lang?: string;
	mode: Mode;
	difficulties: Difficulty[];
}

interface State {
	settings: Settings;
	answers: Record<string, Answer>;
	// Shuffled ids for random mode, kept so the order survives reloads.
	order: string[];
	// The run in progress (history), saved to the history when it ends.
	run?: Run;
}

interface AnsweredDetail {
	id: string;
	alt: string;
	correct: boolean;
	difficulty: Difficulty;
}

interface Htmx {
	ajax(verb: string, path: string, options: { target: string; swap?: string }): Promise<void>;
}

const STORAGE_KEY = "quiz:v1";
const LOCALES = ["en", "pt-BR"];


function defaultState(): State {
	return { settings: { mode: "ordered", difficulties: [...DIFFICULTIES] }, answers: {}, order: [] };
}

// Storage can be missing, full or corrupted (another tab, an old version, a
// privacy mode): every read goes through this guarded parser and falls back
// to defaults field by field.
function loadState(): State {
	const state = defaultState();
	let raw: unknown;

	try {
		raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
	} catch {
		return state;
	}

	if (typeof raw !== "object" || raw === null) return state;

	const r = raw as Record<string, unknown>;
	const s = (typeof r.settings === "object" && r.settings !== null ? r.settings : {}) as Record<string, unknown>;

	if (s.theme === "light" || s.theme === "dark" || s.theme === "system") state.settings.theme = s.theme;
	if (typeof s.lang === "string" && LOCALES.includes(s.lang)) state.settings.lang = s.lang;
	if (s.mode === "random") state.settings.mode = "random";
	if (Array.isArray(s.difficulties)) {
		const ds = s.difficulties.filter(isDifficulty);
		if (ds.length > 0) state.settings.difficulties = ds;
	}
	// settings.review (the old "review only wrong answers" switch) is gone:
	// the Review panel replays this session's wrong answers instead.

	if (typeof r.answers === "object" && r.answers !== null) {
		for (const [id, v] of Object.entries(r.answers as Record<string, unknown>)) {
			const a = v as Partial<Answer> | null;
			if (a && typeof a.alt === "string" && typeof a.correct === "boolean" && isDifficulty(a.difficulty)) {
				state.answers[id] = { alt: a.alt, correct: a.correct, difficulty: a.difficulty, at: Number(a.at) || 0 };
			}
		}
	}

	if (Array.isArray(r.order)) state.order = r.order.filter((x): x is string => typeof x === "string");
	state.run = parseRun(r.run);

	return state;
}

function saveState(state: State): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage full or disabled: the quiz still works for this visit.
	}
}

function readIndex(): IndexEntry[] {
	const el = document.getElementById("quiz-index");
	if (!el?.textContent) return [];

	try {
		const data: unknown = JSON.parse(el.textContent);
		if (!Array.isArray(data)) return [];
		return data.filter(
			(e): e is IndexEntry => typeof e === "object" && e !== null && typeof e.id === "string" && isDifficulty(e.difficulty),
		);
	} catch {
		return [];
	}
}

function shuffle<T>(items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j] as T, out[i] as T];
	}
	return out;
}

class Quiz {
	private state = loadState();
	private session: Session = loadSession(sessionStore());
	// The question the latest load asked for; undefined once finished.
	private wanted: string | undefined;
	private readonly index = readIndex();
	// The layout loads htmx before this module (both deferred, in order).
	private readonly htmx = (window as unknown as { htmx?: Htmx }).htmx;

	start(): void {
		if (this.index.length === 0) return;

		if (this.syncLanguage()) return;

		this.syncRandomOrder();
		this.applyTheme();
		this.renderReview();
		this.renderSettings();
		this.renderStats();
		this.bindEvents();

		// "/" always renders the easiest question; move to where the user is.
		// The entry remembers its question so Back can return to it.
		const current = this.currentId();
		if (current && window.history.state === null) window.history.replaceState({ id: current }, "");
		if (location.pathname === "/" && current && !this.isNext(current)) {
			this.goNext(true);
		}
	}

	// The locale comes from ?lang= (D20). A stored choice wins over the
	// browser default; an explicit ?lang= in the URL becomes the stored one.
	private syncLanguage(): boolean {
		const url = new URL(location.href);
		const fromURL = url.searchParams.get("lang");
		const page = document.documentElement.lang;

		if (fromURL && LOCALES.includes(fromURL)) {
			this.update((s) => (s.settings.lang = fromURL));
			return false;
		}

		const stored = this.state.settings.lang;
		if (stored && stored !== page) {
			url.searchParams.set("lang", stored);
			location.replace(url.toString());
			return true;
		}

		return false;
	}

	private get lang(): string {
		return this.state.settings.lang ?? (document.documentElement.lang || "en");
	}

	private update(fn: (s: State) => void): void {
		fn(this.state);
		saveState(this.state);
	}

	private syncRandomOrder(): void {
		const ids = this.index.map((e) => e.id);
		const known = new Set(ids);
		const order = this.state.order.filter((id) => known.has(id));
		const missing = ids.filter((id) => !order.includes(id));

		if (missing.length > 0 || order.length !== this.state.order.length) {
			this.update((s) => (s.order = [...order, ...shuffle(missing)]));
		}
	}

	private selection(): IndexEntry[] {
		const allowed = new Set(this.state.settings.difficulties);
		const base =
			this.state.settings.mode === "random"
				? this.state.order.map((id) => this.index.find((e) => e.id === id)).filter((e): e is IndexEntry => !!e)
				: this.index;
		return base.filter((e) => allowed.has(e.difficulty));
	}

	// The queue: unanswered questions of the selection, or the wrong ones in
	// review mode.
	private queue(): string[] {
		if (this.session.reviewing) return this.session.wrong.map((w) => w.id);
		const sel = this.selection();
		return sel.filter((e) => !this.state.answers[e.id]).map((e) => e.id);
	}

	private currentId(): string | undefined {
		return document.querySelector<HTMLElement>("#question[data-question-id]")?.dataset.questionId;
	}

	private isNext(id: string): boolean {
		return this.queue()[0] === id;
	}

	private nextId(): string | undefined {
		const current = this.currentId();
		if (this.session.reviewing) return nextInReview(this.session, current);
		const queue = this.queue();
		if (queue.length === 0) return undefined;
		if (!current) return queue[0];

		// Continue after the current question in selection order, wrapping.
		const sel = this.selection().map((e) => e.id);
		const pos = sel.indexOf(current);
		const after = sel.slice(pos + 1).concat(sel.slice(0, pos + 1));
		return after.find((id) => queue.includes(id) && id !== current) ?? (queue.includes(current) ? undefined : queue[0]);
	}

	private goNext(replace = false): void {
		const id = this.nextId();
		if (!id) {
			this.showFinished();
			return;
		}
		this.load(id, replace ? "replace" : "push");
	}

	private load(id: string, history: "push" | "replace" | "none"): void {
		if (!this.htmx) {
			location.href = `/questions/${encodeURIComponent(id)}?lang=${this.lang}`;
			return;
		}

		this.wanted = id;
		const path = `/questions/${encodeURIComponent(id)}`;
		void this.htmx.ajax("GET", `${path}?lang=${encodeURIComponent(this.lang)}`, { target: "#quiz", swap: "innerHTML" }).then(() => {
			// Fast setting changes start overlapping loads that can finish out
			// of order; whichever lands last must show the latest choice.
			if (this.wanted !== id) {
				if (this.wanted === undefined) this.showFinished();
				else if (this.currentId() !== this.wanted) this.load(this.wanted, "none");
				return;
			}
			if (history === "push") window.history.pushState({ id }, "", `${path}${location.search}`);
			if (history === "replace") window.history.replaceState({ id }, "", `${path}${location.search}`);
			document.getElementById("question-title")?.focus({ preventScroll: true });
			window.scrollTo({ top: 0 });
		});
	}

	private showFinished(): void {
		this.wanted = undefined;
		if (!this.session.reviewing) this.endRun(true);
		const tpl = document.getElementById(this.session.reviewing ? "review-finished" : "quiz-finished") as HTMLTemplateElement | null;
		const quiz = document.getElementById("quiz");
		if (!tpl || !quiz) return;
		quiz.replaceChildren(tpl.content.cloneNode(true));
		quiz.querySelector<HTMLElement>("h1")?.focus();
	}

	private renderStats(): void {
		const sel = this.selection();
		const answered = sel.filter((e) => this.state.answers[e.id]);
		const correct = answered.filter((e) => this.state.answers[e.id]?.correct);

		this.setStat("progress", `${answered.length}/${sel.length}`);
		this.setStat("accuracy", percent(correct.length, answered.length));

		for (const d of DIFFICULTIES) {
			const all = Object.values(this.state.answers).filter((a) => a.difficulty === d);
			const ok = all.filter((a) => a.correct).length;
			this.setStat(`accuracy-${d}`, all.length ? `${percent(ok, all.length)} (${ok}/${all.length})` : "–");
		}
	}

	private setStat(name: string, value: string): void {
		const el = document.querySelector(`[data-stat="${name}"]`);
		if (el) el.textContent = value;
	}

	private renderSettings(): void {
		const s = this.state.settings;
		for (const input of document.querySelectorAll<HTMLInputElement>("input[data-setting]")) {
			switch (input.dataset.setting) {
				case "mode":
					input.checked = input.value === s.mode;
					break;
				case "difficulty":
					input.checked = s.difficulties.includes(input.value as Difficulty);
					break;
			}
		}
	}

	private onSettingChange(input: HTMLInputElement): void {
		this.update((s) => {
			switch (input.dataset.setting) {
				case "mode":
					s.settings.mode = input.value === "random" ? "random" : "ordered";
					break;
				case "difficulty": {
					const checked = [...document.querySelectorAll<HTMLInputElement>('input[data-setting="difficulty"]:checked')]
						.map((i) => i.value)
						.filter(isDifficulty);
					if (checked.length === 0) {
						input.checked = true; // at least one difficulty stays selected
						return;
					}
					s.settings.difficulties = checked;
					break;
				}
			}
		});

		this.renderStats();

		const current = this.currentId();
		const answered = document.getElementById("alternatives")?.dataset.answered === "true";
		if (!current || answered || !this.queue().includes(current)) this.goNext();
	}

	// Reset asks inline (no window.confirm): the button gives way to Yes/Cancel.
	private askReset(ask: boolean, focus = true): void {
		const button = document.querySelector<HTMLElement>('[data-testid="reset"]');
		const confirm = document.querySelector<HTMLElement>('[data-testid="reset-confirm"]');
		if (button) button.hidden = ask;
		if (confirm) confirm.hidden = !ask;
		if (focus) (ask ? confirm?.querySelector<HTMLElement>('[data-action="reset-no"]') : button)?.focus();
	}

	private reset(): void {
		this.askReset(false);
		this.endRun(false);
		this.setSession(emptySession());
		this.update((s) => {
			s.answers = {};
			s.order = shuffle(this.index.map((e) => e.id));
		});
		this.renderSettings();
		this.renderStats();
		const first = this.queue()[0];
		if (first) this.load(first, "push");
	}

	private setSession(s: Session): void {
		this.session = s;
		saveSession(sessionStore(), s);
		this.renderReview();
	}

	private renderReview(): void {
		const n = this.session.wrong.length;
		const badge = document.querySelector<HTMLElement>('[data-testid="review-count"]');
		if (badge) {
			badge.textContent = String(n);
			badge.hidden = n === 0;
		}
		setHidden('[data-testid="review-banner"]', !this.session.reviewing);
		setHidden('[data-testid="review-empty"]', n > 0);
		setHidden('[data-testid="review-start"]', n === 0);
	}

	private loadReviewList(): void {
		const list = document.getElementById("review-list");
		if (!list) return;
		list.replaceChildren();
		this.renderReview();
		if (this.session.wrong.length === 0 || !this.htmx) return;
		const q = new URLSearchParams({ lang: this.lang, items: itemsParam(this.session) });
		void this.htmx.ajax("GET", `/review?${q.toString()}`, { target: "#review-list", swap: "innerHTML" });
	}

	// endRun moves the run in progress (if it has answers) to the history.
	private endRun(finished: boolean): void {
		const run = this.state.run;
		if (!run || run.answered === 0) return;
		saveHistory(storage(), addRun(loadHistory(storage()), { ...run, finished }));
		this.update((s) => delete s.run);
	}

	private renderHistory(): void {
		const list = document.querySelector<HTMLElement>('[data-testid="history-list"]');
		const tpl = document.getElementById("history-run-tpl") as HTMLTemplateElement | null;
		if (!list || !tpl) return;

		const saved = loadHistory(storage());
		const runs: { run: Run; status: "progress" | "finished" | "partial" }[] = saved.map((run) => ({ run, status: run.finished ? "finished" : "partial" }));
		if (this.state.run && this.state.run.answered > 0) runs.unshift({ run: this.state.run, status: "progress" });

		const date = new Intl.DateTimeFormat(this.lang, { dateStyle: "medium", timeStyle: "short" });
		list.replaceChildren(
			...runs.map(({ run, status }) => {
				const li = (tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
				const field = (name: string): HTMLElement | null => li.querySelector(`[data-testid="${name}"], [data-field="${name}"]`);
				li.dataset.status = status;
				const time = field("date");
				if (time) {
					time.textContent = date.format(run.startedAt);
					time.setAttribute("datetime", new Date(run.startedAt).toISOString());
				}
				for (const el of li.querySelectorAll<HTMLElement>("[data-status-label]")) if (el.dataset.statusLabel !== status) el.remove();
				const badge = field("status");
				badge?.classList.add(...(status === "progress" ? ["bg-indigo-100", "text-indigo-800", "dark:bg-indigo-950", "dark:text-indigo-200"] : status === "finished" ? ["bg-green-100", "text-green-800", "dark:bg-green-950", "dark:text-green-200"] : ["bg-zinc-100", "text-zinc-700", "dark:bg-zinc-800", "dark:text-zinc-300"]));
				const set = (name: string, value: string): void => {
					const el = field(name);
					if (el) el.textContent = value;
				};
				set("run-accuracy", percent(run.correct, run.answered));
				set("run-answered", String(run.answered));
				set("run-correct", String(run.correct));
				set("run-wrong", String(run.answered - run.correct));
				set("run-duration", formatDuration(run.endedAt - run.startedAt));
				for (const el of li.querySelectorAll<HTMLElement>("[data-mode-label]")) if (el.dataset.modeLabel !== run.mode) el.remove();

				const names: string[] = [];
				for (const row of li.querySelectorAll<HTMLElement>("li[data-difficulty]")) {
					const d = row.dataset.difficulty as Difficulty;
					const name = row.querySelector("[data-difficulty-name]")?.textContent ?? d;
					if (run.difficulties.includes(d)) names.push(name);
					const t = run.byDifficulty[d];
					if (!t) {
						row.remove();
						continue;
					}
					const acc = row.querySelector<HTMLElement>('[data-field="acc"]');
					if (acc) acc.textContent = `${percent(t.correct, t.answered)} (${t.correct}/${t.answered})`;
				}
				set("difficulties", names.join(", "));
				return li;
			}),
		);

		setHidden('[data-testid="history-empty"]', runs.length > 0);
		setHidden('[data-testid="history-actions"]', saved.length === 0);
		this.askClearHistory(false, false);
	}

	private askClearHistory(ask: boolean, focus = true): void {
		const button = document.querySelector<HTMLElement>('[data-testid="history-clear"]');
		const confirm = document.querySelector<HTMLElement>('[data-testid="history-clear-confirm"]');
		if (button) button.hidden = ask;
		if (confirm) confirm.hidden = !ask;
		if (focus) (ask ? confirm?.querySelector<HTMLElement>('[data-action="history-clear-no"]') : button)?.focus();
	}

	// "system" (the default) follows prefers-color-scheme, live.
	private readonly darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

	private get theme(): Theme {
		return this.state.settings.theme ?? "system";
	}

	private applyTheme(): void {
		const choice = this.theme;
		const resolved = choice === "system" ? (this.darkQuery.matches ? "dark" : "light") : choice;
		document.documentElement.dataset.theme = resolved;
		for (const b of document.querySelectorAll<HTMLElement>("[data-theme-choice]")) {
			const on = b.dataset.themeChoice === choice;
			b.setAttribute("aria-checked", String(on));
			b.tabIndex = on ? 0 : -1;
		}
	}

	private setTheme(choice: Theme, focus = false): void {
		this.update((s) => (s.settings.theme = choice));
		this.applyTheme();
		if (focus) document.querySelector<HTMLElement>(`[data-theme-choice="${choice}"]`)?.focus();
	}

	// Arrow keys move the choice inside the radiogroup (WAI-ARIA radio pattern).
	private onThemeKey(e: KeyboardEvent, current: HTMLElement): void {
		const order: Theme[] = ["light", "dark", "system"];
		const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
		if (step === 0) return;
		e.preventDefault();
		const i = order.indexOf(current.dataset.themeChoice as Theme);
		this.setTheme(order[(i + step + order.length) % order.length] ?? "system", true);
	}

	private bindEvents(): void {
		document.body.addEventListener("quiz:answered", (e) => {
			const d = (e as CustomEvent<AnsweredDetail>).detail;
			if (!d || typeof d.id !== "string" || !isDifficulty(d.difficulty)) return;
			const now = Date.now();
			this.update((s) => {
				s.answers[d.id] = { alt: d.alt, correct: d.correct === true, difficulty: d.difficulty, at: now };
				// Replaying wrong answers is not a new run.
				if (!this.session.reviewing) {
					s.run = recordAnswer(s.run, { mode: s.settings.mode, difficulties: s.settings.difficulties, difficulty: d.difficulty, correct: d.correct === true, now });
				}
			});
			this.setSession(recordReview(this.session, d.id, d.alt, d.correct === true));
			this.renderStats();
			document.querySelector<HTMLElement>('[data-action="next"]')?.focus({ preventScroll: true });
		});

		document.addEventListener("click", (e) => {
			// A click on the backdrop lands on the <dialog> itself: close it.
			if (e.target instanceof HTMLDialogElement && e.target.open) {
				e.target.close();
				return;
			}

			const choice = (e.target as Element | null)?.closest<HTMLElement>("[data-theme-choice]");
			if (choice) {
				this.setTheme(choice.dataset.themeChoice as Theme);
				return;
			}

			const target = (e.target as Element | null)?.closest<HTMLElement>("[data-action], a[data-lang]");
			if (!target) return;

			if (target.matches("a[data-lang]")) {
				const lang = target.dataset.lang;
				if (lang && LOCALES.includes(lang)) this.update((s) => (s.settings.lang = lang));
				return; // the link reloads the page with ?lang=
			}

			switch (target.dataset.action) {
				case "next":
					this.goNext();
					break;
				case "open-dialog":
					this.openDialog(target.dataset.dialog ?? "");
					break;
				case "close-dialog":
					target.closest("dialog")?.close();
					break;
				case "reset":
					this.askReset(true);
					break;
				case "reset-no":
					this.askReset(false);
					break;
				case "reset-yes":
					this.reset();
					break;
				case "review-start":
					target.closest("dialog")?.close();
					this.setSession({ ...this.session, reviewing: true });
					this.goNext();
					break;
				case "review-exit":
					this.setSession({ ...this.session, reviewing: false });
					this.goNext();
					break;
				case "history-clear":
					this.askClearHistory(true);
					break;
				case "history-clear-no":
					this.askClearHistory(false);
					break;
				case "history-clear-yes":
					saveHistory(storage(), []);
					this.renderHistory();
					document.querySelector<HTMLElement>("#history [data-action=close-dialog]")?.focus();
					break;
			}
		});

		document.addEventListener("change", (e) => {
			const input = e.target as HTMLInputElement | null;
			if (input?.matches("input[data-setting]")) this.onSettingChange(input);
		});

		document.addEventListener("keydown", (e) => {
			const choice = (e.target as Element | null)?.closest<HTMLElement>("[data-theme-choice]");
			if (choice) this.onThemeKey(e, choice);
			else this.onKey(e);
		});
		this.darkQuery.addEventListener("change", () => this.applyTheme());

		window.addEventListener("popstate", (e) => {
			const fromState = (e.state as { id?: unknown } | null)?.id;
			const m = /^\/questions\/([a-z0-9-]+)$/.exec(location.pathname);
			const id = typeof fromState === "string" ? fromState : m?.[1];
			if (id) this.load(id, "none");
		});
	}

	private openDialog(id: string): void {
		const dialog = document.getElementById(id);
		if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
		if (id === "settings") this.askReset(false, false);
		if (id === "history") this.renderHistory();
		if (id === "review") this.loadReviewList();
		dialog.showModal();
	}

	private onKey(e: KeyboardEvent): void {
		if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
		const t = e.target as HTMLElement | null;

		// Shortcuts belong to the quiz, not to open panels (Escape closes them natively).
		if (document.querySelector("dialog[open]")) return;
		if (t?.closest("input, select, textarea, [contenteditable]")) return;

		const key = e.key.toLowerCase();
		const num = "12345".indexOf(key) + 1 || "abcde".indexOf(key) + 1;
		if (num > 0) {
			const button = document.querySelector<HTMLButtonElement>(`#alternatives button[data-key="${num}"]:not([disabled])`);
			if (button) {
				e.preventDefault();
				button.click();
			}
			return;
		}

		if (key === "enter") {
			const next = document.querySelector<HTMLButtonElement>('[data-action="next"]');
			if (next && t !== next) {
				e.preventDefault();
				next.click();
			}
		}
	}
}


new Quiz().start();

// storage returns localStorage, or undefined where touching it throws
// (blocked storage, sandboxed frames).
function storage(): Storage | undefined {
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function sessionStore(): Storage | undefined {
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}

// setHidden uses the hidden attribute, which wins over Tailwind display
// utilities (preflight makes [hidden] display:none !important).
function setHidden(selector: string, hidden: boolean): void {
	const el = document.querySelector<HTMLElement>(selector);
	if (el) el.hidden = hidden;
}
