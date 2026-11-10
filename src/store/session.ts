import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import type { AccountResult, AccountUser } from "@/spotify/account";
import type { Auth } from "@/spotify/auth";

// The ui layer may not import from spotify, so it gets this type from here.
export type { AccountUser } from "@/spotify/account";

export type SetupErrorKind =
	| "not-premium"
	| "not-allowlisted"
	| "session-expired"
	| "unexpected"
	| "wrong-origin"
	| "missing-config"
	| "sdk-account"
	| "sdk-init"; // the last two are produced by a later item

export type Screen =
	| { name: "booting" }
	| { name: "login" }
	| { name: "checking" }
	| { name: "setup-error"; error: SetupErrorKind; detail?: string }
	| { name: "signed-in"; user: AccountUser };

export interface SessionDeps {
	auth: Auth;
	checkAccount: () => Promise<AccountResult>;
	env: { clientId: string | undefined; dev: boolean; hostname: string };
	search: string; // location.search at page load
}

export interface SessionState {
	screen: Screen;
	boot(): Promise<void>;
	login(): Promise<void>;
	retry(): Promise<void>;
	logout(): void;
	expire(): void; // the token stopped working mid-session: show the session-expired screen
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function createSessionStore(deps: SessionDeps): StoreApi<SessionState> {
	const { auth, checkAccount, env, search } = deps;
	let booting = false;

	return createStore<SessionState>()((set, get) => {
		const show = (screen: Screen) => set({ screen });

		async function check(): Promise<void> {
			if (!auth.isLoggedIn()) {
				show({ name: "login" });
				return;
			}
			show({ name: "checking" });
			const result = await checkAccount();
			if (result.ok) {
				show({ name: "signed-in", user: result.user });
			} else if (result.detail === undefined) {
				show({ name: "setup-error", error: result.error });
			} else {
				show({
					name: "setup-error",
					error: result.error,
					detail: result.detail,
				});
			}
		}

		return {
			screen: { name: "booting" },

			async boot() {
				if (booting) return;
				booting = true;
				try {
					if (!env.clientId) {
						show({ name: "setup-error", error: "missing-config" });
						return;
					}
					if (env.dev && env.hostname !== "127.0.0.1") {
						show({ name: "setup-error", error: "wrong-origin" });
						return;
					}
					try {
						await auth.handleCallback(search);
					} catch (e) {
						show({
							name: "setup-error",
							error: "unexpected",
							detail: message(e),
						});
						return;
					}
					await check();
				} finally {
					booting = false;
				}
			},

			async login() {
				try {
					await auth.startLogin();
				} catch (e) {
					show({
						name: "setup-error",
						error: "unexpected",
						detail: message(e),
					});
				}
			},

			async retry() {
				const { screen } = get();
				if (screen.name !== "setup-error") return;
				if (screen.error === "session-expired") {
					auth.logout();
					show({ name: "login" });
					return;
				}
				if (
					screen.error === "wrong-origin" ||
					screen.error === "missing-config"
				) {
					return;
				}
				await check();
			},

			logout() {
				auth.logout();
				show({ name: "login" });
			},

			expire() {
				show({ name: "setup-error", error: "session-expired" });
			},
		};
	});
}
