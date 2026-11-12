import { DEFAULT_ROUNDS, ROUND_PRESETS } from "@/game/presets";
import type { StartMode } from "@/game/types";
import type { KeyValueStore } from "@/spotify/auth";
import { DEFAULT_VOLUME } from "./game";

export interface Settings {
	readonly volume: number;
	readonly rounds: number;
	readonly lastPlaylistId: string | null;
	readonly startMode: StartMode;
}

export const SETTINGS_KEY = "harkdle.settings";

export const DEFAULT_SETTINGS: Settings = {
	volume: DEFAULT_VOLUME,
	rounds: DEFAULT_ROUNDS,
	lastPlaylistId: null,
	startMode: "classic",
};

export interface SettingsHandle {
	get(): Settings;
	update(patch: Partial<Settings>): void;
}

function parse(storage: KeyValueStore): Settings {
	try {
		const raw = storage.getItem(SETTINGS_KEY);
		if (raw === null) return DEFAULT_SETTINGS;
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return DEFAULT_SETTINGS;
		}
		const record = value as Record<string, unknown>;
		if (record.v !== 1) return DEFAULT_SETTINGS;
		const { volume, rounds, lastPlaylistId, startMode } = record;
		return {
			volume:
				typeof volume === "number" && Number.isFinite(volume)
					? Math.min(1, Math.max(0, volume))
					: DEFAULT_SETTINGS.volume,
			rounds:
				typeof rounds === "number" &&
				(ROUND_PRESETS as readonly number[]).includes(rounds)
					? rounds
					: DEFAULT_SETTINGS.rounds,
			lastPlaylistId:
				typeof lastPlaylistId === "string" && lastPlaylistId !== ""
					? lastPlaylistId
					: null,
			startMode:
				startMode === "classic" || startMode === "random"
					? startMode
					: DEFAULT_SETTINGS.startMode,
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
}

export function createSettings(storage: KeyValueStore): SettingsHandle {
	let settings = parse(storage);
	return {
		get: () => settings,
		update(patch) {
			settings = { ...settings, ...patch };
			try {
				storage.setItem(SETTINGS_KEY, JSON.stringify({ v: 1, ...settings }));
			} catch {
				// storage can be full or blocked; the in-memory copy still serves this session
			}
		},
	};
}
