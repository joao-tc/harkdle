// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaylistsStore, type PlaylistSummary } from "@/store/playlists";
import { PlaylistPicker } from "@/ui/PlaylistPicker";

afterEach(cleanup);

type Client = Parameters<typeof createPlaylistsStore>[0]["client"];
type Rec = Record<string, unknown>;

const USER = { id: "me_user", displayName: "Ada", product: "premium" };
const LINK_ID = "37i9dQZF1DXcBWIGoYBM5M"; // synthetic 22-char base62
const LINK_URL = `https://open.spotify.com/playlist/${LINK_ID}`;
const UNEXPECTED =
	"Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.";

function summary(
	id: string,
	over: Partial<PlaylistSummary> = {},
): PlaylistSummary {
	return {
		id,
		name: `List ${id}`,
		ownerName: "Me",
		coverUrl: null,
		trackCount: 20,
		collaborative: false,
		owned: true,
		...over,
	};
}

function item(prefix: string, n: number): Rec {
	return {
		is_local: false,
		item: {
			type: "track",
			id: `${prefix}${n}`,
			uri: `spotify:track:${prefix}${n}`,
			name: `Song ${prefix}${n}`,
			is_playable: true,
			is_local: false,
			duration_ms: 180_000,
			external_ids: { isrc: `ZZ${prefix}${n}` },
			artists: [{ name: `Artist ${prefix}${n}` }],
			album: { name: `Album ${prefix}${n}`, album_type: "album", images: [] },
		},
	};
}

const items = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, i) => item(prefix, i));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function setup() {
	const client = {
		listMine: vi.fn<Client["listMine"]>(async () => [
			summary("a"),
			summary("b"),
			summary(LINK_ID),
		]),
		lookup: vi.fn<Client["lookup"]>(async (id) => ({
			kind: "ok",
			summary: summary(id),
		})),
		fetchItems: vi.fn<Client["fetchItems"]>(async (id) => items(id, 12)),
	};
	const store = createPlaylistsStore({
		client,
		getUserId: () => USER.id,
		onUnauthorized: vi.fn(),
	});
	const onContinue = vi.fn();
	const onLogout = vi.fn();
	const ui = (
		<PlaylistPicker
			user={USER}
			playlists={store}
			onContinue={onContinue}
			onLogout={onLogout}
		/>
	);
	return { client, store, onContinue, onLogout, ui };
}

const card = (name: RegExp) => screen.getByRole("button", { name });

