import { describe, expect, it, vi } from "vitest";
import { checkAccount } from "./account";
import type { FetchFn } from "./auth";

type Res = Awaited<ReturnType<FetchFn>>;

function respond(status: number, body: unknown): Res {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

function setup(res: Res | Error, token: string | Error = "tok") {
	const fetchFn = vi.fn<FetchFn>(async () => {
		if (res instanceof Error) throw res;
		return res;
	});
	const getAccessToken = vi.fn(async () => {
		if (token instanceof Error) throw token;
		return token;
	});
	return { fetchFn, getAccessToken };
}

const premiumBody = {
	id: "u1",
	display_name: "Una",
	product: "premium",
	country: "PT",
};

describe("checkAccount", () => {
	it("returns the user for a premium account", async () => {
		const deps = setup(respond(200, premiumBody));
		expect(await checkAccount(deps)).toEqual({
			ok: true,
			user: { id: "u1", displayName: "Una", product: "premium", country: "PT" },
		});
	});

	it("sends GET with the bearer token to /v1/me and asks for the token once", async () => {
		const deps = setup(respond(200, premiumBody), "abc123");
		await checkAccount(deps);
		expect(deps.getAccessToken).toHaveBeenCalledTimes(1);
		expect(deps.fetchFn).toHaveBeenCalledTimes(1);
		expect(deps.fetchFn).toHaveBeenCalledWith("https://api.spotify.com/v1/me", {
			method: "GET",
			headers: { Authorization: "Bearer abc123" },
		});
	});

	it.each([
		["null", null],
		["absent", undefined],
	])("falls back to id when display_name is %s", async (_label, name) => {
		const deps = setup(
			respond(200, { id: "u1", display_name: name, product: "premium" }),
		);
		expect(await checkAccount(deps)).toEqual({
			ok: true,
			user: { id: "u1", displayName: "u1", product: "premium" },
		});
	});

	it.each(["free", "open"])("rejects product %s as not-premium", async (p) => {
		const deps = setup(respond(200, { id: "u1", product: p }));
		expect(await checkAccount(deps)).toEqual({
			ok: false,
			error: "not-premium",
		});
	});

	it("reports a missing product as unexpected", async () => {
		const deps = setup(respond(200, { id: "u1", display_name: "Una" }));
		expect(await checkAccount(deps)).toEqual({
			ok: false,
			error: "unexpected",
			detail: "product missing",
		});
	});

	it("maps 401 to session-expired", async () => {
		const deps = setup(respond(401, {}));
		expect(await checkAccount(deps)).toEqual({
			ok: false,
			error: "session-expired",
		});
	});

	it("maps a throwing getAccessToken to session-expired without fetching", async () => {
		const deps = setup(respond(200, premiumBody), new Error("no session"));
		expect(await checkAccount(deps)).toEqual({
			ok: false,
			error: "session-expired",
		});
		expect(deps.fetchFn).not.toHaveBeenCalled();
	});

	it("maps 403 to not-allowlisted", async () => {
		const deps = setup(respond(403, { error: { status: 403 } }));
		expect(await checkAccount(deps)).toEqual({
			ok: false,
			error: "not-allowlisted",
		});
	});

	it.each([429, 500, 503])("maps status %i to unexpected", async (status) => {
		const deps = setup(respond(status, {}));
		const result = await checkAccount(deps);
		expect(result).toMatchObject({ ok: false, error: "unexpected" });
		expect(result.ok === false && result.detail).toContain(String(status));
	});

	it("maps a throwing fetch to unexpected with a detail", async () => {
		const deps = setup(new Error("network down"));
		const result = await checkAccount(deps);
		expect(result).toMatchObject({ ok: false, error: "unexpected" });
		expect(result.ok === false && result.detail).toContain("network down");
	});

	it("maps an unparseable body to unexpected", async () => {
		const deps = setup({
			ok: true,
			status: 200,
			json: async () => {
				throw new SyntaxError("bad json");
			},
		});
		const result = await checkAccount(deps);
		expect(result).toMatchObject({ ok: false, error: "unexpected" });
		expect(result.ok === false && result.detail).toBeTruthy();
	});

	it.each([
		["null", null],
		["an array", []],
		["a string", "hi"],
		["an object without id", { product: "premium" }],
		["an object with a non-string id", { id: 7, product: "premium" }],
	])("maps a body that is %s to unexpected", async (_label, body) => {
		const deps = setup(respond(200, body));
		const result = await checkAccount(deps);
		expect(result).toMatchObject({ ok: false, error: "unexpected" });
		expect(result.ok === false && result.detail).toBeTruthy();
	});
});
