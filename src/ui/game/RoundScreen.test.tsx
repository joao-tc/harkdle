// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { PlaylistTrack } from "@/store/game";
import type { GameHarness } from "@/store/gameHarness";
import {
	createHarness,
	currentTrack,
	giveUp,
	goNext,
	makeTracks,
	PlaybackError,
	run,
	suggestFrom,
} from "./gameTestUtils";
import { RoundScreen } from "./RoundScreen";

afterEach(cleanup);

type User = ReturnType<typeof userEvent.setup>;

async function setup(
	options: { tracks?: readonly PlaylistTrack[]; cueFails?: boolean } = {},
) {
	const h = createHarness();
	if (options.cueFails) {
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
	}
	const tracks = options.tracks ?? h.tracks;
	await run(async () => {
		h.store.getState().setRounds(5);
		await h.store.getState().start(tracks);
	});
	render(<RoundScreen game={h.store} suggest={suggestFrom(tracks)} />);
	return { h, tracks, user: userEvent.setup() };
}

const singles = () =>
	makeTracks(10).map((track) => ({
		...track,
		album: { name: "A Single", kind: "single" as const },
	}));

const ladder = () => screen.getByRole("list").getAttribute("aria-label");
const combo = (name: string) => screen.getByRole("combobox", { name });
const button = (name: string | RegExp) => screen.getByRole("button", { name });

async function pick(user: User, label: string, query: string, option = query) {
	await user.click(combo(label));
	await user.type(combo(label), query);
	await user.click(screen.getByRole("option", { name: option }));
}

async function pickAll(user: User, track: PlaylistTrack) {
	await pick(user, "Title", track.title);
	await pick(user, "Artist", track.artists[0]);
	if (screen.queryByRole("combobox", { name: "Album" })) {
		await pick(user, "Album", track.album.name);
	}
}

function wrongArtist(h: GameHarness): string {
	const track = currentTrack(h);
	const other = h.tracks.find((t) => t.id !== track.id);
	if (!other) throw new Error("need another track");
	return other.artists[0];
}

