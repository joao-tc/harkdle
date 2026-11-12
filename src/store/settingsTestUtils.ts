import type { KeyValueStore } from "@/spotify/auth";

export interface MemoryStorage extends KeyValueStore {
	readonly data: Map<string, string>;
	/** Number of setItem calls, counted even when the call throws. */
	writes: number;
}

export function memoryStorage(
	opts: {
		initial?: Record<string, string>;
		failRead?: boolean;
		failWrite?: boolean;
	} = {},
): MemoryStorage {
	const data = new Map(Object.entries(opts.initial ?? {}));
	const storage: MemoryStorage = {
		data,
		writes: 0,
		getItem(key) {
			if (opts.failRead) throw new Error("storage read blocked");
			return data.get(key) ?? null;
		},
		setItem(key, value) {
			storage.writes++;
			if (opts.failWrite) throw new Error("storage write blocked");
			data.set(key, value);
		},
		removeItem(key) {
			data.delete(key);
		},
	};
	return storage;
}
