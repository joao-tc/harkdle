import { describe, expect, it } from "vitest";
import type { AccountResult, AccountUser } from "@/spotify/account";
import type { Auth } from "@/spotify/auth";
import { createSessionStore, type Screen, type SessionDeps } from "./session";

const user: AccountUser = {
	id: "u1",
	displayName: "Ada",
	product: "premium",
	country: "PT",
};

interface Harness {
	deps: SessionDeps;
	calls: { handleCallback: string[]; checkAccount: number; logout: number };
	state: { loggedIn: boolean };
}

function harness(
	opts: {
		loggedIn?: boolean;
		env?: Partial<SessionDeps["env"]>;
		callback?: () => Promise<boolean>;
		check?: () => Promise<AccountResult>;
		startLogin?: () => Promise<void>;
		search?: string;
	} = {},
): Harness {
	const calls = { handleCallback: [] as string[], checkAccount: 0, logout: 0 };
	const state = { loggedIn: opts.loggedIn ?? true };
	const auth: Auth = {
		startLogin: opts.startLogin ?? (async () => {}),
		handleCallback: async (search) => {
			calls.handleCallback.push(search);
			return opts.callback ? opts.callback() : false;
		},
		getAccessToken: async () => "token",
		isLoggedIn: () => state.loggedIn,
		logout: () => {
			calls.logout++;
			state.loggedIn = false;
		},
	};
	const deps: SessionDeps = {
		auth,
		checkAccount: async () => {
			calls.checkAccount++;
			return opts.check ? opts.check() : { ok: true, user };
		},
		env: { clientId: "cid", dev: true, hostname: "127.0.0.1", ...opts.env },
		search: opts.search ?? "?code=abc",
	};
	return { deps, calls, state };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("boot config guards", () => {
	it("starts in booting", () => {
		const store = createSessionStore(harness().deps);
		expect(store.getState().screen).toEqual({ name: "booting" });
	});

	it.each([undefined, ""])(
		"clientId %j -> missing-config",
		async (clientId) => {
			const h = harness({ env: { clientId } });
			const store = createSessionStore(h.deps);
			await store.getState().boot();
			expect(store.getState().screen).toEqual({
				name: "setup-error",
				error: "missing-config",
			});
			expect(h.calls.handleCallback).toEqual([]);
			expect(h.calls.checkAccount).toBe(0);
		},
	);

	it("dev on localhost -> wrong-origin without touching auth", async () => {
		const h = harness({ env: { dev: true, hostname: "localhost" } });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "wrong-origin",
		});
		expect(h.calls.handleCallback).toEqual([]);
		expect(h.calls.checkAccount).toBe(0);
	});

	it("dev on 127.0.0.1 passes the origin check", async () => {
		const h = harness({ env: { dev: true, hostname: "127.0.0.1" } });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		expect(store.getState().screen).toEqual({ name: "signed-in", user });
	});

	it.each(["localhost", "harkdle.example.com", "127.0.0.1"])(
		"production on %s skips the origin check",
		async (hostname) => {
			const h = harness({ env: { dev: false, hostname } });
			const store = createSessionStore(h.deps);
			await store.getState().boot();
			expect(store.getState().screen).toEqual({ name: "signed-in", user });
		},
	);
});

describe("boot flow", () => {
	it("passes the load-time search to handleCallback", async () => {
		const h = harness({ search: "?code=xyz" });
		await createSessionStore(h.deps).getState().boot();
		expect(h.calls.handleCallback).toEqual(["?code=xyz"]);
	});

	it("callback exchange throwing -> unexpected with the message", async () => {
		const h = harness({
			callback: async () => {
				throw new Error("token endpoint returned 400");
			},
		});
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "unexpected",
			detail: "token endpoint returned 400",
		});
		expect(h.calls.checkAccount).toBe(0);
	});

	it("logged out -> login, no account check", async () => {
		const h = harness({ loggedIn: false });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		expect(store.getState().screen).toEqual({ name: "login" });
		expect(h.calls.checkAccount).toBe(0);
	});

	const outcomes: [string, AccountResult, Screen][] = [
		["success", { ok: true, user }, { name: "signed-in", user }],
		[
			"not-premium",
			{ ok: false, error: "not-premium" },
			{ name: "setup-error", error: "not-premium" },
		],
		[
			"not-allowlisted",
			{ ok: false, error: "not-allowlisted" },
			{ name: "setup-error", error: "not-allowlisted" },
		],
		[
			"session-expired",
			{ ok: false, error: "session-expired" },
			{ name: "setup-error", error: "session-expired" },
		],
		[
			"unexpected with detail",
			{ ok: false, error: "unexpected", detail: "unexpected status 500" },
			{
				name: "setup-error",
				error: "unexpected",
				detail: "unexpected status 500",
			},
		],
	];

	it.each(outcomes)("logged in + %s", async (_label, result, expected) => {
		const h = harness({ check: async () => result });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		expect(store.getState().screen).toEqual(expected);
		expect(h.calls.checkAccount).toBe(1);
	});

	it("shows checking while the account check is pending", async () => {
		const d = deferred<AccountResult>();
		const h = harness({ check: () => d.promise });
		const store = createSessionStore(h.deps);
		const booted = store.getState().boot();
		await Promise.resolve();
		await Promise.resolve();
		expect(store.getState().screen).toEqual({ name: "checking" });
		d.resolve({ ok: true, user });
		await booted;
		expect(store.getState().screen).toEqual({ name: "signed-in", user });
	});
});

