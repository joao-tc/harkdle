import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { pickRounds, presetOptions } from "@/game/presets";
import type { GameStoreState, PlaylistTrack } from "@/store/game";
import type { PlaylistSummary } from "@/store/playlists";
import {
	BACK_BUTTON,
	comingSoon,
	MODE_ENDLESS,
	MODE_X_TRACKS,
	SETUP_MODE_LABEL,
	SETUP_START_FROM_LABEL,
	SETUP_TRACKS_LABEL,
	START_BUTTON,
	START_CLASSIC,
	START_RANDOM,
	usableTracks,
} from "@/ui/game/gameCopy";
import { VolumeControl } from "@/ui/game/VolumeControl";
import { Button } from "@/ui/primitives/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/ui/primitives/card";

function Choice({
	label,
	selected,
	disabled,
	onClick,
}: {
	label: string;
	selected: boolean;
	disabled?: boolean;
	onClick?: () => void;
}): React.JSX.Element {
	return (
		<Button
			type="button"
			variant={selected ? "default" : "outline"}
			aria-pressed={selected}
			disabled={disabled}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}

function Group({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<fieldset className="flex min-w-0 flex-col gap-1.5">
			<legend className="mb-1.5 text-sm font-medium">{label}</legend>
			<div className="flex flex-wrap gap-2">{children}</div>
		</fieldset>
	);
}

/** Pre-game options. Mode and Start are fixed in this version; the other choices are not yet offered. */
export function SetupScreen({
	game,
	summary,
	tracks,
	onBack,
}: {
	game: StoreApi<GameStoreState>;
	summary: PlaylistSummary;
	tracks: readonly PlaylistTrack[];
	onBack(): void;
}): React.JSX.Element {
	const rounds = useStore(game, (s) => s.rounds);
	const volume = useStore(game, (s) => s.volume);
	const stage = useStore(game, (s) => s.stage);
	const selected = pickRounds(rounds, tracks.length);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="break-words">{summary.name}</CardTitle>
				<CardDescription>{usableTracks(tracks.length)}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Group label={SETUP_MODE_LABEL}>
					<Choice label={MODE_X_TRACKS} selected />
					<Choice label={comingSoon(MODE_ENDLESS)} selected={false} disabled />
				</Group>
				<Group label={SETUP_TRACKS_LABEL}>
					{presetOptions(tracks.length).map((option) => (
						<Choice
							key={option.rounds}
							label={String(option.rounds)}
							selected={option.rounds === selected}
							disabled={!option.enabled}
							onClick={() => game.getState().setRounds(option.rounds)}
						/>
					))}
				</Group>
				<Group label={SETUP_START_FROM_LABEL}>
					<Choice label={START_CLASSIC} selected />
					<Choice label={comingSoon(START_RANDOM)} selected={false} disabled />
				</Group>
				<VolumeControl
					volume={volume}
					onChange={(next) => game.getState().setVolume(next)}
				/>
			</CardContent>
			<CardFooter className="flex justify-between gap-2">
				<Button type="button" variant="outline" onClick={onBack}>
					{BACK_BUTTON}
				</Button>
				{/* start() runs straight from the click: Spotify only lets the player start audio from a user gesture. */}
				<Button
					type="button"
					disabled={stage !== "idle"}
					onClick={() => void game.getState().start(tracks)}
				>
					{START_BUTTON}
				</Button>
			</CardFooter>
		</Card>
	);
}
