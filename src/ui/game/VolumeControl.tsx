import { useId } from "react";
import { VOLUME_LABEL, volumePercent } from "@/ui/game/gameCopy";

/** A native range input: accessible, keyboard-complete and testable in jsdom (D4). */
export function VolumeControl({
	volume,
	onChange,
}: {
	volume: number; // 0-1
	onChange(volume: number): void; // 0-1
}): React.JSX.Element {
	const id = useId();
	const percent = Math.round(volume * 100);
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between">
				<label htmlFor={id} className="text-sm font-medium">
					{VOLUME_LABEL}
				</label>
				<output
					htmlFor={id}
					className="text-sm text-muted-foreground tabular-nums"
				>
					{volumePercent(volume)}
				</output>
			</div>
			<input
				id={id}
				type="range"
				min={0}
				max={100}
				step={1}
				value={percent}
				aria-valuetext={volumePercent(volume)}
				className="w-full accent-primary"
				onChange={(event) => onChange(Number(event.target.value) / 100)}
			/>
		</div>
	);
}