describe("re-entry", () => {
	it("a second boot() while checking makes exactly one checkAccount call", async () => {
		const d = deferred<AccountResult>();
		const h = harness({ check: () => d.promise });
		const store = createSessionStore(h.deps);
		const first = store.getState().boot();
		await store.getState().boot();
		d.resolve({ ok: true, user });
		await first;
		expect(h.calls.checkAccount).toBe(1);
		expect(h.calls.handleCallback).toHaveLength(1);
	});

	it("boot() may run again once the first boot has settled", async () => {
		const h = harness();
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().boot();
		expect(h.calls.checkAccount).toBe(2);
	});

	it("a second retry() while checking makes exactly one checkAccount call", async () => {
		let n = 0;
		const d = deferred<AccountResult>();
		const h = harness({
			check: () =>
				++n === 1
					? Promise.resolve({ ok: false, error: "unexpected" })
					: d.promise,
		});
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		const first = store.getState().retry();
		await store.getState().retry();
		d.resolve({ ok: true, user });
		await first;
		expect(h.calls.checkAccount).toBe(2);
		expect(store.getState().screen).toEqual({ name: "signed-in", user });
	});

	it("retry() while booting is a no-op", async () => {
		const d = deferred<boolean>();
		const h = harness({ callback: () => d.promise });
		const store = createSessionStore(h.deps);
		const booted = store.getState().boot();
		await store.getState().retry();
		d.resolve(false);
		await booted;
		expect(h.calls.checkAccount).toBe(1);
		expect(h.calls.handleCallback).toHaveLength(1);
	});
});

describe("retry", () => {
	it("session-expired logs out and shows login", async () => {
		const h = harness({
			check: async () => ({ ok: false, error: "session-expired" }),
		});
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().retry();
		expect(h.calls.logout).toBe(1);
		expect(h.calls.checkAccount).toBe(1);
		expect(store.getState().screen).toEqual({ name: "login" });
	});

	it("after unexpected re-runs checkAccount without handleCallback", async () => {
		let n = 0;
		const h = harness({
			check: async () =>
				++n === 1
					? { ok: false, error: "unexpected", detail: "boom" }
					: { ok: true, user },
		});
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().retry();
		expect(h.calls.checkAccount).toBe(2);
		expect(h.calls.handleCallback).toHaveLength(1);
		expect(store.getState().screen).toEqual({ name: "signed-in", user });
	});

	it.each(["not-premium", "not-allowlisted"] as const)(
		"after %s re-checks the account",
		async (error) => {
			const h = harness({ check: async () => ({ ok: false, error }) });
			const store = createSessionStore(h.deps);
			await store.getState().boot();
			await store.getState().retry();
			expect(h.calls.checkAccount).toBe(2);
			expect(store.getState().screen).toEqual({ name: "setup-error", error });
		},
	);

	it("after a callback failure with no session goes to login", async () => {
		const h = harness({
			loggedIn: false,
			callback: async () => {
				throw new Error("nope");
			},
		});
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().retry();
		expect(store.getState().screen).toEqual({ name: "login" });
		expect(h.calls.handleCallback).toHaveLength(1);
	});

	it.each([
		["missing-config", { clientId: undefined }],
		["wrong-origin", { hostname: "localhost" }],
	] as const)("%s does nothing", async (error, env) => {
		const h = harness({ env });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().retry();
		expect(store.getState().screen).toEqual({ name: "setup-error", error });
		expect(h.calls.logout).toBe(0);
		expect(h.calls.checkAccount).toBe(0);
		expect(h.calls.handleCallback).toEqual([]);
	});
});

