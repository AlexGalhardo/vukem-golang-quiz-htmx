import { expect, test } from "bun:test";
import type { KeyValueStorage } from "./history";
import { emptySession, itemsParam, loadSession, nextInReview, recordAnswer, SESSION_KEY, saveSession } from "./review";

function memory(initial: Record<string, string> = {}): KeyValueStorage {
	const data = { ...initial };
	return {
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		},
		removeItem: (k) => {
			delete data[k];
		},
	};
}

test("wrong answers are kept, updated in place and dropped once right", () => {
	let s = recordAnswer(emptySession(), "q1", "a", false);
	s = recordAnswer(s, "q2", "b", true);
	s = recordAnswer(s, "q3", "c", false);
	s = recordAnswer(s, "q1", "d", false);
	expect(s.wrong).toEqual([
		{ id: "q1", alt: "d" },
		{ id: "q3", alt: "c" },
	]);
	expect(itemsParam(s)).toBe("q1:d,q3:c");
	expect(recordAnswer(s, "q1", "e", true).wrong).toEqual([{ id: "q3", alt: "c" }]);
});

test("next in review wraps and repeats the last one", () => {
	const s = { reviewing: true, wrong: ["a1", "b2", "c3"].map((id) => ({ id, alt: "a" })) };
	expect(nextInReview(s, undefined)).toBe("a1");
	expect(nextInReview(s, "b2")).toBe("c3");
	expect(nextInReview(s, "c3")).toBe("a1");
	expect(nextInReview(s, "gone")).toBe("a1");
	expect(nextInReview({ reviewing: true, wrong: [{ id: "a1", alt: "a" }] }, "a1")).toBe("a1");
	expect(nextInReview(emptySession(), "a1")).toBeUndefined();
});

test("session storage round-trips and rejects junk", () => {
	const store = memory();
	saveSession(store, { reviewing: true, wrong: [{ id: "q1", alt: "b" }] });
	expect(loadSession(store)).toEqual({ reviewing: true, wrong: [{ id: "q1", alt: "b" }] });

	const junk = memory({ [SESSION_KEY]: '{"reviewing":true,"wrong":[{"id":"<x>","alt":"a"},{"id":"ok","alt":"z"},7]}' });
	expect(loadSession(junk)).toEqual({ reviewing: false, wrong: [] });
	expect(loadSession(memory({ [SESSION_KEY]: "{" }))).toEqual(emptySession());
	expect(loadSession(undefined)).toEqual(emptySession());
});
