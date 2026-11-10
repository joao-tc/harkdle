// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListState, PlaylistSummary } from "@/store/playlists";
import { PlaylistGrid } from "@/ui/PlaylistGrid";
import { EMPTY_LIST_TEXT, errorText } from "@/ui/pickerCopy";

afterEach(cleanup);

const noop = () => {};

function summaryOf(n: number): PlaylistSummary {
	return {
		id: `id${n}`,
		name: `Playlist ${n}`,
		ownerName: "Ana",
		coverUrl: null,
		trackCount: n,
		collaborative: false,
		owned: true,
	};
}

function playlists(count: number): PlaylistSummary[] {
	return Array.from({ length: count }, (_, i) => summaryOf(i + 1));
}

function renderGrid(
	list: ListState,
	{
		selectedId = null,
		onSelect = noop,
		onRefresh = noop,
	}: {
		selectedId?: string | null;
		onSelect?: (s: PlaylistSummary) => void;
		onRefresh?: () => void;
	} = {},
) {
	return render(
		<PlaylistGrid
			list={list}
			selectedId={selectedId}
			onSelect={onSelect}
			onRefresh={onRefresh}
		/>,
	);
}

const cardButtons = () =>
	screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));

describe("PlaylistGrid", () => {
	it("pages 45 playlists 20, 40, 45 and hides Show more at the end", () => {
		renderGrid({ status: "ready", playlists: playlists(45) });

		expect(screen.getAllByRole("listitem")).toHaveLength(20);
		expect(cardButtons()).toHaveLength(20);

		fireEvent.click(screen.getByRole("button", { name: "Show more" }));
		expect(screen.getAllByRole("listitem")).toHaveLength(40);

		fireEvent.click(screen.getByRole("button", { name: "Show more" }));
		expect(screen.getAllByRole("listitem")).toHaveLength(45);
		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
	});

	it("shows no Show more button when 20 or fewer playlists exist", () => {
		renderGrid({ status: "ready", playlists: playlists(20) });
		expect(screen.getAllByRole("listitem")).toHaveLength(20);
		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
	});

	it.each(["idle", "loading"] as const)(
		"renders skeletons when %s",
		(status) => {
			const { container } = renderGrid({ status });
			expect(screen.getByText("Loading playlists…")).toBeTruthy();
			expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
			expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
				10,
			);
			expect(screen.queryAllByRole("listitem")).toHaveLength(0);
		},
	);

	it("renders the error text with Retry that calls onRefresh", () => {
		const onRefresh = vi.fn();
		renderGrid({ status: "error", error: "rate-limited" }, { onRefresh });

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain(errorText("rate-limited", "list"));
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("renders the empty text for an empty ready list", () => {
		renderGrid({ status: "ready", playlists: [] });
		expect(screen.getByText(EMPTY_LIST_TEXT)).toBeTruthy();
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});

	it("calls onRefresh when Refresh is clicked", () => {
		const onRefresh = vi.fn();
		renderGrid({ status: "ready", playlists: playlists(2) }, { onRefresh });
		expect(
			screen.getByRole("heading", { name: "Your playlists" }),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it("marks only the selected card as pressed", () => {
		renderGrid(
			{ status: "ready", playlists: playlists(3) },
			{ selectedId: "id2" },
		);
		const pressed = cardButtons().map((b) => b.getAttribute("aria-pressed"));
		expect(pressed).toEqual(["false", "true", "false"]);
	});

	it("calls onSelect with the clicked card's summary", () => {
		const onSelect = vi.fn();
		const list = playlists(3);
		renderGrid({ status: "ready", playlists: list }, { onSelect });
		fireEvent.click(cardButtons()[1] as HTMLElement);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(list[1]);
	});

	it("renders a trailing OPEN SPOTIFY link to the Spotify home", () => {
		renderGrid({ status: "ready", playlists: playlists(2) });
		const trailing = screen
			.getAllByRole("link", { name: "OPEN SPOTIFY" })
			.filter((a) => a.getAttribute("href") === "https://open.spotify.com/");
		expect(trailing).toHaveLength(1);
		expect(trailing[0]?.getAttribute("target")).toBe("_blank");
		expect(trailing[0]?.getAttribute("rel")).toBe("noreferrer");
	});

	it("has no trailing link outside the populated state", () => {
		renderGrid({ status: "ready", playlists: [] });
		expect(screen.queryByRole("link", { name: "OPEN SPOTIFY" })).toBeNull();
	});
});