describe("login and logout", () => {
	it("login failure -> unexpected with the message", async () => {
		const h = harness({
			startLogin: async () => {
				throw new Error("no crypto");
			},
		});
		const store = createSessionStore(h.deps);
		await store.getState().login();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "unexpected",
			detail: "no crypto",
		});
	});

	it("login success leaves the screen as it was", async () => {
		const h = harness({ loggedIn: false });
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		await store.getState().login();
		expect(store.getState().screen).toEqual({ name: "login" });
	});

	it.each([
		["signed-in", { loggedIn: true }],
		["login", { loggedIn: false }],
	])("expire() from %s shows session-expired", async (_label, opts) => {
		const h = harness(opts);
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		store.getState().expire();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "session-expired",
		});
	});

	it("expire() while checking shows session-expired", async () => {
		const d = deferred<AccountResult>();
		const h = harness({ check: () => d.promise });
		const store = createSessionStore(h.deps);
		const booted = store.getState().boot();
		await Promise.resolve();
		await Promise.resolve();
		expect(store.getState().screen).toEqual({ name: "checking" });
		store.getState().expire();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "session-expired",
		});
		d.resolve({ ok: true, user });
		await booted;
	});

	it("retry() after expire() logs out and shows login", async () => {
		const h = harness();
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		store.getState().expire();
		await store.getState().retry();
		expect(h.calls.logout).toBe(1);
		expect(store.getState().screen).toEqual({ name: "login" });
	});

	it("logout calls auth.logout and shows login", async () => {
		const h = harness();
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		store.getState().logout();
		expect(h.calls.logout).toBe(1);
		expect(store.getState().screen).toEqual({ name: "login" });
	});
});

describe("setup screen", () => {
	async function signedIn() {
		const h = harness();
		const store = createSessionStore(h.deps);
		await store.getState().boot();
		return { h, store };
	}

	it("toSetup() from signed-in shows setup with the same user", async () => {
		const { store } = await signedIn();
		store.getState().toSetup();
		expect(store.getState().screen).toEqual({ name: "setup", user });
	});

	it("toSetup() twice leaves one setup", async () => {
		const { store } = await signedIn();
		store.getState().toSetup();
		store.getState().toSetup();
		expect(store.getState().screen).toEqual({ name: "setup", user });
	});

	it("toSetup() from any other screen changes nothing", async () => {
		const booting = createSessionStore(harness().deps);
		booting.getState().toSetup();
		expect(booting.getState().screen).toEqual({ name: "booting" });

		const loggedOut = createSessionStore(harness({ loggedIn: false }).deps);
		await loggedOut.getState().boot();
		loggedOut.getState().toSetup();
		expect(loggedOut.getState().screen).toEqual({ name: "login" });

		const errored = createSessionStore(
			harness({ check: async () => ({ ok: false, error: "not-premium" }) })
				.deps,
		);
		await errored.getState().boot();
		errored.getState().toSetup();
		expect(errored.getState().screen).toEqual({
			name: "setup-error",
			error: "not-premium",
		});

		const d = deferred<AccountResult>();
		const pending = createSessionStore(
			harness({ check: () => d.promise }).deps,
		);
		const booted = pending.getState().boot();
		await Promise.resolve();
		await Promise.resolve();
		pending.getState().toSetup();
		expect(pending.getState().screen).toEqual({ name: "checking" });
		d.resolve({ ok: true, user });
		await booted;
	});

	it("toPicker() from setup returns to signed-in with the same user", async () => {
		const { store } = await signedIn();
		store.getState().toSetup();
		store.getState().toPicker();
		expect(store.getState().screen).toEqual({ name: "signed-in", user });
	});

	it("toPicker() from any other screen is a no-op", async () => {
		const { store } = await signedIn();
		store.getState().toPicker();
		expect(store.getState().screen).toEqual({ name: "signed-in", user });

		const booting = createSessionStore(harness().deps);
		booting.getState().toPicker();
		expect(booting.getState().screen).toEqual({ name: "booting" });

		const loggedOut = createSessionStore(harness({ loggedIn: false }).deps);
		await loggedOut.getState().boot();
		loggedOut.getState().toPicker();
		expect(loggedOut.getState().screen).toEqual({ name: "login" });

		const errored = createSessionStore(
			harness({ check: async () => ({ ok: false, error: "not-premium" }) })
				.deps,
		);
		await errored.getState().boot();
		errored.getState().toPicker();
		expect(errored.getState().screen).toEqual({
			name: "setup-error",
			error: "not-premium",
		});
	});

	it("logout() from setup calls auth.logout and shows login", async () => {
		const { h, store } = await signedIn();
		store.getState().toSetup();
		store.getState().logout();
		expect(h.calls.logout).toBe(1);
		expect(store.getState().screen).toEqual({ name: "login" });
	});

	it("expire() from setup shows session-expired", async () => {
		const { store } = await signedIn();
		store.getState().toSetup();
		store.getState().expire();
		expect(store.getState().screen).toEqual({
			name: "setup-error",
			error: "session-expired",
		});
	});

	it("retry() from setup is a no-op", async () => {
		const { h, store } = await signedIn();
		store.getState().toSetup();
		await store.getState().retry();
		expect(store.getState().screen).toEqual({ name: "setup", user });
		expect(h.calls.checkAccount).toBe(1);
		expect(h.calls.logout).toBe(0);
	});
});
