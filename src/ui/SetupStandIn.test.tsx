// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaylistSummary } from "@/store/playlists";
import { SetupStandIn } from "@/ui/SetupStandIn";

afterEach(cleanup);

const summary: PlaylistSummary = {
	id: "p1",
	name: "A Very Long PLAYlist Name (Deluxe Edition) 2024",
	ownerName: "Someone",
	coverUrl: null,
	trackCount: 120,
	collaborative: false,
	owned: true,
};

describe("SetupStandIn", () => {
	it("renders the playlist name in full and the usable count", () => {
		render(<SetupStandIn summary={summary} usable={42} onBack={() => {}} />);

		expect(screen.getByText(summary.name)).toBeTruthy();
		expect(screen.getByText("42 usable tracks")).toBeTruthy();
		expect(
			screen.getByText("Game setup arrives in a later update."),
		).toBeTruthy();
	});

	it("uses the singular for one track", () => {
		render(<SetupStandIn summary={summary} usable={1} onBack={() => {}} />);

		expect(screen.getByText("1 usable track")).toBeTruthy();
	});

	it("calls onBack once per Back click", () => {
		const onBack = vi.fn();
		render(<SetupStandIn summary={summary} usable={42} onBack={onBack} />);

		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(onBack).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(onBack).toHaveBeenCalledTimes(2);
	});
});
