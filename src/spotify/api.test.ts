import { describe, expect, it, vi } from "vitest";
import {
	API_BASE,
	createSpotifyApi,
	MAX_WAIT_MS,
	SpotifyApiError,
} from "./api";
import type { FetchFn } from "./auth";

type Res = Awaited<ReturnType<FetchFn>>;

function respond(
	status: number,
	body: unknown = {},
	retryAfter?: string | null,
): Res {
	const res: Res = {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
	if (retryAfter !== undefined) {
		res.headers = {
			get: (name) => (name.toLowerCase() === "retry-after" ? retryAfter : null),
		};
	}
	return res;
}

// Each call to fetchFn takes the next scripted outcome (the last one repeats).
function setup(script: (Res | Error)[], tokens: (string | Error)[] = ["tok"]) {
	let f = 0;
	let t = 0;
	const fetchFn = vi.fn<FetchFn>(async () => {
		const next = script[Math.min(f++, script.length - 1)] as Res | Error;
		if (next instanceof Error) throw next;
		return next;
	});
	const getAccessToken = vi.fn(async () => {
		const next = tokens[Math.min(t++, tokens.length - 1)] as string | Error;
		if (next instanceof Error) throw next;
		return next;
	});
	const waits: number[] = [];
	const sleep = vi.fn(async (ms: number) => {
		waits.push(ms);
	});
	const api = createSpotifyApi({ getAccessToken, fetchFn, sleep });
	return { api, fetchFn, getAccessToken, sleep, waits };
}

async function kindOf(p: Promise<unknown>): Promise<SpotifyApiError> {
	try {
		await p;
	} catch (e) {
		expect(e).toBeInstanceOf(SpotifyApiError);
		return e as SpotifyApiError;
	}
	throw new Error("expected a rejection");
}

describe("targets", () => {
	it("joins a relative target to the API base", async () => {
		const s = setup([respond(200, { a: 1 })]);
		expect(await s.api.get("/me/playlists?limit=50")).toEqual({ a: 1 });
		expect(s.fetchFn).toHaveBeenCalledWith(
			`${API_BASE}/me/playlists?limit=50`,
			{
				method: "GET",
				headers: { Authorization: "Bearer tok" },
			},
		);
	});

	it("uses an absolute api.spotify.com target as is", async () => {
		const s = setup([respond(200, {})]);
		const url =
			"https://api.spotify.com/v1/playlists/x/items?offset=100&limit=100";
		await s.api.get(url);
		expect(s.fetchFn.mock.calls[0]?.[0]).toBe(url);
	});

	it.each([
		["another host", "https://evil.test/v1/me"],
		["a look-alike host", "https://api.spotify.com.evil.test/v1/me"],
		["plain http", "http://api.spotify.com/v1/me"],
		["a protocol-relative url", "//api.spotify.com/v1/me"],
		["user-info", "https://api.spotify.com@evil.test/v1/me"],
		["a bare path", "me/playlists"],
		["an empty string", ""],
	])(
		"rejects %s with no token fetch and no request",
		async (_label, target) => {
			const s = setup([respond(200)]);
			const err = await kindOf(s.api.get(target));
			expect(err.kind).toBe("unexpected");
			expect(s.getAccessToken).not.toHaveBeenCalled();
			expect(s.fetchFn).not.toHaveBeenCalled();
		},
	);
});

describe("status mapping", () => {
	it.each([
		[401, "unauthorized"],
		[403, "restricted"],
		[404, "not-found"],
		[400, "unexpected"],
		[500, "unexpected"],
		[503, "unexpected"],
		[302, "unexpected"],
	] as const)("status %i -> %s", async (status, kind) => {
		const s = setup([respond(status)]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe(kind);
		expect(err.status).toBe(status);
		expect(s.fetchFn).toHaveBeenCalledTimes(1);
	});

	it("an unparseable 2xx body -> unexpected", async () => {
		const s = setup([
			{
				ok: true,
				status: 200,
				json: async () => {
					throw new SyntaxError("bad json");
				},
			},
		]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("unexpected");
		expect(err.status).toBe(200);
	});

	it("getAccessToken throwing -> unauthorized, no request, null status", async () => {
		const s = setup([respond(200)], [new Error("no session")]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("unauthorized");
		expect(err.status).toBeNull();
		expect(s.fetchFn).not.toHaveBeenCalled();
	});

	it("fetchFn throwing -> network, no retry, null status", async () => {
		const s = setup([new Error("offline")]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("network");
		expect(err.status).toBeNull();
		expect(err.message).toContain("offline");
		expect(s.fetchFn).toHaveBeenCalledTimes(1);
		expect(s.sleep).not.toHaveBeenCalled();
	});
});

describe("429 policy", () => {
	it("an unreadable header backs off 1 s, 2 s, 4 s then gives up (4 requests)", async () => {
		const s = setup([respond(429)]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("rate-limited");
		expect(err.status).toBe(429);
		expect(s.fetchFn).toHaveBeenCalledTimes(4);
		expect(s.waits).toEqual([1000, 2000, 4000]);
	});

	it("honours a readable Retry-After in seconds", async () => {
		const s = setup([respond(429, {}, "3"), respond(200, { ok: true })]);
		expect(await s.api.get("/me")).toEqual({ ok: true });
		expect(s.waits).toEqual([3000]);
	});

	it("caps a long Retry-After at MAX_WAIT_MS", async () => {
		const s = setup([respond(429, {}, "60"), respond(200, {})]);
		await s.api.get("/me");
		expect(s.waits).toEqual([MAX_WAIT_MS]);
	});

	it.each(["abc", "-5", "", "Infinity"])(
		"Retry-After %j falls back to the backoff",
		async (header) => {
			const s = setup([respond(429, {}, header), respond(200, {})]);
			await s.api.get("/me");
			expect(s.waits).toEqual([1000]);
		},
	);

	it("a null header value falls back to the backoff", async () => {
		const s = setup([respond(429, {}, null), respond(200, {})]);
		await s.api.get("/me");
		expect(s.waits).toEqual([1000]);
	});

	it("succeeds on the 2nd attempt", async () => {
		const s = setup([respond(429), respond(200, { n: 2 })]);
		expect(await s.api.get("/me")).toEqual({ n: 2 });
		expect(s.fetchFn).toHaveBeenCalledTimes(2);
	});

	it("succeeds on the 4th (last) attempt", async () => {
		const s = setup([
			respond(429),
			respond(429),
			respond(429),
			respond(200, { n: 4 }),
		]);
		expect(await s.api.get("/me")).toEqual({ n: 4 });
		expect(s.fetchFn).toHaveBeenCalledTimes(4);
		expect(s.waits).toEqual([1000, 2000, 4000]);
	});

	it("takes a fresh token for every attempt", async () => {
		const s = setup(
			[respond(429), respond(429), respond(200, {})],
			["a", "b", "c"],
		);
		await s.api.get("/me");
		expect(s.getAccessToken).toHaveBeenCalledTimes(3);
		const auth = s.fetchFn.mock.calls.map((c) => c[1].headers.Authorization);
		expect(auth).toEqual(["Bearer a", "Bearer b", "Bearer c"]);
	});

	it("a 429 followed by a 401 -> unauthorized", async () => {
		const s = setup([respond(429), respond(401)]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("unauthorized");
		expect(s.fetchFn).toHaveBeenCalledTimes(2);
	});

	it("a token failure on a retry -> unauthorized", async () => {
		const s = setup([respond(429), respond(200)], ["a", new Error("expired")]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("unauthorized");
		expect(s.fetchFn).toHaveBeenCalledTimes(1);
	});

	it("a network failure on a retry -> network", async () => {
		const s = setup([respond(429), new Error("offline")]);
		const err = await kindOf(s.api.get("/me"));
		expect(err.kind).toBe("network");
	});
});

describe("put", () => {
	it("sends PUT with no body and no Content-Type when body is omitted", async () => {
		const s = setup([respond(204)]);
		await expect(s.api.put("/me/player/pause")).resolves.toBeUndefined();
		expect(s.fetchFn).toHaveBeenCalledWith(`${API_BASE}/me/player/pause`, {
			method: "PUT",
			headers: { Authorization: "Bearer tok" },
		});
	});

	it("sends a JSON body with Content-Type when given", async () => {
		const s = setup([respond(204)]);
		await s.api.put("/me/player/play", { uris: ["spotify:track:x"] });
		expect(s.fetchFn).toHaveBeenCalledWith(`${API_BASE}/me/player/play`, {
			method: "PUT",
			headers: {
				Authorization: "Bearer tok",
				"Content-Type": "application/json",
			},
			body: '{"uris":["spotify:track:x"]}',
		});
	});

	it("resolves on 200 with an unreadable body without reading it", async () => {
		const json = vi.fn(async () => {
			throw new SyntaxError("empty");
		});
		const s = setup([{ ok: true, status: 200, json }]);
		await expect(s.api.put("/me/player/pause")).resolves.toBeUndefined();
		expect(json).not.toHaveBeenCalled();
	});

	it.each([
		[401, "unauthorized"],
		[403, "restricted"],
		[404, "not-found"],
		[400, "unexpected"],
		[500, "unexpected"],
	] as const)("status %i -> %s", async (status, kind) => {
		const s = setup([respond(status)]);
		const err = await kindOf(s.api.put("/me/player/pause"));
		expect(err.kind).toBe(kind);
		expect(err.status).toBe(status);
		expect(s.fetchFn).toHaveBeenCalledTimes(1);
	});

	it("fetchFn throwing -> network", async () => {
		const s = setup([new Error("offline")]);
		const err = await kindOf(s.api.put("/me/player/pause"));
		expect(err.kind).toBe("network");
		expect(err.status).toBeNull();
	});

	it("getAccessToken throwing -> unauthorized, no request", async () => {
		const s = setup([respond(204)], [new Error("no session")]);
		const err = await kindOf(s.api.put("/me/player/pause"));
		expect(err.kind).toBe("unauthorized");
		expect(s.fetchFn).not.toHaveBeenCalled();
	});

	it("retries a 429 and resends the method and body each time", async () => {
		const s = setup([respond(429, {}, "2"), respond(429), respond(204)]);
		await s.api.put("/me/player/play", { position_ms: 5 });
		expect(s.waits).toEqual([2000, 2000]);
		expect(s.fetchFn).toHaveBeenCalledTimes(3);
		for (const call of s.fetchFn.mock.calls) {
			expect(call[1].method).toBe("PUT");
			expect(call[1].body).toBe('{"position_ms":5}');
		}
	});

	it("gives up with rate-limited after the last retry", async () => {
		const s = setup([respond(429)]);
		const err = await kindOf(s.api.put("/me/player/pause"));
		expect(err.kind).toBe("rate-limited");
		expect(s.fetchFn).toHaveBeenCalledTimes(4);
		expect(s.waits).toEqual([1000, 2000, 4000]);
	});

	it("rejects a target off the Spotify API with no token fetch and no request", async () => {
		const s = setup([respond(204)]);
		const err = await kindOf(s.api.put("https://evil.test/v1/me", {}));
		expect(err.kind).toBe("unexpected");
		expect(s.getAccessToken).not.toHaveBeenCalled();
		expect(s.fetchFn).not.toHaveBeenCalled();
	});
});
