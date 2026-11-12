import type { StoreApi } from "zustand/vanilla";
import type { GameStoreState, Stage } from "./game";

export const IN_PROGRESS: ReadonlySet<Stage> = new Set<Stage>([
	"connecting",
	"countdown",
	"round",
	"reveal",
]);

export function isInProgress(stage: Stage): boolean {
	return IN_PROGRESS.has(stage);
}

interface UnloadEvent {
	preventDefault(): void;
	returnValue: unknown;
}

type UnloadListener = (event: UnloadEvent) => void;

export interface UnloadTarget {
	addEventListener(type: "beforeunload", listener: UnloadListener): void;
	removeEventListener(type: "beforeunload", listener: UnloadListener): void;
}

/** Listens for beforeunload; while the game is in progress it calls preventDefault() and sets returnValue = "". Returns the unsubscribe. */
export function connectLeaveGuard(
	game: StoreApi<GameStoreState>,
	target: UnloadTarget,
): () => void {
	const listener: UnloadListener = (event) => {
		if (!isInProgress(game.getState().stage)) return;
		event.preventDefault();
		// Some browsers only show the confirmation when returnValue is set.
		event.returnValue = "";
	};
	target.addEventListener("beforeunload", listener);
	return () => target.removeEventListener("beforeunload", listener);
}
