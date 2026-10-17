// Quiz run history, kept in localStorage under its own versioned key. A run
// starts with the first answer after a reset (or the first visit) and is
// saved when the selection is finished or progress is reset.

export type Difficulty = "very-easy" | "easy" | "medium" | "hard" | "very-hard";
export type Mode = "ordered" | "random";

export const DIFFICULTIES: readonly Difficulty[] = ["very-easy", "easy", "medium", "hard", "very-hard"];
export const HISTORY_KEY = "quiz:v1:history";
export const HISTORY_CAP = 200;

export interface Tally {
	answered: number;
	correct: number;
}

export interface Run {
	startedAt: number;
	endedAt: number;
	mode: Mode;
	difficulties: Difficulty[];
	answered: number;
	correct: number;
	byDifficulty: Partial<Record<Difficulty, Tally>>;
	// false when the run was cut short by a reset.
	finished: boolean;
}

export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const isDifficulty = (v: unknown): v is Difficulty => typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

// parseRun accepts only well-formed runs; anything else (old versions,
// hand-edited storage) is dropped rather than shown half-broken.
export function parseRun(v: unknown): Run | undefined {
	if (typeof v !== "object" || v === null) return undefined;
	const r = v as Record<string, unknown>;
	if (typeof r.startedAt !== "number" || typeof r.endedAt !== "number") return undefined;
	if (!isCount(r.answered) || !isCount(r.correct) || r.correct > r.answered) return undefined;

	const byDifficulty: Partial<Record<Difficulty, Tally>> = {};
	if (typeof r.byDifficulty === "object" && r.byDifficulty !== null) {
		for (const [d, t] of Object.entries(r.byDifficulty as Record<string, unknown>)) {
			const tally = t as Partial<Tally> | null;
			if (isDifficulty(d) && tally && isCount(tally.answered) && isCount(tally.correct)) {
				byDifficulty[d] = { answered: tally.answered, correct: tally.correct };
			}
		}
	}

	return {
		startedAt: r.startedAt,
		endedAt: r.endedAt,
		mode: r.mode === "random" ? "random" : "ordered",
		difficulties: Array.isArray(r.difficulties) ? r.difficulties.filter(isDifficulty) : [],
		answered: r.answered,
		correct: r.correct,
		byDifficulty,
		finished: r.finished === true,
	};
}

export function loadHistory(storage: KeyValueStorage | undefined): Run[] {
	try {
		const raw: unknown = JSON.parse(storage?.getItem(HISTORY_KEY) ?? "{}");
		const runs = (raw as { runs?: unknown } | null)?.runs;
		if (!Array.isArray(runs)) return [];
		return runs.map(parseRun).filter((r): r is Run => r !== undefined);
	} catch {
		return [];
	}
}

export function saveHistory(storage: KeyValueStorage | undefined, runs: Run[]): void {
	try {
		if (runs.length === 0) storage?.removeItem(HISTORY_KEY);
		else storage?.setItem(HISTORY_KEY, JSON.stringify({ v: 1, runs }));
	} catch {
		// Storage full or blocked: history is best effort.
	}
}

// addRun puts run first (newest first) and keeps at most cap runs.
export function addRun(runs: Run[], run: Run, cap = HISTORY_CAP): Run[] {
	return [run, ...runs].slice(0, cap);
}

export interface AnswerContext {
	mode: Mode;
	difficulties: readonly Difficulty[];
	difficulty: Difficulty;
	correct: boolean;
	now: number;
}

// recordAnswer returns the current run updated with one answer, starting a
// new run when there is none.
export function recordAnswer(run: Run | undefined, a: AnswerContext): Run {
	const base: Run = run ?? {
		startedAt: a.now,
		endedAt: a.now,
		mode: a.mode,
		difficulties: [...a.difficulties],
		answered: 0,
		correct: 0,
		byDifficulty: {},
		finished: false,
	};
	const tally = base.byDifficulty[a.difficulty] ?? { answered: 0, correct: 0 };

	return {
		...base,
		endedAt: a.now,
		answered: base.answered + 1,
		correct: base.correct + (a.correct ? 1 : 0),
		byDifficulty: { ...base.byDifficulty, [a.difficulty]: { answered: tally.answered + 1, correct: tally.correct + (a.correct ? 1 : 0) } },
	};
}

export function percent(n: number, total: number): string {
	return total === 0 ? "–" : `${Math.round((n / total) * 100)}%`;
}

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h} h ${m} min`;
	return m > 0 ? `${m} min ${s} s` : `${s} s`;
}