describe("PlaylistPicker", () => {
	it("shows the user and lists playlists once on mount", async () => {
		const { client, ui } = setup();
		render(ui);
		expect(screen.getByText("Signed in as Ada")).toBeTruthy();
		expect(await screen.findByText("List a")).toBeTruthy();
		expect(screen.getByText("List b")).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(1);
		expect(client.listMine).toHaveBeenCalledWith(USER.id);
	});

	it("lists once under StrictMode", async () => {
		const { client, ui } = setup();
		render(<StrictMode>{ui}</StrictMode>);
		expect(await screen.findByText("List a")).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(1);
	});

	it("does not refetch when remounted over a ready list", async () => {
		const { client, ui } = setup();
		const first = render(ui);
		await screen.findByText("List a");
		first.unmount();
		render(ui);
		expect(screen.getByText("List a")).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(1);
	});

	it("shows progress while loading, then the cleaning summary", async () => {
		const { client, ui } = setup();
		const held = deferred<readonly unknown[]>();
		client.fetchItems.mockReturnValue(held.promise);
		const user = userEvent.setup();
		render(ui);
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		expect(card(/List a/).getAttribute("aria-pressed")).toBe("true");
		expect(card(/List b/).getAttribute("aria-pressed")).toBe("false");
		expect(screen.getByText("Loading 0 of 20 tracks…")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled"),
		).toBe(true);

		held.resolve(items("a", 12));
		expect(await screen.findByText("12 usable · none removed")).toBeTruthy();
	});

	it("reports removed tracks in the summary", async () => {
		const { client, ui } = setup();
		client.fetchItems.mockResolvedValue([
			...items("a", 11),
			item("a", 0),
			{ is_local: true, item: null },
			{ is_local: false, item: { type: "episode", id: "ep1" } },
		]);
		const user = userEvent.setup();
		render(ui);
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		expect(
			await screen.findByText(
				"11 usable · 3 removed (1 duplicate, 1 local, 1 episode)",
			),
		).toBeTruthy();
	});

	it("blocks Continue when too few tracks are usable", async () => {
		const { client, ui, onContinue } = setup();
		client.fetchItems.mockResolvedValue(items("a", 5));
		const user = userEvent.setup();
		render(ui);
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		expect(await screen.findByText(/Only 5 usable tracks/)).toBeTruthy();
		const cont = screen.getByRole("button", { name: "Continue" });
		expect(cont.hasAttribute("disabled")).toBe(true);
		await user.click(cont);
		expect(onContinue).not.toHaveBeenCalled();
	});

	it("calls onContinue once for an ok playlist", async () => {
		const { ui, onContinue } = setup();
		const user = userEvent.setup();
		render(ui);
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		await screen.findByText("12 usable · none removed");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(onContinue).toHaveBeenCalledTimes(1);
	});

	it("looks up a pasted link and selects the found card", async () => {
		const { ui, client } = setup();
		const user = userEvent.setup();
		render(ui);
		await screen.findByText("List a");
		await user.type(screen.getByLabelText("Paste a playlist link"), LINK_URL);
		await user.click(screen.getByRole("button", { name: "Look up" }));

		await waitFor(() =>
			expect(screen.getAllByRole("button", { name: /List 37i9/ })).toHaveLength(
				2,
			),
		);
		expect(client.lookup).toHaveBeenCalledWith(LINK_ID, USER.id);
		for (const found of screen.getAllByRole("button", { name: /List 37i9/ })) {
			expect(found.getAttribute("aria-pressed")).toBe("false");
		}

		const [firstCard] = screen.getAllByRole("button", { name: /List 37i9/ });
		if (!firstCard) throw new Error("found card missing");
		await user.click(firstCard);
		await screen.findByText("12 usable · none removed");
		// Same id in the grid and in the found slot: both are marked pressed.
		for (const found of screen.getAllByRole("button", { name: /List 37i9/ })) {
			expect(found.getAttribute("aria-pressed")).toBe("true");
		}
		expect(card(/List a/).getAttribute("aria-pressed")).toBe("false");
	});

	it("explains a restricted lookup and shows no found card", async () => {
		const { ui, client } = setup();
		client.lookup.mockResolvedValue({
			kind: "restricted",
			name: "Secret mix",
			ownerName: "Grace",
		});
		const user = userEvent.setup();
		render(ui);
		await screen.findByText("List a");
		await user.type(screen.getByLabelText("Paste a playlist link"), LINK_URL);
		await user.click(screen.getByRole("button", { name: "Look up" }));
		expect(
			await screen.findByText(/"Secret mix" belongs to Grace/),
		).toBeTruthy();
		expect(screen.getAllByRole("button", { name: /List 37i9/ })).toHaveLength(
			1,
		);
	});

	it("rejects text that is not a link", async () => {
		const { ui, client } = setup();
		const user = userEvent.setup();
		render(ui);
		await screen.findByText("List a");
		await user.type(
			screen.getByLabelText("Paste a playlist link"),
			"not a link",
		);
		await user.click(screen.getByRole("button", { name: "Look up" }));
		expect(
			await screen.findByText(/That isn't a Spotify playlist link/),
		).toBeTruthy();
		expect(client.lookup).not.toHaveBeenCalled();
	});

	it("shows a selection error and retries it with Reload", async () => {
		const { ui, client } = setup();
		client.fetchItems.mockRejectedValueOnce(new Error("boom"));
		const user = userEvent.setup();
		render(ui);
		await user.click(await screen.findByRole("button", { name: /List a/ }));
		expect(await screen.findByText(UNEXPECTED)).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Reload" }));
		expect(await screen.findByText("12 usable · none removed")).toBeTruthy();
		expect(client.fetchItems).toHaveBeenCalledTimes(2);
		expect(screen.queryByText(UNEXPECTED)).toBeNull();
	});

	it("shows a list error and retries it", async () => {
		const { ui, client } = setup();
		client.listMine.mockRejectedValueOnce(new Error("boom"));
		const user = userEvent.setup();
		render(ui);
		expect(await screen.findByText(UNEXPECTED)).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByText("List a")).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(2);
	});

	it("refetches on mount when the list previously failed", async () => {
		const { ui, client } = setup();
		client.listMine.mockRejectedValueOnce(new Error("boom"));
		const first = render(ui);
		await screen.findByText(UNEXPECTED);
		first.unmount();
		render(ui);
		expect(await screen.findByText("List a")).toBeTruthy();
		expect(client.listMine).toHaveBeenCalledTimes(2);
	});

	it("calls onLogout from Log out", async () => {
		const { ui, onLogout } = setup();
		const user = userEvent.setup();
		render(ui);
		await user.click(screen.getByRole("button", { name: "Log out" }));
		expect(onLogout).toHaveBeenCalledTimes(1);
	});
});
