// Minimal types for the bun:test API the unit tests use, so `tsc` can check
// them without adding bun-types as a dependency.
declare module "bun:test" {
	interface Matchers {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toMatchObject(expected: object): void;
		toBeUndefined(): void;
		toThrow(): void;
		not: Matchers;
	}
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function expect(actual: unknown): Matchers;
}
