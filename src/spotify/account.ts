import type { FetchFn } from "./auth";

export interface AccountUser {
	id: string;
	displayName: string;
	product: string;
	country?: string;
}

export type AccountFailure =
	| "not-premium"
	| "not-allowlisted"
	| "session-expired"
	| "unexpected";

export type AccountResult =
	| { ok: true; user: AccountUser }
	| { ok: false; error: AccountFailure; detail?: string };

const ME_URL = "https://api.spotify.com/v1/me";

function unexpected(detail: string): AccountResult {
	return { ok: false, error: "unexpected", detail };
}

function describe(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toResult(body: unknown): AccountResult {
	if (!isRecord(body) || typeof body.id !== "string") {
		return unexpected("response body is not a user object");
	}
	const { id, display_name, product, country } = body;
	if (typeof product !== "string") {
		return unexpected("product missing");
	}
	if (product !== "premium") {
		return { ok: false, error: "not-premium" };
	}
	const user: AccountUser = {
		id,
		displayName: typeof display_name === "string" ? display_name : id,
		product,
	};
	if (typeof country === "string") {
		user.country = country;
	}
	return { ok: true, user };
}

export async function checkAccount(deps: {
	getAccessToken: () => Promise<string>;
	fetchFn: FetchFn;
}): Promise<AccountResult> {
	let token: string;
	try {
		token = await deps.getAccessToken();
	} catch {
		return { ok: false, error: "session-expired" };
	}

	let res: Awaited<ReturnType<FetchFn>>;
	try {
		res = await deps.fetchFn(ME_URL, {
			method: "GET",
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch (e) {
		return unexpected(`request failed: ${describe(e)}`);
	}

	if (res.status === 401) {
		return { ok: false, error: "session-expired" };
	}
	// Spotify Development Mode only serves allowlisted users; everyone else gets 403.
	if (res.status === 403) {
		return { ok: false, error: "not-allowlisted" };
	}
	if (!res.ok) {
		return unexpected(`unexpected status ${res.status}`);
	}

	let body: unknown;
	try {
		body = await res.json();
	} catch (e) {
		return unexpected(`response body is not JSON: ${describe(e)}`);
	}
	return toResult(body);
}
