import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { summarize } from "@/game/game";
import type { Field } from "@/game/types";
import type { GameStoreState } from "@/store/game";
import {
	COVER_ALT,
	FEATURED_ARTIST,
	FIELD_ALBUM,
	FIELD_ARTIST,
	FIELD_TITLE,
	formatNumber,
	multiplierLabel,
	NEXT_BUTTON,
	NO_COVER_ALT,
	NOT_GUESSED,
	PLAY_ON_SPOTIFY,
	pointsText,
	ROUND_TOTAL,
	SCORE_LABEL,
	trackUrl,
} from "@/ui/game/gameCopy";
import { Button } from "@/ui/primitives/button";

const FIELD_LABEL: Readonly<Record<Field, string>> = {
	title: FIELD_TITLE,
	artist: FIELD_ARTIST,
	album: FIELD_ALBUM,
};

function Row({
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note?: string;
}): React.JSX.Element {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt>
				{label}
				{note ? <span className="text-muted-foreground"> · {note}</span> : null}
			</dt>
			<dd className="tabular-nums">{value}</dd>
		</div>
	);
}

/**
 * The just-finished round: the track in full and what each field scored. Spotify's rules for
 * this view: the cover is unaltered and uncropped with nothing over it (8 px radius), the metadata
 * is complete, and there is a link back to Spotify (L5).
 */
export function RevealScreen({
	game,
}: {
	game: StoreApi<GameStoreState>;
}): React.JSX.Element | null {
	const state = useStore(game, (s) => s.game);
	const track = useStore(game, (s) => s.revealed);
	const nextRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		nextRef.current?.focus();
	}, []);

	const result = state?.results.at(-1);
	if (state === null || track === null || result === undefined) return null;
	const { score } = result;
	const fields: readonly Field[] = result.albumSkipped
		? ["title", "artist"]
		: ["title", "artist", "album"];

	return (
		<section className="flex flex-col gap-4">
			{track.coverUrl === null ? (
				<div
					role="img"
					aria-label={NO_COVER_ALT}
					className="mx-auto aspect-square w-full max-w-xs rounded-[8px] bg-muted"
				/>
			) : (
				<img
					src={track.coverUrl}
					alt={COVER_ALT}
					className="mx-auto aspect-square w-full max-w-xs rounded-[8px] object-contain"
				/>
			)}
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold break-words">{track.title}</h1>
				<p className="break-words">{track.artists.join(", ")}</p>
				<p className="break-words text-sm opacity-80">{track.album.name}</p>
			</div>
			<dl className="flex flex-col gap-1 text-sm">
				{fields.map((field) => {
					const lock = result.locks[field];
					const points = score.fields[field];
					return lock && points !== undefined ? (
						<Row
							key={field}
							label={FIELD_LABEL[field]}
							value={pointsText(points)}
							note={lock.credit === "featured" ? FEATURED_ARTIST : undefined}
						/>
					) : (
						<Row key={field} label={FIELD_LABEL[field]} value={NOT_GUESSED} />
					);
				})}
				{score.combo !== 1 ? (
					<Row label={multiplierLabel("hatTrick", score.combo)} value="" />
				) : null}
				{score.modeMultiplier !== 1 ? (
					<Row
						label={multiplierLabel("randomStart", score.modeMultiplier)}
						value=""
					/>
				) : null}
				{score.rerollMultiplier !== 1 ? (
					<Row
						label={multiplierLabel("rerolls", score.rerollMultiplier)}
						value=""
					/>
				) : null}
				<div className="mt-1 border-t pt-1 font-medium">
					<Row label={ROUND_TOTAL} value={pointsText(score.total)} />
				</div>
				<Row label={SCORE_LABEL} value={formatNumber(summarize(state).score)} />
			</dl>
			<div className="flex items-center justify-between gap-4">
				<a
					href={trackUrl(track.id)}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm font-semibold tracking-wide underline underline-offset-4"
				>
					{PLAY_ON_SPOTIFY}
				</a>
				<Button
					ref={nextRef}
					type="button"
					onClick={() => game.getState().next()}
				>
					{NEXT_BUTTON}
				</Button>
			</div>
		</section>
	);
}
