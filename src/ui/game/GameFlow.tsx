import { useMemo } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { Field } from "@/game/types";
import { COUNTDOWN_FROM, type GameStoreState } from "@/store/game";
import type { PlaylistSummary, PlaylistsState } from "@/store/playlists";
import { ConnectingScreen } from "@/ui/game/ConnectingScreen";
import { CountdownScreen } from "@/ui/game/CountdownScreen";
import { GameShell } from "@/ui/game/GameShell";
import { ResultsScreen } from "@/ui/game/ResultsScreen";
import { RevealScreen } from "@/ui/game/RevealScreen";
import { RoundScreen } from "@/ui/game/RoundScreen";
import { SetupScreen } from "@/ui/game/SetupScreen";
import { useAccent } from "@/ui/game/useAccent";
import { VolumeControl } from "@/ui/game/VolumeControl";

/**
 * One screen per game stage, inside the shared shell. The session store decides that we are on
 * Setup at all; the game store's `stage` decides which of the screens shows (D2).
 */
export function GameFlow({
	game,
	playlists,
	summary,
	onBack,
}: {
	game: StoreApi<GameStoreState>;
	playlists: StoreApi<PlaylistsState>;
	summary: PlaylistSummary;
	onBack(): void;
}): React.JSX.Element | null {
	const stage = useStore(game, (s) => s.stage);
	const countdown = useStore(game, (s) => s.countdown);
	const revealed = useStore(game, (s) => s.revealed);
	const selection = useStore(playlists, (s) => s.selection);
	const volume = useStore(game, (s) => s.volume);

	// Only the Reveal is tinted by the cover; every other stage keeps the neutral theme.
	const accent = useAccent(
		stage === "reveal" ? (revealed?.coverUrl ?? null) : null,
	);

	const playlist = selection.status === "ready" ? selection.playlist : null;
	const suggest = useMemo(
		() => (field: Field, query: string) =>
			playlist ? playlist.index.suggest(field, query) : [],
		[playlist],
	);
	if (playlist === null) return null;

	// Setup has its own slider; the Round and the Reveal keep one in the same spot, so it stays mounted.
	const inGame = stage === "round" || stage === "reveal";

	return (
		<GameShell accent={stage === "reveal" ? accent : undefined}>
			{(() => {
				switch (stage) {
					case "idle":
						return (
							<SetupScreen
								game={game}
								summary={summary}
								tracks={playlist.tracks}
								onBack={onBack}
							/>
						);
					case "connecting":
						return <ConnectingScreen />;
					case "round":
						return <RoundScreen game={game} suggest={suggest} />;
					case "reveal":
						return <RevealScreen game={game} />;
					case "countdown":
						return <CountdownScreen value={countdown ?? COUNTDOWN_FROM} />;
					case "finished":
						return <ResultsScreen game={game} onChangePlaylist={onBack} />;
				}
			})()}
			{inGame ? (
				<VolumeControl
					volume={volume}
					onChange={(next) => game.getState().setVolume(next)}
				/>
			) : null}
		</GameShell>
	);
}
