import type { CueTarget } from "./adapter";
import {
	type ConfirmDeps,
	ConfirmTimeout,
	isTrack,
	POLL_MS,
	pauseConfirmed,
	TIMEOUT_MS,
} from "./confirm";
import type { TransportState } from "./transport";

export interface ClipControl {
	/** Set by the engine (hidden handler, stop, reveal, interruption); polled every iteration. */
	cancel: "hidden" | "stopped" | "revealed" | "interrupted" | null;
}

type Cancel = NonNullable<ClipControl["cancel"]>;

export type ClipEnd = "ended" | Cancel;

/** Like waitForState, but returns the cancel reason as soon as `control.cancel` is set. */
async function waitUnlessCancelled(
	deps: ConfirmDeps,
	control: ClipControl,
	uri: string,
	what: string,
	test: (state: TransportState) => boolean,
	timeoutMs: number,
): Promise<{ state: TransportState; at: number } | Cancel> {
	const start = deps.clock.now();
	let lastSeen: TransportState | null = null;
	for (;;) {
		if (control.cancel) return control.cancel;
		const error = deps.takeError();
		if (error) throw new Error(error);
		lastSeen = await deps.transport.getState();
		const at = deps.clock.now();
		if (lastSeen && isTrack(lastSeen, uri) && test(lastSeen)) {
			return { state: lastSeen, at };
		}
		if (at - start >= timeoutMs) throw new ConfirmTimeout(what, lastSeen);
		await deps.clock.sleep(POLL_MS);
	}
}

/** resume → first position change → poll to origin + lengthMs → confirmed pause. On "revealed" it returns without pausing. */
export async function runClip(
	deps: ConfirmDeps,
	target: CueTarget,
	originMs: number,
	lengthMs: number,
	control: ClipControl,
): Promise<{ end: ClipEnd; resumeToFirstPositionMs: number }> {
	const { uri } = target;
	// Not measured when the clip is cancelled before audio moves.
	let resumeToFirstPositionMs = -1;

	const cancelled = async (cancel: Cancel) => {
		if (cancel === "interrupted") {
			await pauseConfirmed(deps, uri, "interrupted pause").catch(() => {});
		} else if (cancel !== "revealed") {
			await pauseConfirmed(deps, uri, `${cancel} pause`);
		}
		return { end: cancel, resumeToFirstPositionMs };
	};

	// A stale position left over from the previous clip of this track must not count as movement.
	const stale = (await deps.transport.getState())?.positionMs ?? null;
	const t0 = deps.clock.now();
	await deps.transport.resume();

	const first = await waitUnlessCancelled(
		deps,
		control,
		uri,
		"first position change",
		(s) => !s.paused && s.positionMs > originMs && s.positionMs !== stale,
		TIMEOUT_MS,
	);
	if (typeof first === "string") return cancelled(first);
	resumeToFirstPositionMs = first.at - t0;

	const end = originMs + lengthMs;
	const reached = await waitUnlessCancelled(
		deps,
		control,
		uri,
		"clip end",
		(s) => s.positionMs >= end,
		lengthMs + TIMEOUT_MS,
	);
	if (typeof reached === "string") return cancelled(reached);

	await pauseConfirmed(deps, uri, "clip-end pause");
	return { end: "ended", resumeToFirstPositionMs };
}
