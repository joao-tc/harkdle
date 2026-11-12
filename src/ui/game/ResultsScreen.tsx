import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { summarize } from "@/game/game";
import { STEPS } from "@/game/types";
import type { GameStoreState } from "@/store/game";
import {
	CHANGE_PLAYLIST_BUTTON,
	FINAL_SCORE,
	formatNumber,
	HAT_TRICKS,
	HISTOGRAM_LABEL,
	MISSED_LABEL,
	NO_TRACKS_PLAYED,
	PLAY_AGAIN_BUTTON,
	ROUNDS_PLAYED,
	stepRowLabel,
} from "@/ui/game/gameCopy";
import { Button } from "@/ui/primitives/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/ui/primitives/card";

function HistogramRow({
	label,
	count,
	max,
}: {
	label: string;
	count: number;
	max: number;
}): React.JSX.Element {
	return (
		<li className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span aria-hidden="true" className="h-3 rounded-sm bg-muted">
				<span
					className="block h-full rounded-sm bg-primary"
					style={{ width: max === 0 ? "0%" : `${(count / max) * 100}%` }}
				/>
			</span>
			<span className="text-right tabular-nums">{count}</span>
		</li>
	);
}

export function ResultsScreen({
	game,
	onChangePlaylist,
}: {
	game: StoreApi<GameStoreState>;
	onChangePlaylist(): void;
}): React.JSX.Element | null {
	const state = useStore(game, (s) => s.game);
	const playAgainRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		playAgainRef.current?.focus();
	}, []);

	if (state === null) return null;
	const summary = summarize(state);
	const max = Math.max(
		summary.missed,
		...STEPS.map((s) => summary.stepHistogram[s]),
	);

	return (
		<Card>
			<CardHeader>
				<h1 className="text-sm font-medium text-muted-foreground">
					{FINAL_SCORE}
				</h1>
				<p className="text-4xl font-semibold tabular-nums">
					{formatNumber(summary.score)}
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{summary.roundsPlayed === 0 ? (
					<p className="text-muted-foreground">{NO_TRACKS_PLAYED}</p>
				) : (
					<>
						<dl className="grid grid-cols-2 gap-2 text-sm">
							<dt className="text-muted-foreground">{HAT_TRICKS}</dt>
							<dd className="text-right tabular-nums">{summary.hatTricks}</dd>
							<dt className="text-muted-foreground">{ROUNDS_PLAYED}</dt>
							<dd className="text-right tabular-nums">
								{summary.roundsPlayed}
							</dd>
						</dl>
						<ul aria-label={HISTOGRAM_LABEL} className="flex flex-col gap-1.5">
							{STEPS.map((step) => (
								<HistogramRow
									key={step}
									label={stepRowLabel(step)}
									count={summary.stepHistogram[step]}
									max={max}
								/>
							))}
							<HistogramRow
								label={MISSED_LABEL}
								count={summary.missed}
								max={max}
							/>
						</ul>
					</>
				)}
			</CardContent>
			<CardFooter className="flex gap-2">
				<Button
					ref={playAgainRef}
					type="button"
					onClick={() => void game.getState().playAgain()}
				>
					{PLAY_AGAIN_BUTTON}
				</Button>
				<Button type="button" variant="outline" onClick={onChangePlaylist}>
					{CHANGE_PLAYLIST_BUTTON}
				</Button>
			</CardFooter>
		</Card>
	);
}
