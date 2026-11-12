import { describe, expect, it } from "vitest";
import {
	lockedText,
	multiplierLabel,
	playHereReason,
	playLabel,
	pointsText,
	roundHeader,
	scoreText,
	skipLabel,
	stepRowLabel,
	trackUrl,
	usableTracks,
	volumePercent,
} from "./gameCopy";

describe("gameCopy", () => {
	it("pluralises usable tracks", () => {
		expect(usableTracks(1)).toBe("1 usable track");
		expect(usableTracks(12)).toBe("12 usable tracks");
	});

	it("builds the round header and the score with separators", () => {
		expect(roundHeader(3, 10)).toBe("Round 3 of 10");
		expect(scoreText(0)).toBe("Score 0");
		expect(scoreText(1840)).toBe("Score 1,840");
	});

	it("labels the play button with the step's clip length", () => {
		expect(playLabel(1000)).toBe("Play 1s clip");
		expect(playLabel(16000)).toBe("Play 16s clip");
	});

	it("warns on the last step only", () => {
		expect(skipLabel(1)).toBe("Skip");
		expect(skipLabel(5)).toBe("Skip");
		expect(skipLabel(6)).toBe("Skip (ends the round)");
	});

	it("formats points without float noise", () => {
		expect(pointsText(300)).toBe("+300");
		expect(pointsText(37.5)).toBe("+37.5");
		expect(pointsText(1000)).toBe("+1,000");
		expect(pointsText(250 * 0.3)).toBe("+75");
	});

	it("builds the locked line, with and without the featured credit", () => {
		expect(lockedText("Song", 1000, false)).toBe("✓ Song · +1,000");
		expect(lockedText("Duo", 150, true)).toBe("✓ Duo · featured artist · +150");
	});

	it("formats multipliers", () => {
		expect(multiplierLabel("hatTrick", 1.5)).toBe("Hat trick ×1.5");
		expect(multiplierLabel("hatTrick", 2)).toBe("Hat trick ×2.0");
		expect(multiplierLabel("randomStart", 1.25)).toBe("Random start ×1.25");
		expect(multiplierLabel("rerolls", 0.9)).toBe("Rerolls ×0.9");
	});

	it("names each interruption reason", () => {
		expect(playHereReason("taken-over")).toBe("Spotify is playing elsewhere.");
		expect(playHereReason("device-lost")).toBe(
			"harkdle's player disconnected.",
		);
	});

	it("covers the remaining helpers", () => {
		expect(stepRowLabel(4)).toBe("Step 4");
		expect(volumePercent(0.8)).toBe("80%");
		expect(trackUrl("abc")).toBe("https://open.spotify.com/track/abc");
	});
});
