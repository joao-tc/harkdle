// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { summarize } from "@/game/game";
import {
	createHarness,
	PlaybackError,
	playToResults,
	run,
	startGame,
} from "./gameTestUtils";
import { ResultsScreen } from "./ResultsScreen";

afterEach(cleanup);

const rowOf = (label: string) => {
	const row = screen
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(label) !== null);
	if (!row) throw new Error(`no row ${label}`);
	return row;
};

describe("ResultsScreen", () => {
	it("shows the score, the histogram, the hat tricks and the rounds played", async () => {
		const h = createHarness();
		await playToResults(h, 5);
		expect(h.store.getState().stage).toBe("finished");
		const summary = summarize(h.store.getState().game ?? (undefined as never));

		render(<ResultsScreen game={h.store} onChangePlaylist={() => {}} />);

		expect(screen.getByText("Final score")).toBeTruthy();
		expect(
			screen.getByText(summary.score.toLocaleString("en-US")),
		).toBeTruthy();
		expect(screen.getByText("Hat tricks").nextSibling?.textContent).toBe("1");
		expect(screen.getByText("Rounds played").nextSibling?.textContent).toBe(
			"5",
		);
		expect(within(rowOf("Step 1")).getByText("1")).toBeTruthy();
		expect(within(rowOf("Step 2")).getByText("0")).toBeTruthy();
		expect(within(rowOf("Missed")).getByText("4")).toBeTruthy();
		expect(screen.getAllByRole("listitem")).toHaveLength(7);
	});

	it("focuses Play again, which starts a new game", async () => {
		const h = createHarness();
		await playToResults(h, 5);
		const user = userEvent.setup();
		render(<ResultsScreen game={h.store} onChangePlaylist={() => {}} />);

		const again = screen.getByRole("button", { name: "Play again" });
		expect(document.activeElement).toBe(again);
		await user.click(again);
		await run(() => {});

		expect(h.calls("connect")).toHaveLength(2);
		expect(h.store.getState().stage).not.toBe("finished");
	});

	it("calls onChangePlaylist from Change playlist", async () => {
		const h = createHarness();
		await playToResults(h, 5);
		const onChangePlaylist = vi.fn();
		const user = userEvent.setup();
		render(
			<ResultsScreen game={h.store} onChangePlaylist={onChangePlaylist} />,
		);

		await user.click(screen.getByRole("button", { name: "Change playlist" }));
		expect(onChangePlaylist).toHaveBeenCalledTimes(1);
	});

	it("says no tracks could be played, with no histogram, when every cue fails", async () => {
		const h = createHarness();
		const cue = h.adapter.cue.bind(h.adapter);
		h.adapter.cue = (target) => {
			h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
			return cue(target);
		};
		await startGame(h, 5);
		expect(h.store.getState().stage).toBe("finished");

		render(<ResultsScreen game={h.store} onChangePlaylist={() => {}} />);
		expect(screen.getByText("No tracks could be played.")).toBeTruthy();
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
		expect(screen.queryByText("Step 1")).toBeNull();
		expect(screen.getByRole("button", { name: "Play again" })).toBeTruthy();
	});
});
