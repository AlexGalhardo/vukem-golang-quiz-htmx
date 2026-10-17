import { describe, expect, test } from "bun:test";
import { addRun, formatDuration, HISTORY_KEY, type KeyValueStorage, loadHistory, recordAnswer, type Run, saveHistory } from "./history";

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		},
		removeItem: (k) => {
			delete data[k];
		},
	};
}

const ctx = { mode: "ordered", difficulties: ["easy", "hard"], now: 1000 } as const;

describe("recordAnswer", () => {
	test("starts a run and tallies per difficulty", () => {
		let run = recordAnswer(undefined, { ...ctx, difficulty: "easy", correct: true });
		run = recordAnswer(run, { ...ctx, difficulty: "easy", correct: false, now: 4000 });
		run = recordAnswer(run, { ...ctx, difficulty: "hard", correct: true, now: 9000 });

		expect(run).toEqual({
			startedAt: 1000,
			endedAt: 9000,
			mode: "ordered",
			difficulties: ["easy", "hard"],
			answered: 3,
			correct: 2,
			byDifficulty: { easy: { answered: 2, correct: 1 }, hard: { answered: 1, correct: 1 } },
			finished: false,
		});
	});
});

describe("storage", () => {
	const run: Run = recordAnswer(undefined, { ...ctx, difficulty: "easy", correct: true });

	test("round-trips through a versioned key", () => {
		const s = memory();
		saveHistory(s, [run]);
		expect(JSON.parse(s.data[HISTORY_KEY] ?? "")).toMatchObject({ v: 1 });
		expect(loadHistory(s)).toEqual([run]);
	});

	test("tolerates corrupt, foreign and blocked storage", () => {
		expect(loadHistory(memory({ [HISTORY_KEY]: "{not json" }))).toEqual([]);
		expect(loadHistory(memory({ [HISTORY_KEY]: '{"runs":[{"answered":-1}, 3, null]}' }))).toEqual([]);
		expect(loadHistory(undefined)).toEqual([]);
		const blocked: KeyValueStorage = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {
				throw new Error("SecurityError");
			},
		};
		expect(loadHistory(blocked)).toEqual([]);
		expect(() => saveHistory(blocked, [run])).not.toThrow();
	});

	test("an empty history removes the key", () => {
		const s = memory({ [HISTORY_KEY]: "x" });
		saveHistory(s, []);
		expect(s.data[HISTORY_KEY]).toBeUndefined();
	});
});

test("addRun keeps the newest runs first, capped", () => {
	const runs = Array.from({ length: 5 }, (_, i) => ({ ...recordAnswer(undefined, { ...ctx, difficulty: "easy", correct: true }), startedAt: i }));
	const out = addRun(runs, { ...runs[0], startedAt: 99 } as Run, 3);
	expect(out.map((r) => r.startedAt)).toEqual([99, 0, 1]);
});

test("formatDuration", () => {
	expect(formatDuration(42_000)).toBe("42 s");
	expect(formatDuration(125_000)).toBe("2 min 5 s");
	expect(formatDuration(3_725_000)).toBe("1 h 2 min");
});
