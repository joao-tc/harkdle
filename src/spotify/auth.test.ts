import { describe, expect, it } from "vitest";
import {
	type AuthDeps,
	AuthError,
	type AuthErrorKind,
	challengeFor,
	createAuth,
	type FetchFn,
	type KeyValueStore,
	needsRefresh,
	REFRESH_WINDOW_MS,
	redirectUriFor,
	SCOPES,
} from "./auth";

const NOW = 1_000_000;
const REDIRECT = "http://127.0.0.1:5173/callback";
// 0xfb 0xff 0xbf encodes to "+/+/" in plain base64, so url-safety is exercised
const FIXED_BYTES = Uint8Array.from(
	{ length: 64 },
	(_, i) => [0xfb, 0xff, 0xbf][i % 3] as number,
);

function memStore(initial: Record<string, string> = {}): KeyValueStore & {
	data: Map<string, string>;
} {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
	};
}

interface Harness {
	deps: AuthDeps;
	store: ReturnType<typeof memStore>;
	requests: { url: string; body: URLSearchParams }[];
	navigated: string[];
	replaced: string[];
	clock: { now: number };
}

function harness(
	opts: { stored?: Record<string, string>; respond?: FetchFn } = {},
): Harness {
	const store = memStore(opts.stored);
	const requests: Harness["requests"] = [];
	const navigated: string[] = [];
	const replaced: string[] = [];
	const clock = { now: NOW };
	const respond: FetchFn =
		opts.respond ??
		(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ access_token: "new", expires_in: 3600 }),
		}));
	const deps: AuthDeps = {
		clientId: "cid",
		redirectUri: REDIRECT,
		store,
		now: () => clock.now,
		randomBytes: () => FIXED_BYTES,
		navigate: (url) => navigated.push(url),
		replaceUrl: (path) => replaced.push(path),
		fetchFn: (url, init) => {
			requests.push({ url, body: new URLSearchParams(init.body) });
			return respond(url, init);
		},
	};
	return { deps, store, requests, navigated, replaced, clock };
}

const tokensJson = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		v: 1,
		accessToken: "old",
		refreshToken: "r1",
		expiresAt: NOW + 10 * REFRESH_WINDOW_MS,
		...over,
	});
const withTokens = (over: Record<string, unknown> = {}) => ({
	"harkdle.auth": tokensJson(over),
});
const withVerifier = {
	"harkdle.pkce": JSON.stringify({ v: 1, verifier: "ver" }),
};

async function kindOf(
	p: Promise<unknown>,
): Promise<AuthErrorKind | "no-throw"> {
	try {
		await p;
		return "no-throw";
	} catch (e) {
		if (e instanceof AuthError) return e.kind;
		throw e;
	}
}

describe("constants", () => {
	it("requests exactly the seven scopes", () => {
		expect([...SCOPES].sort()).toEqual(
			[
				"streaming",
				"user-read-private",
				"user-read-email",
				"user-read-playback-state",
				"user-modify-playback-state",
				"playlist-read-private",
				"playlist-read-collaborative",
			].sort(),
		);
	});
});

describe("challengeFor", () => {
	it("matches the RFC 7636 appendix B vector", async () => {
		expect(
			await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
		).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
	});
});

describe("needsRefresh", () => {
	const t = { accessToken: "a", refreshToken: "r", expiresAt: 100_000 };
	it.each([
		[100_000 - REFRESH_WINDOW_MS, false],
		[100_000 - REFRESH_WINDOW_MS + 1, true],
		[0, false],
		[200_000, true],
	])("at now=%i stale=%s", (now, stale) => {
		expect(needsRefresh(t, now)).toBe(stale);
	});
});

describe("redirectUriFor", () => {
	it.each([
		["http://127.0.0.1:5173", "/", true, "http://127.0.0.1:5173/callback"],
		[
			"http://127.0.0.1:5173",
			"/harkdle/",
			true,
			"http://127.0.0.1:5173/callback",
		],
		[
			"https://user.github.io",
			"/harkdle/",
			false,
			"https://user.github.io/harkdle/",
		],
		["https://harkdle.app", "/", false, "https://harkdle.app/"],
	])("%s base=%s dev=%s", (origin, base, dev, expected) => {
		expect(redirectUriFor({ origin }, base, dev)).toBe(expected);
	});
});

