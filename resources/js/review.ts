// Wrong answers of the current browser session (sessionStorage), for the
// Review panel and its "redo" mode.

import type { KeyValueStorage } from "./history";

export const SESSION_KEY = "quiz:v1:session";

export interface Wrong {
	id: string;
	alt: string;
}

export interface Session {
	wrong: Wrong[];
	// true while the quiz replays only the wrong answers.
	reviewing: boolean;
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALT = /^[a-e]$/;

export function emptySession(): Session {
	return { wrong: [], reviewing: false };
}

export function loadSession(storage: KeyValueStorage | undefined): Session {
	try {
		const raw = JSON.parse(storage?.getItem(SESSION_KEY) ?? "{}") as { wrong?: unknown; reviewing?: unknown } | null;
		const wrong = Array.isArray(raw?.wrong)
			? raw.wrong.filter((w): w is Wrong => typeof w === "object" && w !== null && ID.test(String(w.id)) && ALT.test(String(w.alt)))
			: [];
		return { wrong: wrong.map(({ id, alt }) => ({ id, alt })), reviewing: raw?.reviewing === true && wrong.length > 0 };
	} catch {
		return emptySession();
	}
}

export function saveSession(storage: KeyValueStorage | undefined, s: Session): void {
	try {
		storage?.setItem(SESSION_KEY, JSON.stringify({ v: 1, ...s }));
	} catch {
		// Blocked storage: the list lives only for this page view.
	}
}

// recordAnswer keeps a wrong answer in the list (updating the chosen
// alternative in place) and drops the question once it is answered right.
export function recordAnswer(s: Session, id: string, alt: string, correct: boolean): Session {
	if (correct) return { ...s, wrong: s.wrong.filter((w) => w.id !== id) };
	if (s.wrong.some((w) => w.id === id)) return { ...s, wrong: s.wrong.map((w) => (w.id === id ? { id, alt } : w)) };
	return { ...s, wrong: [...s.wrong, { id, alt }] };
}

// itemsParam is the ?items= value the /review fragment expects.
export function itemsParam(s: Session): string {
	return s.wrong.map((w) => `${w.id}:${w.alt}`).join(",");
}

// nextInReview is the question after current in the list, wrapping; the
// current one again when it is the only one left.
export function nextInReview(s: Session, current: string | undefined): string | undefined {
	const ids = s.wrong.map((w) => w.id);
	if (ids.length === 0) return undefined;
	const pos = current ? ids.indexOf(current) : -1;
	if (pos === -1) return ids[0];
	return [...ids.slice(pos + 1), ...ids.slice(0, pos + 1)][0];
}
