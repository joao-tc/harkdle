import type { CueTarget } from "./adapter";
import {
	type ConfirmDeps,
	GRACE_MS,
	POLL_MS,
	pauseConfirmed,
	seekConfirmed,
	waitForState,
} from "./confirm";

export interface CueDeps extends ConfirmDeps {
	getVolume(): number; // the user's volume, restored after the mute
}

const MUTE_NOTE = "mute not confirmed";

async function muteConfirmed(deps: CueDeps): Promise<boolean> {
	const { transport, clock } = deps;
	try {
		await transport.setVolume(0);
		const start = clock.now();
		while ((await transport.getVolume()) !== 0) {
			if (clock.now() - start >= GRACE_MS) return false;
			await clock.sleep(POLL_MS);
		}
		return true;
	} catch {
		return false;
	}
}

/** Returns originMs: the confirmed paused position the clip will count from. */
export async function runCue(
	deps: CueDeps,
	target: CueTarget,
): Promise<{ originMs: number }> {
	const muted = await muteConfirmed(deps);
	try {
		await deps.transport.playFrom(target.uri, target.startMs);
		// A pause sent before the track has loaded is lost, so only pause once it is really playing.
		await waitForState(
			deps,
			target.uri,
			"cue playback",
			(state) => !state.paused && state.positionMs > target.startMs,
		);
		await pauseConfirmed(deps, target.uri, "cue pause");
		const { state } = await seekConfirmed(deps, target.uri, target.startMs);
		return { originMs: state.positionMs };
	} catch (e) {
		if (!muted && e instanceof Error) e.message += ` (${MUTE_NOTE})`;
		throw e;
	} finally {
		await deps.transport.setVolume(deps.getVolume()).catch(() => {});
	}
}
