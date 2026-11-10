import type { FetchFn, FetchResponse } from "./auth";

export const API_BASE = "https://api.spotify.com/v1";
export const RATE_LIMIT_RETRIES = 3; // after the first request
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000]; // used when Retry-After is unreadable
export const MAX_WAIT_MS = 10_000;

const API_ORIGIN_PREFIX = "https://api.spotify.com/";

export type ApiErrorKind =
	| "unauthorized" // 401, or getAccessToken threw
	| "restricted" // 403
	| "not-found" // 404
	| "rate-limited" // 429 after the last retry
	| "network" // fetchFn threw
	| "unexpected"; // anything else, including a non-JSON body or a bad target

export class SpotifyApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status: number | null; // HTTP status when there was a response

	constructor(kind: ApiErrorKind, message: string, status?: number) {
		super(message);
		this.name = "SpotifyApiError";
		this.kind = kind;
		this.status = status ?? null;
	}
}

export interface SpotifyApiDeps {
	getAccessToken: () => Promise<string>;
	fetchFn: FetchFn;
	sleep: (ms: number) => Promise<void>;
}

export interface SpotifyApi {
	// `target` is "/path?query" (joined to API_BASE) or an absolute URL that starts
	// with "https://api.spotify.com/". Anything else throws `unexpected` with no request.
	get(target: string): Promise<unknown>;
}

function resolveUrl(target: string): string {
	if (target.startsWith(API_ORIGIN_PREFIX)) return target;
	if (target.startsWith("/") && !target.startsWith("//")) {
		return `${API_BASE}${target}`;
	}
	throw new SpotifyApiError(
		"unexpected",
		"request target is not on the Spotify API",
	);
}

function retryAfterMs(res: FetchResponse): number | undefined {
	const raw = res.headers?.get("retry-after");
	if (raw === null || raw === undefined || raw.trim() === "") return undefined;
	const seconds = Number(raw);
	return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function createSpotifyApi(deps: SpotifyApiDeps): SpotifyApi {
	const { getAccessToken, fetchFn, sleep } = deps;

	async function attempt(url: string): Promise<FetchResponse> {
		let token: string;
		try {
			token = await getAccessToken();
		} catch (e) {
			throw new SpotifyApiError(
				"unauthorized",
				`no usable token: ${message(e)}`,
			);
		}
		try {
			return await fetchFn(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${token}` },
			});
		} catch (e) {
			throw new SpotifyApiError("network", message(e));
		}
	}

	return {
		async get(target) {
			const url = resolveUrl(target);
			for (let retry = 0; ; retry++) {
				const res = await attempt(url);
				if (res.status === 429) {
					if (retry >= RATE_LIMIT_RETRIES) {
						throw new SpotifyApiError("rate-limited", "rate limited", 429);
					}
					const wait = retryAfterMs(res) ?? BACKOFF_MS[retry] ?? MAX_WAIT_MS;
					await sleep(Math.min(MAX_WAIT_MS, wait));
					continue;
				}
				if (res.status === 401) {
					throw new SpotifyApiError("unauthorized", "unauthorized", 401);
				}
				if (res.status === 403) {
					throw new SpotifyApiError("restricted", "forbidden", 403);
				}
				if (res.status === 404) {
					throw new SpotifyApiError("not-found", "not found", 404);
				}
				if (res.status < 200 || res.status >= 300) {
					throw new SpotifyApiError(
						"unexpected",
						`unexpected status ${res.status}`,
						res.status,
					);
				}
				try {
					return await res.json();
				} catch (e) {
					throw new SpotifyApiError(
						"unexpected",
						`unreadable response body: ${message(e)}`,
						res.status,
					);
				}
			}
		},
	};
}
