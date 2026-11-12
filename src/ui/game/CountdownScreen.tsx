import { COUNTDOWN_LABEL } from "@/ui/game/gameCopy";

/** The 3, 2, 1 between rounds. The number sits in a live region so it is announced as it changes. */
export function CountdownScreen({
	value,
}: {
	value: 3 | 2 | 1;
}): React.JSX.Element {
	return (
		<section className="flex flex-col items-center gap-2 py-16">
			<p className="text-sm text-muted-foreground">{COUNTDOWN_LABEL}</p>
			<div aria-live="assertive" aria-atomic="true">
				<span className="text-8xl font-semibold tabular-nums">{value}</span>
			</div>
		</section>
	);
}