describe("RoundScreen", () => {
	describe("header, ladder and Play", () => {
		it("shows the round, the score and the ladder at step 1", async () => {
			await setup();
			expect(screen.getByText("Round 1 of 5")).toBeTruthy();
			expect(screen.getByText("Score 0")).toBeTruthy();
			expect(ladder()).toBe("Step 1 of 6");
			expect(screen.queryByRole("button", { name: /Reroll/i })).toBeNull();
		});

		it("focuses the first field", async () => {
			await setup();
			expect(document.activeElement).toBe(combo("Title"));
		});

		it("plays a clip of the step's length and shows Playing… until it ends", async () => {
			const { h, user } = await setup();
			await user.click(button("Play 1s clip"));
			await run(() => {});

			expect(h.calls("playClip")).toEqual([[1000]]);
			expect(button("Playing…")).toHaveProperty("disabled", true);

			await run(() => h.adapter.endClip());
			expect(button("Play 1s clip")).toHaveProperty("disabled", false);
		});

		it("shows Preparing… and disables Play while the clip is being re-cued", async () => {
			const { h, user } = await setup();
			await user.click(button("Play 1s clip"));
			await run(() => {});
			h.adapter.holdCues();
			await run(() => h.adapter.endClip());
			expect(button("Preparing…")).toHaveProperty("disabled", true);

			await run(() => h.adapter.releaseCue());
			expect(button("Play 1s clip")).toHaveProperty("disabled", false);
		});
	});

	describe("guessing", () => {
		it("locks the right field with its points and marks the wrong one", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await pick(user, "Title", track.title);
			await pick(user, "Artist", wrongArtist(h));
			await user.click(button("Submit"));
			await run(() => {});

			expect(screen.getByText(`✓ ${track.title} · +1,000`)).toBeTruthy();
			expect(screen.getByLabelText("Title")).toHaveProperty("disabled", true);
			expect(screen.getByText("Not it")).toBeTruthy();
			expect(ladder()).toBe("Step 2 of 6");
			expect(h.store.getState().stage).toBe("round");
		});

		it("clears the mark when the wrong field is edited, and does not resend it meanwhile", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await pick(user, "Artist", wrongArtist(h));
			await user.click(button("Submit"));
			await run(() => {});
			expect(screen.getByText("Not it")).toBeTruthy();

			// Still marked: pressing Submit again sends nothing and costs no step.
			await user.click(button("Submit"));
			expect(ladder()).toBe("Step 2 of 6");

			await user.type(combo("Artist"), "x");
			expect(screen.queryByText("Not it")).toBeNull();
			await user.clear(combo("Artist"));
			await pick(user, "Artist", track.artists[0]);
			await user.click(button("Submit"));
			await run(() => {});
			expect(screen.getByText(`✓ ${track.artists[0]} · +240`)).toBeTruthy();
		});

		it("empties a field whose guess was wrong, keeps its mark, and leaves right ones alone", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await pick(user, "Title", track.title);
			await pick(user, "Artist", wrongArtist(h));
			await user.click(button("Submit"));
			await run(() => {});

			expect((combo("Artist") as HTMLInputElement).value).toBe("");
			expect(screen.getByText("Not it")).toBeTruthy();
			expect(screen.getByLabelText("Title")).toHaveProperty(
				"value",
				track.title,
			);

			await user.type(combo("Artist"), "A");
			expect(screen.queryByText("Not it")).toBeNull();
		});

		it("drops a value already guessed wrong from the suggestions, and keeps the others", async () => {
			const { h, user } = await setup();
			const wrong = wrongArtist(h);
			await pick(user, "Artist", wrong);
			await user.click(button("Submit"));
			await run(() => {});

			await user.clear(combo("Artist"));
			await user.type(combo("Artist"), "Artist");
			const options = screen.getAllByRole("option").map((o) => o.textContent);
			expect(options).not.toContain(wrong);
			expect(options).toContain(currentTrack(h).artists[0]);
		});

		it("does not remove a value that was never submitted", async () => {
			const { h, user } = await setup();
			await pick(user, "Artist", wrongArtist(h)); // picked, not submitted
			await user.clear(combo("Artist"));
			await user.type(combo("Artist"), wrongArtist(h));
			expect(screen.getByRole("option", { name: wrongArtist(h) })).toBeTruthy();
		});

		it("moves the store to the reveal when every field is right", async () => {
			const { h, user } = await setup();
			await pickAll(user, currentTrack(h));
			await user.click(button("Submit"));
			await run(() => {});
			expect(h.store.getState().stage).toBe("reveal");
		});

		it("submits on Enter when no suggestion is highlighted", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await pick(user, "Title", track.title);
			await user.keyboard("{Enter}");
			await run(() => {});

			expect(screen.getByText(`✓ ${track.title} · +1,000`)).toBeTruthy();
		});

		it("picks the highlighted suggestion on Enter instead of submitting", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await user.click(combo("Title"));
			await user.type(combo("Title"), track.title);
			await user.keyboard("{ArrowDown}{Enter}");
			await run(() => {});

			expect(ladder()).toBe("Step 1 of 6");
			expect(screen.queryByText(/✓/)).toBeNull();
			expect(h.store.getState().stage).toBe("round");
		});

		it("ignores unpicked text, shows the hint and costs no step", async () => {
			const { h, user } = await setup();
			const before = h.store.getState().game;
			await user.type(combo("Title"), "zzz");
			await user.click(button("Submit"));
			await run(() => {});

			expect(
				screen.getByText("Pick one of the suggestions to submit this field."),
			).toBeTruthy();
			expect(ladder()).toBe("Step 1 of 6");
			expect(h.store.getState().game).toBe(before);

			await user.type(combo("Title"), "z");
			expect(
				screen.queryByText("Pick one of the suggestions to submit this field."),
			).toBeNull();
		});

		it("sends only the picked fields when another holds unpicked text", async () => {
			const { h, user } = await setup();
			const track = currentTrack(h);
			await pick(user, "Title", track.title);
			await user.type(combo("Artist"), "zzz");
			await user.click(button("Submit"));
			await run(() => {});

			expect(screen.getByText(`✓ ${track.title} · +1,000`)).toBeTruthy();
			expect(ladder()).toBe("Step 1 of 6");
			expect(
				screen.getByText("Pick one of the suggestions to submit this field."),
			).toBeTruthy();
		});

		it("does nothing when every field is blank", async () => {
			const { h, user } = await setup();
			const before = h.store.getState().game;
			await user.click(button("Submit"));
			expect(h.store.getState().game).toBe(before);
			expect(ladder()).toBe("Step 1 of 6");
		});

		it("replaces the Album field with a note when the album is skipped", async () => {
			await setup({ tracks: singles() });
			expect(
				screen.getByText("Album skipped — this track is a single/compilation"),
			).toBeTruthy();
			expect(screen.queryByRole("combobox", { name: "Album" })).toBeNull();
			expect(screen.getByRole("combobox", { name: "Title" })).toBeTruthy();
		});
	});

	describe("Skip and Give up", () => {
		it("warns on the last step that skipping ends the round, and does", async () => {
			const { h, user } = await setup();
			for (let step = 1; step < 6; step++) {
				expect(button("Skip")).toBeTruthy();
				await user.click(button("Skip"));
				await run(() => {});
			}
			expect(ladder()).toBe("Step 6 of 6");
			await user.click(button("Skip (ends the round)"));
			await run(() => {});

			expect(h.store.getState().stage).toBe("reveal");
		});

		it("asks before giving up and only Confirm ends the round", async () => {
			const { h, user } = await setup();
			await user.click(button("Give up"));
			expect(screen.getByText("Give up this round?")).toBeTruthy();
			expect(h.store.getState().stage).toBe("round");

			await user.click(button("Keep playing"));
			expect(h.store.getState().stage).toBe("round");

			await user.click(button("Give up"));
			const dialog = screen.getByRole("alertdialog");
			await user.click(within(dialog).getByRole("button", { name: "Give up" }));
			await run(() => {});
			expect(h.store.getState().stage).toBe("reveal");
		});

		it("does not play or skip from the keyboard while the dialog is open", async () => {
			const { h, user } = await setup();
			await user.click(button("Give up"));
			const focused = document.activeElement ?? document.body;
			expect(fireEvent.keyDown(focused, { code: "Space", altKey: true })).toBe(
				true,
			);
			expect(fireEvent.keyDown(focused, { code: "KeyS", altKey: true })).toBe(
				true,
			);
			await run(() => {});

			expect(screen.getByRole("alertdialog")).toBeTruthy();
			expect(h.calls("playClip")).toHaveLength(0);
			// The page behind a modal is aria-hidden, so read the step from the store.
			const { game } = h.store.getState();
			expect(game?.phase === "round" && game.round.step).toBe(1);
		});
	});

	describe("shortcuts", () => {
		it("plays on ⌥Space and skips on ⌥S inside a field without typing", async () => {
			const { h, user } = await setup();
			await user.click(combo("Title"));
			await user.keyboard("a{Alt>}[Space]{/Alt}");
			await run(() => {});
			expect(h.calls("playClip")).toEqual([[1000]]);
			expect((combo("Title") as HTMLInputElement).value).toBe("a");

			await user.keyboard("{Alt>}s{/Alt}");
			await run(() => {});
			expect(ladder()).toBe("Step 2 of 6");
			expect((combo("Title") as HTMLInputElement).value).toBe("a");
		});
	});

	describe("interruptions", () => {
		it("swaps Play for the Play-here banner, freezes the actions and recovers", async () => {
			const { h, user } = await setup();
			await run(() => h.adapter.interrupt("taken-over"));

			expect(screen.getByText("Spotify is playing elsewhere.")).toBeTruthy();
			expect(
				screen.queryByRole("button", { name: /Play \d+s clip/ }),
			).toBeNull();
			expect(button("Submit")).toHaveProperty("disabled", true);
			expect(button("Skip")).toHaveProperty("disabled", true);
			expect(button("Give up")).toHaveProperty("disabled", true);
			expect(combo("Title")).toHaveProperty("disabled", false);

			await user.click(button("Play here"));
			await run(() => {});

			expect(h.calls("recover")).toHaveLength(1);
			expect(screen.queryByText("Spotify is playing elsewhere.")).toBeNull();
			expect(button("Play 1s clip")).toHaveProperty("disabled", false);
			expect(button("Submit")).toHaveProperty("disabled", false);
		});

		it("offers a retry when recovery fails", async () => {
			const { h, user } = await setup();
			h.adapter.failNextRecover(new PlaybackError("device-lost", "gone"));
			await run(() => h.adapter.interrupt("device-lost"));
			expect(screen.getByText("harkdle's player disconnected.")).toBeTruthy();

			await user.click(button("Play here"));
			await run(() => {});
			expect(
				screen.getByText(
					"Couldn't reconnect. Check Spotify is open and try again.",
				),
			).toBeTruthy();

			await user.click(button("Play here"));
			await run(() => {});
			expect(screen.queryByText(/Couldn't reconnect/)).toBeNull();
			expect(button("Play 1s clip")).toBeTruthy();
		});

		it("changes nothing visible when the tab is hidden mid-clip", async () => {
			const { h, user } = await setup();
			await user.click(button("Play 1s clip"));
			await run(() => {});
			expect(button("Playing…")).toBeTruthy();

			await run(() => h.adapter.hideTab());

			expect(screen.queryByRole("alert")).toBeNull();
			expect(screen.getByText("Round 1 of 5")).toBeTruthy();
			expect(ladder()).toBe("Step 1 of 6");
			expect(button("Play 1s clip")).toHaveProperty("disabled", false);
			await user.click(button("Play 1s clip"));
			await run(() => {});
			expect(h.calls("playClip")).toHaveLength(2);
		});
	});

	describe("skipped track notice", () => {
		it("shows the notice when a cue failed and Dismiss clears it", async () => {
			const { h, user } = await setup({ cueFails: true });
			expect(h.store.getState().skippedNotice).toBe(true);
			expect(
				screen.getByText("A track couldn't be loaded and was skipped."),
			).toBeTruthy();

			await user.click(button("Dismiss"));
			expect(h.store.getState().skippedNotice).toBe(false);
			expect(
				screen.queryByText("A track couldn't be loaded and was skipped."),
			).toBeNull();
		});

		it("shows no notice otherwise", async () => {
			await setup();
			expect(
				screen.queryByText("A track couldn't be loaded and was skipped."),
			).toBeNull();
		});
	});

	it("keeps no typed text or marks from one round to the next", async () => {
		const { h, user } = await setup();
		await pick(user, "Artist", wrongArtist(h));
		await user.click(button("Submit"));
		await run(() => {});
		await user.type(combo("Title"), "abc");
		expect(screen.getByText("Not it")).toBeTruthy();

		await giveUp(h);
		await goNext(h);

		expect(screen.getByText("Round 2 of 5")).toBeTruthy();
		expect((combo("Title") as HTMLInputElement).value).toBe("");
		expect((combo("Artist") as HTMLInputElement).value).toBe("");
		expect(screen.queryByText("Not it")).toBeNull();
		expect(ladder()).toBe("Step 1 of 6");
		expect(document.activeElement).toBe(combo("Title"));
	});

	it("offers a value again in the next round, since only this round's guesses are removed", async () => {
		const { h, user } = await setup();
		const wrong = wrongArtist(h);
		await pick(user, "Artist", wrong);
		await user.click(button("Submit"));
		await run(() => {});

		await giveUp(h);
		await goNext(h);

		await user.type(combo("Artist"), wrong);
		expect(screen.getByRole("option", { name: wrong })).toBeTruthy();
	});
});
