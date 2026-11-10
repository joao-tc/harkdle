import { useEffect } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PlaylistsState } from "@/store/playlists";
import type { AccountUser } from "@/store/session";
import { PlaylistCard } from "@/ui/PlaylistCard";
import { PlaylistGrid } from "@/ui/PlaylistGrid";
import { PlaylistPasteBox } from "@/ui/PlaylistPasteBox";
import { Button } from "@/ui/primitives/button";
import { SelectionBar } from "@/ui/SelectionBar";
import { SpotifyAttribution } from "@/ui/SpotifyAttribution";

export function PlaylistPicker({
	user,
	playlists,
	onContinue,
	onLogout,
}: {
	user: AccountUser;
	playlists: StoreApi<PlaylistsState>;
	onContinue: () => void;
	onLogout: () => void;
}) {
	const list = useStore(playlists, (s) => s.list);
	const paste = useStore(playlists, (s) => s.paste);
	const selection = useStore(playlists, (s) => s.selection);

	// A ready list survives leaving for Setup and coming back, so only fetch when there is none.
	useEffect(() => {
		const { status } = playlists.getState().list;
		if (status === "idle" || status === "error") {
			void playlists.getState().loadList();
		}
	}, [playlists]);

	const selectedId = selection.status === "none" ? null : selection.summary.id;

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 pt-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-col">
					<h1 className="text-2xl font-semibold">harkdle</h1>
					<p className="text-sm text-muted-foreground">
						Signed in as {user.displayName}
					</p>
				</div>
				<Button type="button" variant="outline" onClick={onLogout}>
					Log out
				</Button>
			</header>
			<PlaylistPasteBox
				paste={paste}
				onLookup={(input) => void playlists.getState().lookupLink(input)}
			/>
			{paste.status === "found" ? (
				<ul className="max-w-xs">
					<PlaylistCard
						summary={paste.summary}
						selected={paste.summary.id === selectedId}
						onSelect={(s) => void playlists.getState().select(s)}
					/>
				</ul>
			) : null}
			<PlaylistGrid
				list={list}
				selectedId={selectedId}
				onSelect={(s) => void playlists.getState().select(s)}
				onRefresh={() => void playlists.getState().loadList()}
			/>
			<div className="mt-auto">
				<SpotifyAttribution />
			</div>
			<SelectionBar
				selection={selection}
				onContinue={onContinue}
				onReload={() => void playlists.getState().reload()}
			/>
		</main>
	);
}
