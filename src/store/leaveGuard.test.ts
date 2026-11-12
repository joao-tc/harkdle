import { describe, expect, it, vi } from "vitest";
import type { Stage } from "./game";
import { createHarness } from "./gameHarness";
import {
	connectLeaveGuard,
	IN_PROGRESS,
	isInProgress,
	type UnloadTarget,
} from "./leaveGuard";

type Listener = Parameters<UnloadTarget["addEventListener"]>[1];

function fakeTarget() {
	const listeners = new Set<Listener>();
	const target: UnloadTarget = {
		addEventListener: (_type, listener) => {
			listeners.add(listener);
		},
		removeEventListener: (_type, listener) => {
			listeners.delete(listener);
		},
	};
	function fire() {
		const event = {
			preventDefault: vi.fn(),
			returnValue: undefined as unknown,
		};
		for (const listener of listeners) listener(event);
		return event;
	}
	return { target, listeners, fire };
}

describe("isInProgress", () => {
	it.each(["connecting", "countdown", "round", "reveal"] as const)(
		"counts %s as in progress",
		(stage) => {
			expect(isInProgress(stage)).toBe(true);
			expect(IN_PROGRESS.has(stage)).toBe(true);
		},
	);

	it.each(["idle", "finished"] as const)("does not count %s", (stage) => {
		expect(isInProgress(stage)).toBe(false);
	});
});

describe("connectLeaveGuard", () => {
	it("asks the browser to confirm while a round is on", () => {
		const { store } = createHarness();
		const { target, fire } = fakeTarget();
		connectLeaveGuard(store, target);
		store.setState({ stage: "round" });

		const event = fire();

		expect(event.preventDefault).toHaveBeenCalledOnce();
		expect(event.returnValue).toBe("");
	});

	it.each(["idle", "finished"] as const)(
		"leaves the event alone in %s",
		(stage) => {
			const { store } = createHarness();
			const { target, fire } = fakeTarget();
			connectLeaveGuard(store, target);
			store.setState({ stage });

			const event = fire();

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(event.returnValue).toBeUndefined();
		},
	);

	it("reads the stage at event time, not at registration", () => {
		const { store } = createHarness();
		const { target, fire } = fakeTarget();
		store.setState({ stage: "idle" });
		connectLeaveGuard(store, target);
		expect(fire().preventDefault).not.toHaveBeenCalled();

		store.setState({ stage: "countdown" });
		expect(fire().preventDefault).toHaveBeenCalledOnce();

		store.setState({ stage: "finished" });
		expect(fire().preventDefault).not.toHaveBeenCalled();
	});

	it.each(["connecting", "countdown", "round", "reveal"] as const)(
		"guards the %s stage",
		(stage: Stage) => {
			const { store } = createHarness();
			const { target, fire } = fakeTarget();
			connectLeaveGuard(store, target);
			store.setState({ stage });

			expect(fire().returnValue).toBe("");
		},
	);

	it("registers one listener and the unsubscribe removes it", () => {
		const { store } = createHarness();
		const { target, listeners } = fakeTarget();

		const unsubscribe = connectLeaveGuard(store, target);
		expect(listeners.size).toBe(1);

		unsubscribe();
		expect(listeners.size).toBe(0);
	});
});
