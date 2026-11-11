import type { StoreApi } from "zustand/vanilla";
import { createRng } from "@/game/rng";
import type { PlaylistTrack } from "@/spotify/clean";
import type {
	PlaybackAdapter,
	PlaybackError,
} from "@/spotify/playback/adapter";
import {
	createFakeAdapter,
	type FakeAdapterControls,
	type FakeCall,
} from "@/spotify/playback/fakeAdapter";
import { createGameStore, type GameStoreState } from "./game";

const SEED = 7;

export interface GameHarness {
	readonly store: StoreApi<GameStoreState>;
	readonly adapter: PlaybackAdapter & FakeAdapterControls;
	readonly tracks: readonly PlaylistTrack[];
	/** The errors `onStartFailed` was called with, in order. */
	readonly startFailures: readonly PlaybackError[];
	/** The arguments of every adapter call to `method`, in order. */
	calls(method: FakeCall["method"]): readonly (readonly unknown[])[];
	/** The `ms` of each `sleep` still waiting, oldest first. */
	pendingSleeps(): readonly number[];
	/** Resolves the oldest pending `sleep`, then lets the store's continuations run. */
	tick(): Promise<void>;
}

/** Lets promise continuations queued by the store and the fake adapter run. */
export async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

// Every fourth track is a single, so its album is not asked for.
export function makeTracks(count = 15): readonly PlaylistTrack[] {
	return Array.from({ length: count }, (_, index) => {
		const n = index + 1;
		return {
			id: `t${n}`,
			uri: `spotify:track:t${n}`,
			title: `Title ${n}`,
			artists: [`Artist ${n}`],
			album: { name: `Album ${n}`, kind: n % 4 === 0 ? "single" : "album" },
			durationMs: 200_000,
			coverUrl: null,
		};
	});
}

/** `seeds[n]` seeds the n-th game's rng; the last one repeats. */
export function createHarness(
	options: { readonly seeds?: readonly number[] } = {},
): GameHarness {
	const { seeds = [SEED] } = options;
	let games = 0;
	const adapter = createFakeAdapter();
	const startFailures: PlaybackError[] = [];
	const sleeps: Array<{ ms: number; resolve: () => void }> = [];
	const store = createGameStore({
		adapter,
		newRng: () => createRng(seeds[Math.min(games++, seeds.length - 1)] ?? SEED),
		sleep: (ms) =>
			new Promise<void>((resolve) => {
				sleeps.push({ ms, resolve });
			}),
		onStartFailed: (error) => {
			startFailures.push(error);
		},
	});
	return {
		store,
		adapter,
		tracks: makeTracks(),
		startFailures,
		calls: (method) =>
			adapter.calls.filter((call) => call.method === method).map((c) => c.args),
		pendingSleeps: () => sleeps.map((sleep) => sleep.ms),
		async tick() {
			sleeps.shift()?.resolve();
			await flush();
		},
	};
}
