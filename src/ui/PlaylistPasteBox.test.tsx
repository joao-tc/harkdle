// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ApiErrorKind,
	PasteState,
	PlaylistSummary,
} from "@/store/playlists";
import { PlaylistPasteBox } from "@/ui/PlaylistPasteBox";
import { errorText, restrictedPasteText } from "@/ui/pickerCopy";

afterEach(cleanup);

const noop = () => {};
const INPUT_NAME = "Paste a playlist link";
const LOOK_UP = { name: "Look up" };

const ERROR_KINDS: ReadonlyArray<ApiErrorKind | "invalid-link"> = [
	"restricted",
	"not-found",
	"rate-limited",
	"network",
	"unexpected",
	"unauthorized",
	"invalid-link",
];

const SUMMARY: PlaylistSummary = {
	id: "abc",
	name: "Road trip",
	ownerName: "Me",
	coverUrl: null,
	trackCount: 40,
	collaborative: false,
	owned: true,
};

describe("PlaylistPasteBox submit", () => {
	it("calls onLookup with the trimmed text on button click", async () => {
		const user = userEvent.setup();
		const onLookup = vi.fn();
		render(<PlaylistPasteBox paste={{ status: "idle" }} onLookup={onLookup} />);

		await user.type(
			screen.getByRole("textbox", { name: INPUT_NAME }),
			"  spotify:playlist:abc  ",
		);
		await user.click(screen.getByRole("button", LOOK_UP));

		expect(onLookup).toHaveBeenCalledTimes(1);
		expect(onLookup).toHaveBeenCalledWith("spotify:playlist:abc");
	});

	it("calls onLookup with the trimmed text on Enter", async () => {
		const user = userEvent.setup();
		const onLookup = vi.fn();
		render(<PlaylistPasteBox paste={{ status: "idle" }} onLookup={onLookup} />);

		await user.type(
			screen.getByRole("textbox", { name: INPUT_NAME }),
			" spotify:playlist:abc {Enter}",
		);

		expect(onLookup).toHaveBeenCalledTimes(1);
		expect(onLookup).toHaveBeenCalledWith("spotify:playlist:abc");
	});

	it("does nothing for blank input", async () => {
		const user = userEvent.setup();
		const onLookup = vi.fn();
		render(<PlaylistPasteBox paste={{ status: "idle" }} onLookup={onLookup} />);

		const button = screen.getByRole("button", LOOK_UP) as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		await user.type(
			screen.getByRole("textbox", { name: INPUT_NAME }),
			"   {Enter}",
		);
		await user.click(button);

		expect(button.disabled).toBe(true);
		expect(onLookup).not.toHaveBeenCalled();
	});
});

describe("PlaylistPasteBox status", () => {
	it("draws Looking up… and disables Look up while loading", async () => {
		const user = userEvent.setup();
		render(<PlaylistPasteBox paste={{ status: "loading" }} onLookup={noop} />);

		expect(screen.getByRole("status").textContent).toBe("Looking up…");
		await user.type(screen.getByRole("textbox", { name: INPUT_NAME }), "x");
		expect(
			(screen.getByRole("button", LOOK_UP) as HTMLButtonElement).disabled,
		).toBe(true);
	});

	it("draws the restricted text", () => {
		render(
			<PlaylistPasteBox
				paste={{ status: "restricted", name: "Mixtape", ownerName: "Ana" }}
				onLookup={noop}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe(
			restrictedPasteText("Mixtape", "Ana"),
		);
	});

	it.each(ERROR_KINDS)("draws the %s error text", (error) => {
		render(
			<PlaylistPasteBox paste={{ status: "error", error }} onLookup={noop} />,
		);
		expect(screen.getByRole("alert").textContent).toBe(
			errorText(error, "paste"),
		);
	});

	it.each<PasteState>([
		{ status: "idle" },
		{ status: "found", summary: SUMMARY },
	])("draws no message for $status", (paste) => {
		render(<PlaylistPasteBox paste={paste} onLookup={noop} />);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		expect(document.querySelector("p")).toBeNull();
	});
});
