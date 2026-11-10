export const SCOPES: readonly string[] = [
	"streaming",
	"user-read-private",
	"user-read-email", // required by the Web Playback SDK alongside streaming and user-read-private
	"user-read-playback-state",
	"user-modify-playback-state",
	"playlist-read-private",
	"playlist-read-collaborative",
];

export const REFRESH_WINDOW_MS = 60_000;

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKENS_KEY = "harkdle.auth";
const VERIFIER_KEY = "harkdle.pkce";

export interface Tokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	scope?: string;
}

export interface KeyValueStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface FetchResponse {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
	headers?: { get(name: string): string | null }; // the real Response has it
}

export type FetchFn = (
	url: string,
	init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export interface AuthDeps {
	clientId: string;
	redirectUri: string;
	fetchFn: FetchFn;
	now: () => number;
	randomBytes: (n: number) => Uint8Array;
	store: KeyValueStore;
	navigate: (url: string) => void;
	replaceUrl: (path: string) => void;
}

export type AuthErrorKind =
	| "not-logged-in"
	| "missing-verifier"
	| "token-endpoint"
	| "refresh-failed";

export class AuthError extends Error {
	readonly kind: AuthErrorKind;

	constructor(kind: AuthErrorKind, message: string) {
		super(message);
		this.name = "AuthError";
		this.kind = kind;
	}
}

export interface Auth {
	startLogin(): Promise<void>;
	handleCallback(search: string): Promise<boolean>;
	getAccessToken(): Promise<string>;
	isLoggedIn(): boolean;
	logout(): void;
}

function base64Url(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function challengeFor(verifier: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64Url(new Uint8Array(digest));
}

export function needsRefresh(t: Tokens, now: number): boolean {
	return t.expiresAt - now < REFRESH_WINDOW_MS;
}

export function redirectUriFor(
	loc: { origin: string },
	baseUrl: string,
	dev: boolean,
): string {
	return dev ? `${loc.origin}/callback` : `${loc.origin}${baseUrl}`;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
	if (raw === null) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) return null;
		const record = value as Record<string, unknown>;
		return record.v === 1 ? record : null;
	} catch {
		return null;
	}
}

function toTokens(r: Record<string, unknown>): Tokens | null {
	const { accessToken, refreshToken, expiresAt, scope } = r;
	if (
		typeof accessToken !== "string" ||
		typeof refreshToken !== "string" ||
		typeof expiresAt !== "number" ||
		(scope !== undefined && typeof scope !== "string")
	) {
		return null;
	}
	return scope === undefined
		? { accessToken, refreshToken, expiresAt }
		: { accessToken, refreshToken, expiresAt, scope };
}

export function createAuth(deps: AuthDeps): Auth {
	let cache: Tokens | null = null;
	let inflightRefresh: Promise<Tokens> | null = null;

	function load(): Tokens | null {
		if (cache) return cache;
		const record = parseJson(deps.store.getItem(TOKENS_KEY));
		cache = record ? toTokens(record) : null;
		return cache;
	}

	function save(t: Tokens): void {
		cache = t;
		deps.store.setItem(TOKENS_KEY, JSON.stringify({ v: 1, ...t }));
	}

	function loadVerifier(): string | null {
		const record = parseJson(deps.store.getItem(VERIFIER_KEY));
		return typeof record?.verifier === "string" ? record.verifier : null;
	}

	async function tokenRequest(
		kind: "token-endpoint" | "refresh-failed",
		body: Record<string, string>,
		previousRefreshToken?: string,
	): Promise<Tokens> {
		let res: FetchResponse;
		let json: unknown;
		try {
			res = await deps.fetchFn(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: deps.clientId,
					...body,
				}).toString(),
			});
			if (!res.ok) {
				throw new AuthError(kind, `token endpoint returned ${res.status}`);
			}
			json = await res.json();
		} catch (e) {
			if (e instanceof AuthError) throw e;
			throw new AuthError(kind, `token request failed: ${String(e)}`);
		}
		const j = (typeof json === "object" && json !== null ? json : {}) as Record<
			string,
			unknown
		>;
		const refreshToken = j.refresh_token ?? previousRefreshToken;
		if (
			typeof j.access_token !== "string" ||
			typeof j.expires_in !== "number" ||
			typeof refreshToken !== "string" ||
			(j.scope !== undefined && typeof j.scope !== "string")
		) {
			throw new AuthError(kind, "token endpoint returned a malformed body");
		}
		const tokens: Tokens = {
			accessToken: j.access_token,
			refreshToken,
			expiresAt: deps.now() + j.expires_in * 1000,
		};
		if (j.scope !== undefined) tokens.scope = j.scope;
		return tokens;
	}

	return {
		async startLogin() {
			const verifier = base64Url(deps.randomBytes(64));
			deps.store.setItem(VERIFIER_KEY, JSON.stringify({ v: 1, verifier }));
			const params = new URLSearchParams({
				client_id: deps.clientId,
				response_type: "code",
				redirect_uri: deps.redirectUri,
				scope: SCOPES.join(" "),
				code_challenge_method: "S256",
				code_challenge: await challengeFor(verifier),
			});
			deps.navigate(`${AUTH_URL}?${params}`);
		},

		async handleCallback(search) {
			const params = new URLSearchParams(search);
			const error = params.get("error");
			if (error) {
				throw new AuthError("token-endpoint", `Spotify denied login: ${error}`);
			}
			const code = params.get("code");
			if (!code) return false;
			const verifier = loadVerifier();
			if (!verifier) {
				throw new AuthError(
					"missing-verifier",
					"Missing PKCE verifier: the app may have been opened on a different origin than the one that started login.",
				);
			}
			const tokens = await tokenRequest("token-endpoint", {
				grant_type: "authorization_code",
				code,
				redirect_uri: deps.redirectUri,
				code_verifier: verifier,
			});
			save(tokens);
			deps.store.removeItem(VERIFIER_KEY);
			deps.replaceUrl("/");
			return true;
		},

		async getAccessToken() {
			const tokens = load();
			if (!tokens) throw new AuthError("not-logged-in", "Not logged in.");
			if (!needsRefresh(tokens, deps.now())) return tokens.accessToken;
			inflightRefresh ??= tokenRequest(
				"refresh-failed",
				{ grant_type: "refresh_token", refresh_token: tokens.refreshToken },
				tokens.refreshToken,
			)
				.then((fresh) => {
					save(fresh);
					return fresh;
				})
				.finally(() => {
					inflightRefresh = null;
				});
			return (await inflightRefresh).accessToken;
		},

		isLoggedIn() {
			return load() !== null;
		},

		logout() {
			cache = null;
			deps.store.removeItem(TOKENS_KEY);
			deps.store.removeItem(VERIFIER_KEY);
		},
	};
}
