import type { InterruptionReason, Recovery } from "@/store/game";
import {
	PLAY_HERE_BUTTON,
	PLAY_HERE_FAILED,
	PLAY_HERE_WORKING,
	playHereReason,
} from "@/ui/game/gameCopy";
import { Alert, AlertDescription, AlertTitle } from "@/ui/primitives/alert";
import { Button } from "@/ui/primitives/button";

/** Replaces the Play button while playback is interrupted (R13, L4). */
export function PlayHereBanner({
	reason,
	recovery,
	onRecover,
}: {
	reason: InterruptionReason;
	recovery: Recovery;
	onRecover(): void;
}): React.JSX.Element {
	const working = recovery === "working";
	return (
		<Alert className="flex flex-col gap-3">
			<AlertTitle>{playHereReason(reason)}</AlertTitle>
			{recovery === "failed" ? (
				<AlertDescription>{PLAY_HERE_FAILED}</AlertDescription>
			) : null}
			<Button type="button" disabled={working} onClick={onRecover}>
				{working ? PLAY_HERE_WORKING : PLAY_HERE_BUTTON}
			</Button>
		</Alert>
	);
}
