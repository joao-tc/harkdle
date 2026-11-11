import { describe, expect, it } from "vitest";
import { PlaybackError } from "./adapter";
import { TransportError } from "./transport";

describe("PlaybackError", () => {
	it("carries its name, kind and message", () => {
		const error = new PlaybackError("cue-failed", "could not cue");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(PlaybackError);
		expect(error.name).toBe("PlaybackError");
		expect(error.kind).toBe("cue-failed");
		expect(error.message).toBe("could not cue");
	});
});

describe("TransportError", () => {
	it("carries its name, kind and message", () => {
		const error = new TransportError("device-gone", "404");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(TransportError);
		expect(error.name).toBe("TransportError");
		expect(error.kind).toBe("device-gone");
		expect(error.message).toBe("404");
	});
});
