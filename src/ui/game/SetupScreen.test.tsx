// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaylistSummary } from "@/store/playlists";
import { createHarness, makeTracks, run } from "./gameTestUtils";
import { SetupScreen } from "./SetupScreen";

afterEach(cleanup);

const SUMMARY: PlaylistSummary = {
	id: "p1",
	name: "My Mix",
	ownerName: "Me",
	coverUrl: null,
	trackCount: 12,
	collaborative: false,
	owned: true,
};

function setup(count = 12) {
	const h = createHarness();
	const tracks = makeTracks(count);
	const onBack = vi.fn();
	render(
		<SetupScreen
			game={h.store}
			summary={SUMMARY}
			tracks={tracks}
			onBack={onBack}
		/>,
	);
	return { h, tracks, onBack, user: userEvent.setup() };
}

const pressed = (name: string) =>
	screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("SetupScreen", () => {
	it("shows the playlist name and the usable count", () => {
		setup();
		expect(screen.getByText("My Mix")).toBeTruthy();
		expect(screen.getByText("12 usable tracks")).toBeTruthy();
	});

	it("disables the presets that do not fit and selects the largest that does", () => {
		setup(12);
		expect(screen.getByRole("button", { name: "20" })).toHaveProperty(
			"disabled",
			true,
		);
		expect(screen.getByRole("button", { name: "5" })).toHaveProperty(
			"disabled",
			false,
		);
		expect(pressed("10")).toBe("true");
		expect(pressed("5")).toBe("false");
	});

	it("chooses a preset through setRounds", async () => {
		const { h, user } = setup();
		await user.click(screen.getByRole("button", { name: "5" }));
		expect(h.store.getState().rounds).toBe(5);
		expect(pressed("5")).toBe("true");
		expect(pressed("10")).toBe("false");
	});

	it("does not react to a disabled preset", async () => {
		const { h, user } = setup(12);
		await user.click(screen.getByRole("button", { name: "20" }));
		expect(h.store.getState().rounds).toBe(10);
	});

	it("shows X Tracks and Classic selected and the others greyed as coming soon", async () => {
		const { user } = setup();
		expect(pressed("X Tracks")).toBe("true");
		expect(pressed("Classic")).toBe("true");
		const endless = screen.getByRole("button", {
			name: "Endless (coming soon)",
		});
		const random = screen.getByRole("button", { name: "Random (coming soon)" });
		expect(endless).toHaveProperty("disabled", true);
		expect(random).toHaveProperty("disabled", true);
		await user.click(endless);
		await user.click(random);
		expect(pressed("X Tracks")).toBe("true");
		expect(pressed("Classic")).toBe("true");
	});

	it("sets the volume from the slider", () => {
		const { h } = setup();
		fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
			target: { value: "35" },
		});
		expect(h.store.getState().volume).toBe(0.35);
	});

	it("starts the game once with the same tracks, and not again while connecting", async () => {
		const { h, tracks, user } = setup();
		await user.click(screen.getByRole("button", { name: "Start" }));
		await run(() => {});
		await user.click(screen.getByRole("button", { name: "Start" }));
		await run(() => {});

		expect(h.calls("connect")).toHaveLength(1);
		const cued = h
			.calls("cue")
			.map(([target]) => (target as { uri: string }).uri);
		expect(cued).toHaveLength(1);
		expect(tracks.map((t) => t.uri)).toContain(cued[0]);
		expect(h.store.getState().stage).toBe("round");
		expect(screen.getByRole("button", { name: "Start" })).toHaveProperty(
			"disabled",
			true,
		);
	});

	it("goes back", async () => {
		const { onBack, user } = setup();
		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(onBack).toHaveBeenCalledTimes(1);
	});
});
