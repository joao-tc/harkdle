import { cn } from "cn";
import { STEPS, type Step } from "@/game/types";
import { clipLabel, ladderLabel } from "@/ui/game/gameCopy";

type SegmentState = "spent" | "current" | "upcoming";

const STATE_CLASS: Readonly<Record<SegmentState, string>> = {
	spent: "bg-primary text-primary-foreground",
	current: "bg-primary/20 text-foreground ring-2 ring-primary",
	upcoming: "bg-muted text-muted-foreground opacity-60",
};

function stateOf(segment: Step, step: Step): SegmentState {
	if (segment < step) return "spent";
	return segment === step ? "current" : "upcoming";
}

/** Six segments labelled with the clip length of each step. Static: no progress animation. */
export function LadderBar({
	step,
	clipMs,
}: {
	step: Step;
	clipMs: Readonly<Record<Step, number>>;
}): React.JSX.Element {
	return (
		<ol
			aria-label={ladderLabel(step, STEPS.length)}
			className="grid grid-cols-6 gap-1.5"
		>
			{STEPS.map((segment) => {
				const state = stateOf(segment, step);
				return (
					<li
						key={segment}
						data-state={state}
						aria-current={state === "current" ? "step" : undefined}
						className={cn(
							"rounded-md py-1.5 text-center text-xs font-medium tabular-nums",
							STATE_CLASS[state],
						)}
					>
						{clipLabel(clipMs[segment])}
					</li>
				);
			})}
		</ol>
	);
}
