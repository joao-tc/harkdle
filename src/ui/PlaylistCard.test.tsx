// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaylistSummary } from "@/store/playlists";
import { PlaylistCard } from "@/ui/PlaylistCard";

afterEach(cleanup);

const SUMMARY: PlaylistSummary = {
	id: "abc123",
	name: "Road Trip Mix",
	ownerName: "Ana",
	coverUrl: "https://i.scdn.co/image/cover",
	trackCount: 42,
	collaborative: false,
	owned: true,
};

function renderCard(
	overrides: Partial<PlaylistSummary> = {},
	selected = false,
	onSelect: (s: PlaylistSummary) => void = () => {},
) {
	const summary = { ...SUMMARY, ...overrides };
	const view = render(
		<ul>
			<PlaylistCard summary={summary} selected={selected} onSelect={onSelect} />
		</ul>,
	);
	return { summary, ...view };
}

describe("PlaylistCard", () => {
	it("calls onSelect once with the summary when the button is clicked", async () => {
		const onSelect = vi.fn();
		const { summary } = renderCard({}, false, onSelect);
		await userEvent.click(screen.getByRole("button"));
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(summary);
	});

	it("selects with Enter and Space on the focused button", async () => {
		const onSelect = vi.fn();
		const { summary } = renderCard({}, false, onSelect);
		const user = userEvent.setup();
		screen.getByRole("button").focus();
		await user.keyboard("{Enter}");
		expect(onSelect).toHaveBeenCalledTimes(1);
		await user.keyboard(" ");
		expect(onSelect).toHaveBeenCalledTimes(2);
		expect(onSelect).toHaveBeenLastCalledWith(summary);
	});

	it("does not call onSelect when the link is clicked", () => {
		const onSelect = vi.fn();
		renderCard({}, false, onSelect);
		const link = screen.getByRole("link", { name: "OPEN SPOTIFY" });
		// jsdom does not navigate on click, so this stays a no-op.
		fireEvent.click(link);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("keeps the link a sibling of the button, never nested", () => {
		renderCard();
		const button = screen.getByRole("button");
		const link = screen.getByRole("link");
		expect(button.contains(link)).toBe(false);
		expect(link.parentElement).toBe(button.parentElement);
		expect(button.parentElement?.tagName).toBe("LI");
	});

	it("follows aria-pressed with selected", () => {
		const { rerender, summary } = renderCard({}, false);
		expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
			"false",
		);
		rerender(
			<ul>
				<PlaylistCard summary={summary} selected onSelect={() => {}} />
			</ul>,
		);
		expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe(
			"true",
		);
	});

	it("shows selection as a class on the card, with nothing over the cover", () => {
		const { container } = renderCard({}, true);
		const li = container.querySelector("li");
		expect(li?.className).toContain("ring-2");
		expect(li?.className).toContain("ring-primary");

		const cover = screen.getByTestId("cover");
		expect(cover.children).toHaveLength(1);
		expect(cover.firstElementChild?.tagName).toBe("IMG");
	});

	it("renders the cover with object-contain and never object-cover", () => {
		renderCard();
		const img = screen.getByTestId("cover").querySelector("img");
		expect(img?.getAttribute("src")).toBe(SUMMARY.coverUrl);
		expect(img?.getAttribute("alt")).toBe("");
		expect(img?.className).toContain("object-contain");
		expect(img?.className).not.toContain("object-cover");
		expect(img?.className).toContain("rounded-[8px]");
		expect(screen.getByTestId("cover").className).toContain("aspect-square");
	});

	it("shows the placeholder when coverUrl is null", () => {
		renderCard({ coverUrl: null });
		const cover = screen.getByTestId("cover");
		expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
		expect(cover.querySelector("img")).toBeNull();
		expect(cover.children).toHaveLength(1);
	});

	it("swaps to the placeholder when the image errors", () => {
		renderCard();
		const img = screen.getByTestId("cover").querySelector("img");
		expect(img).not.toBeNull();
		expect(screen.queryByTestId("cover-placeholder")).toBeNull();
		fireEvent.error(img as HTMLImageElement);
		expect(screen.getByTestId("cover-placeholder")).toBeTruthy();
		expect(screen.getByTestId("cover").querySelector("img")).toBeNull();
	});

	it("renders a very long name in full, with the link still present", () => {
		const name = `${"Extraordinarily".repeat(12)} ${"long ".repeat(40)}playlist`;
		renderCard({ name });
		const nameEl = screen.getByText(name);
		expect(nameEl.className).toContain("break-words");
		expect(nameEl.className).not.toMatch(/truncate|line-clamp|uppercase/);
		expect(screen.getByRole("link", { name: "OPEN SPOTIFY" })).toBeTruthy();
	});

	it("shows the Collaborative badge only when collaborative", () => {
		const { unmount } = renderCard({ collaborative: true });
		const badge = screen.getByText("Collaborative");
		expect(badge).toBeTruthy();
		expect(screen.getByTestId("cover").contains(badge)).toBe(false);
		unmount();

		renderCard({ collaborative: false });
		expect(screen.queryByText("Collaborative")).toBeNull();
	});

	it("shows owner and track count, singular for one track", () => {
		const { unmount } = renderCard({ ownerName: "Ana", trackCount: 42 });
		expect(screen.getByText("Ana · 42 tracks")).toBeTruthy();
		unmount();

		renderCard({ ownerName: "Ana", trackCount: 1 });
		expect(screen.getByText("Ana · 1 track")).toBeTruthy();
	});

	it("links OPEN SPOTIFY to the playlist in a new tab", () => {
		renderCard();
		const link = screen.getByRole("link", { name: "OPEN SPOTIFY" });
		expect(link.textContent).toBe("OPEN SPOTIFY");
		expect(link.getAttribute("href")).toBe(
			"https://open.spotify.com/playlist/abc123",
		);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noreferrer");
	});

	it("has visible focus rings on the button and the link", () => {
		renderCard();
		expect(screen.getByRole("button").className).toContain(
			"focus-visible:ring-3",
		);
		expect(screen.getByRole("link").className).toContain(
			"focus-visible:ring-3",
		);
	});
});
