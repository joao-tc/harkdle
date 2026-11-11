import { describe, expect, it } from "vitest";
import { type KeyInput, shortcutFor } from "./shortcuts";

function key(over: Partial<KeyInput> = {}): KeyInput {
	return {
		code: "Space",
		altKey: true,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		repeat: false,
		...over,
	};
}

describe("shortcutFor", () => {
	it.each([
		["Space", "play"],
		["KeyS", "skip"],
	])("maps Alt+%s to %s", (code, action) => {
		expect(shortcutFor(key({ code }))).toBe(action);
	});

	it("leaves reroll (Alt+KeyR) unmapped", () => {
		expect(shortcutFor(key({ code: "KeyR" }))).toBeNull();
	});

	it("ignores unmapped codes", () => {
		expect(shortcutFor(key({ code: "toString" }))).toBeNull();
	});

	it.each(["Space", "KeyS"])("ignores %s without Alt", (code) => {
		expect(shortcutFor(key({ code, altKey: false }))).toBeNull();
	});

	it.each(["ctrlKey", "metaKey", "shiftKey"] as const)(
		"ignores Alt plus %s",
		(modifier) => {
			expect(shortcutFor(key({ [modifier]: true }))).toBeNull();
			expect(shortcutFor(key({ code: "KeyS", [modifier]: true }))).toBeNull();
		},
	);

	it("ignores auto-repeat", () => {
		expect(shortcutFor(key({ repeat: true }))).toBeNull();
		expect(shortcutFor(key({ code: "KeyS", repeat: true }))).toBeNull();
	});

	it("matches on code, so macOS Option+S (which types ß) still skips", () => {
		const event = { ...key({ code: "KeyS" }), key: "ß" };
		expect(shortcutFor(event)).toBe("skip");
	});
});