describe("startLogin", () => {
	it("stores a url-safe verifier and navigates to a matching authorize url", async () => {
		const h = harness();
		await createAuth(h.deps).startLogin();

		const stored = JSON.parse(h.store.data.get("harkdle.pkce") ?? "null");
		expect(stored.v).toBe(1);
		expect(stored.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);

		expect(h.navigated).toHaveLength(1);
		const url = new URL(h.navigated[0] as string);
		expect(`${url.origin}${url.pathname}`).toBe(
			"https://accounts.spotify.com/authorize",
		);
		const p = url.searchParams;
		expect(p.get("client_id")).toBe("cid");
		expect(p.get("response_type")).toBe("code");
		expect(p.get("redirect_uri")).toBe(REDIRECT);
		expect(p.get("code_challenge_method")).toBe("S256");
		expect(p.get("scope")?.split(" ").sort()).toEqual([...SCOPES].sort());
		expect(p.get("code_challenge")).toBe(await challengeFor(stored.verifier));
	});
});

describe("getAccessToken", () => {
	it("returns a fresh token without a request", async () => {
		const h = harness({ stored: withTokens() });
		expect(await createAuth(h.deps).getAccessToken()).toBe("old");
		expect(h.requests).toHaveLength(0);
	});

	it("refreshes a stale token once and keeps the refresh token when omitted", async () => {
		const h = harness({
			stored: withTokens({ expiresAt: NOW + REFRESH_WINDOW_MS - 1 }),
		});
		expect(await createAuth(h.deps).getAccessToken()).toBe("new");
		expect(h.requests).toHaveLength(1);
		expect(h.requests[0]?.body.get("grant_type")).toBe("refresh_token");
		expect(h.requests[0]?.body.get("refresh_token")).toBe("r1");
		expect(h.requests[0]?.body.get("client_id")).toBe("cid");
		expect(JSON.parse(h.store.data.get("harkdle.auth") ?? "null")).toEqual({
			v: 1,
			accessToken: "new",
			refreshToken: "r1",
			expiresAt: NOW + 3_600_000,
		});
	});

	it("adopts a rotated refresh token", async () => {
		const h = harness({
			stored: withTokens({ expiresAt: NOW }),
			respond: async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					access_token: "new",
					refresh_token: "r2",
					expires_in: 60,
				}),
			}),
		});
		await createAuth(h.deps).getAccessToken();
		expect(
			JSON.parse(h.store.data.get("harkdle.auth") ?? "null").refreshToken,
		).toBe("r2");
	});

	it.each([
		[
			"non-ok response",
			async () => ({ ok: false, status: 400, json: async () => ({}) }),
		],
		[
			"thrown fetch",
			async () => {
				throw new Error("offline");
			},
		],
		[
			"malformed body",
			async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }),
		],
	] as [string, FetchFn][])(
		"%s -> refresh-failed, tokens untouched",
		async (_n, respond) => {
			const stored = withTokens({ expiresAt: NOW });
			const h = harness({ stored, respond });
			expect(await kindOf(createAuth(h.deps).getAccessToken())).toBe(
				"refresh-failed",
			);
			expect(h.store.data.get("harkdle.auth")).toBe(stored["harkdle.auth"]);
		},
	);

	it("shares one refresh request between concurrent callers", async () => {
		const h = harness({ stored: withTokens({ expiresAt: NOW }) });
		const auth = createAuth(h.deps);
		const [a, b] = await Promise.all([
			auth.getAccessToken(),
			auth.getAccessToken(),
		]);
		expect([a, b]).toEqual(["new", "new"]);
		expect(h.requests).toHaveLength(1);
	});

	it("is not-logged-in without tokens", async () => {
		expect(await kindOf(createAuth(harness().deps).getAccessToken())).toBe(
			"not-logged-in",
		);
	});
});

