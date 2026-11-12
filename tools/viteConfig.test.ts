import { describe, expect, it } from "vitest";
import type { ConfigEnv, ViteUserConfigFn } from "vitest/config";
import config from "../vite.config";

function resolveBase(command: ConfigEnv["command"]): string | undefined {
	const env: ConfigEnv = { command, mode: "test" };
	const resolved = (config as ViteUserConfigFn)(env);
	if (resolved instanceof Promise) throw new Error("config must be sync");
	return resolved.base;
}

describe("vite config base path", () => {
	it("serves the production build under /harkdle/", () => {
		expect(resolveBase("build")).toBe("/harkdle/");
	});

	it("serves the dev server from /", () => {
		expect(resolveBase("serve")).toBe("/");
	});
});
