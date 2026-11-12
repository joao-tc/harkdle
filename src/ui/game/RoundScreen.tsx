import { useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { summarize } from "@/game/game";
import { requiredFields } from "@/game/round";
import { fieldPoints } from "@/game/scoring";
import type { Field, Guess } from "@/game/types";
import type { GameStoreState } from "@/store/game";
import { wrongFields } from "@/ui/game/feedback";
import { GiveUpDialog } from "@/ui/game/GiveUpDialog";
import {
	ALBUM_SKIPPED_TEXT,
	DISMISS_BUTTON,
	FIELD_ALBUM,
	FIELD_ARTIST,
	FIELD_TITLE,
	PLAYING_LABEL,
	PREPARING_LABEL,
	playLabel,
	roundHeader,
	SKIPPED_NOTICE,
	SUBMIT_BUTTON,
	scoreText,
	skipLabel,
} from "@/ui/game/gameCopy";
import { LadderBar } from "@/ui/game/LadderBar";
import { PlayHereBanner } from "@/ui/game/PlayHereBanner";
import { SuggestField } from "@/ui/game/SuggestField";
import { useGameShortcuts } from "@/ui/game/useGameShortcuts";
import { Alert, AlertDescription } from "@/ui/primitives/alert";
import { Button } from "@/ui/primitives/button";

const LABEL: Readonly<Record<Field, string>> = {
	title: FIELD_TITLE,
	artist: FIELD_ARTIST,
	album: FIELD_ALBUM,
};

interface FieldInput {
	readonly text: string;
	readonly picked: string | null;
}

type Inputs = Readonly<Record<Field, FieldInput>>;

const EMPTY: FieldInput = { text: "", picked: null };
const BLANK: Inputs = { title: EMPTY, artist: EMPTY, album: EMPTY };

type Tried = Readonly<Record<Field, readonly string[]>>;

const NONE_TRIED: Tried = { title: [], artist: [], album: [] };

const without = (fields: readonly Field[], field: Field): readonly Field[] =>
	fields.filter((f) => f !== field);

type RoundScreenProps = {
	game: StoreApi<GameStoreState>;
	suggest: (field: Field, query: string) => readonly string[];
};

/** Remounts for every track, so the typed text and the wrong marks die with the round. */
export function RoundScreen(props: RoundScreenProps): React.JSX.Element | null {
	const cursor = useStore(props.game, (s) => s.game?.cursor ?? 0);
	return <RoundBody key={cursor} {...props} />;
}

function RoundBody({
	game,
	suggest,
}: RoundScreenProps): React.JSX.Element | null {
	const state = useStore(game, (s) => s.game);
	const playback = useStore(game, (s) => s.playback);
	const recovery = useStore(game, (s) => s.recovery);
	const skippedNotice = useStore(game, (s) => s.skippedNotice);

	const [inputs, setInputs] = useState<Inputs>(BLANK);
	const [wrong, setWrong] = useState<readonly Field[]>([]);
	const [hinted, setHinted] = useState<readonly Field[]>([]);
	// Values already guessed wrong this round, per field: they leave the suggestions.
	const [tried, setTried] = useState<Tried>(NONE_TRIED);
	const [dialogOpen, setDialogOpen] = useState(false);

	useGameShortcuts(game, !dialogOpen);

	if (state === null || state.phase !== "round") return null;
	const { round, config } = state;
	const { step, locks } = round;
	const fields = requiredFields(round);

	// The store ignores actions unless a clip is ready or playing; the look follows suit.
	const actionable = playback.kind === "ready" || playback.kind === "playing";

	const setInput = (field: Field, input: FieldInput) => {
		setInputs((prev) => ({ ...prev, [field]: input }));
		setWrong((prev) => without(prev, field));
		setHinted((prev) => without(prev, field));
	};

	const submit = () => {
		if (!actionable) return;
		const guess: Guess = {};
		const unpicked: Field[] = [];
		for (const field of fields) {
			if (locks[field]) continue;
			const { text, picked } = inputs[field];
			// A field still marked wrong is not sent again until it is edited.
			if (picked !== null) {
				if (!wrong.includes(field)) guess[field] = picked;
			} else if (text.trim() !== "") {
				unpicked.push(field);
			}
		}
		setHinted(unpicked);
		if (Object.keys(guess).length === 0) return;

		game.getState().submit(guess);
		// The store applies a submission synchronously.
		const after = game.getState().game;
		if (after) {
			const fresh = wrongFields(guess, round, after);
			setWrong((prev) => [...new Set([...prev, ...fresh])]);
			// The wrong text goes, the mark stays until the player types again.
			setInputs((prev) => {
				const next = { ...prev };
				for (const field of fresh) next[field] = EMPTY;
				return next;
			});
			setTried((prev) => {
				const next = { ...prev };
				for (const field of fresh) {
					const value = guess[field];
					if (value !== undefined) next[field] = [...prev[field], value];
				}
				return next;
			});
		}
	};

	const playButton = (() => {
		const label =
			playback.kind === "playing"
				? PLAYING_LABEL
				: playback.kind === "ready"
					? playLabel(config.clipMs[step])
					: PREPARING_LABEL;
		return (
			<Button
				type="button"
				size="lg"
				disabled={playback.kind !== "ready"}
				onClick={() => game.getState().play()}
			>
				{label}
			</Button>
		);
	})();

	return (
		<section className="flex flex-col gap-4">
			<header className="flex items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">
					{roundHeader(state.results.length + 1, state.rounds)}
				</h1>
				<p aria-live="polite" className="text-sm tabular-nums">
					{scoreText(summarize(state).score)}
				</p>
			</header>

			{skippedNotice ? (
				<Alert className="flex items-center justify-between gap-2">
					<AlertDescription>{SKIPPED_NOTICE}</AlertDescription>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => game.getState().dismissNotice()}
					>
						{DISMISS_BUTTON}
					</Button>
				</Alert>
			) : null}

			<LadderBar step={step} clipMs={config.clipMs} />

			{playback.kind === "interrupted" ? (
				<PlayHereBanner
					reason={playback.reason}
					recovery={recovery}
					onRecover={() => void game.getState().recover()}
				/>
			) : (
				playButton
			)}

			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				{fields.map((field, index) => {
					const lock = locks[field];
					const { text, picked } = inputs[field];
					return (
						<SuggestField
							key={field}
							field={field}
							label={LABEL[field]}
							suggest={(query) =>
								suggest(field, query).filter((v) => !tried[field].includes(v))
							}
							text={text}
							picked={picked}
							onText={(next) => setInput(field, { text: next, picked: null })}
							onPick={(value) =>
								setInput(field, { text: value, picked: value })
							}
							onSubmit={submit}
							lock={
								lock
									? {
											value: picked ?? canonical(round.track, field),
											points: fieldPoints(config, field, lock),
											featured: lock.credit === "featured",
										}
									: null
							}
							wrong={wrong.includes(field)}
							hint={hinted.includes(field)}
							disabled={false}
							autoFocus={index === 0}
						/>
					);
				})}
				{round.albumSkipped ? (
					<p className="text-sm text-muted-foreground">{ALBUM_SKIPPED_TEXT}</p>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					<Button type="submit" disabled={!actionable}>
						{SUBMIT_BUTTON}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={!actionable}
						onClick={() => game.getState().skip()}
					>
						{skipLabel(step)}
					</Button>
					<GiveUpDialog
						disabled={!actionable}
						onConfirm={() => game.getState().giveUp()}
						onOpenChange={setDialogOpen}
					/>
				</div>
			</form>
		</section>
	);
}

// A locked field is already revealed, so showing the track's own value is no leak.
function canonical(
	track: { title: string; artists: readonly string[]; album: { name: string } },
	field: Field,
): string {
	if (field === "title") return track.title;
	if (field === "artist") return track.artists[0] ?? "";
	return track.album.name;
}