describe("handleCallback", () => {
	it("exchanges the code, stores versioned tokens, drops the verifier, cleans the url", async () => {
		const h = harness({
			stored: withVerifier,
			respond: async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					access_token: "acc",
					refresh_token: "ref",
					expires_in: 3600,
					scope: "streaming",
				}),
			}),
		});
		const auth = createAuth(h.deps);
		expect(await auth.handleCallback("?code=abc")).toBe(true);

		const body = h.requests[0]?.body;
		expect(h.requests[0]?.url).toBe("https://accounts.spotify.com/api/token");
		expect(Object.fromEntries(body ?? [])).toEqual({
			grant_type: "authorization_code",
			code: "abc",
			redirect_uri: REDIRECT,
			code_verifier: "ver",
			client_id: "cid",
		});
		expect(JSON.parse(h.store.data.get("harkdle.auth") ?? "null")).toEqual({
			v: 1,
			accessToken: "acc",
			refreshToken: "ref",
			expiresAt: NOW + 3_600_000,
			scope: "streaming",
		});
		expect(h.store.data.has("harkdle.pkce")).toBe(false);
		expect(h.replaced).toEqual(["/"]);
		expect(auth.isLoggedIn()).toBe(true);
	});

	it("returns false when there is no code", async () => {
		const h = harness({ stored: withVerifier });
		expect(await createAuth(h.deps).handleCallback("")).toBe(false);
		expect(h.requests).toHaveLength(0);
		expect(h.replaced).toHaveLength(0);
	});

	it("rejects with missing-verifier when none was stored", async () => {
		const h = harness();
		const p = createAuth(h.deps).handleCallback("?code=abc");
		expect(await kindOf(p)).toBe("missing-verifier");
		expect(h.requests).toHaveLength(0);
	});

	it("rejects with token-endpoint on a non-ok response and keeps the verifier", async () => {
		const h = harness({
			stored: withVerifier,
			respond: async () => ({ ok: false, status: 400, json: async () => ({}) }),
		});
		expect(await kindOf(createAuth(h.deps).handleCallback("?code=abc"))).toBe(
			"token-endpoint",
		);
		expect(h.store.data.has("harkdle.pkce")).toBe(true);
		expect(h.store.data.has("harkdle.auth")).toBe(false);
		expect(h.replaced).toHaveLength(0);
	});

	it("rejects with the Spotify error when the user denied access", async () => {
		const h = harness({ stored: withVerifier });
		const p = createAuth(h.deps).handleCallback("?error=access_denied");
		await expect(p).rejects.toThrow(/access_denied/);
		expect(h.requests).toHaveLength(0);
	});
});

describe("stored tokens", () => {
	it.each([
		["absent", undefined],
		["garbage", "not json{"],
		["json null", "null"],
		["version 2", tokensJson({ v: 2 })],
		[
			"missing version",
			JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: 1 }),
		],
		["missing accessToken", tokensJson({ accessToken: undefined })],
		["expiresAt as string", tokensJson({ expiresAt: "soon" })],
		["refreshToken as number", tokensJson({ refreshToken: 5 })],
		["scope as number", tokensJson({ scope: 5 })],
	])("%s -> logged out without throwing", async (_n, raw) => {
		const h = harness({
			stored: raw === undefined ? {} : { "harkdle.auth": raw },
		});
		const auth = createAuth(h.deps);
		expect(auth.isLoggedIn()).toBe(false);
		expect(await kindOf(auth.getAccessToken())).toBe("not-logged-in");
	});

	it("accepts a well-formed record with scope", () => {
		const h = harness({ stored: withTokens({ scope: "streaming" }) });
		expect(createAuth(h.deps).isLoggedIn()).toBe(true);
	});
});

describe("logout", () => {
	it("clears tokens and verifier and logs out", async () => {
		const h = harness({ stored: { ...withTokens(), ...withVerifier } });
		const auth = createAuth(h.deps);
		expect(auth.isLoggedIn()).toBe(true);
		auth.logout();
		expect(h.store.data.has("harkdle.auth")).toBe(false);
		expect(h.store.data.has("harkdle.pkce")).toBe(false);
		expect(auth.isLoggedIn()).toBe(false);
		expect(await kindOf(auth.getAccessToken())).toBe("not-logged-in");
	});
});
