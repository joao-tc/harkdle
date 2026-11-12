// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import type { GameStoreState } from "@/store/game";
import { useGameShortcuts } from "./useGameShortcuts";

afterEach(cleanup);

function fakeGame() {
	const play = vi.fn();
	const skip = vi.fn();
	const store = createStore<GameStoreState>(
		() => ({ play, skip }) as unknown as GameStoreState,
	);
	return { store, play, skip };
}

function Probe({
	game,
	enabled = true,
}: {
	game: ReturnType<typeof fakeGame>["store"];
	enabled?: boolean;
}) {
	useGameShortcuts(game, enabled);
	return <input aria-label="field" />;
}

describe("useGameShortcuts", () => {
	it("plays on ⌥Space inside a focused field without typing", async () => {
		const { store, play, skip } = fakeGame();
		const user = userEvent.setup();
		render(<Probe game={store} />);
		const input = screen.getByLabelText("field") as HTMLInputElement;
		await user.click(input);
		await user.keyboard("a{Alt>}[Space]{/Alt}");

		expect(play).toHaveBeenCalledTimes(1);
		expect(skip).not.toHaveBeenCalled();
		expect(input.value).toBe("a");
	});

	it("skips on ⌥S inside a focused field without typing", async () => {
		const { store, play, skip } = fakeGame();
		const user = userEvent.setup();
		render(<Probe game={store} />);
		const input = screen.getByLabelText("field") as HTMLInputElement;
		await user.click(input);
		await user.keyboard("{Alt>}s{/Alt}");

		expect(skip).toHaveBeenCalledTimes(1);
		expect(play).not.toHaveBeenCalled();
		expect(input.value).toBe("");
	});

	it("default-prevents the shortcut, matching on code", () => {
		const { store, play } = fakeGame();
		render(<Probe game={store} />);
		const input = screen.getByLabelText("field");
		// On macOS ⌥S has key "ß"; only the code identifies it.
		const notPrevented = fireEvent.keyDown(input, {
			key: "ß",
			code: "KeyS",
			altKey: true,
		});
		expect(notPrevented).toBe(false);
		const space = fireEvent.keyDown(input, {
			key: " ",
			code: "Space",
			altKey: true,
		});
		expect(space).toBe(false);
		expect(play).toHaveBeenCalledTimes(1);
	});

	it("ignores unmodified keys and other ⌥ combinations", () => {
		const { store, play, skip } = fakeGame();
		render(<Probe game={store} />);
		const input = screen.getByLabelText("field");
		expect(fireEvent.keyDown(input, { code: "Space" })).toBe(true);
		expect(fireEvent.keyDown(input, { code: "KeyS" })).toBe(true);
		expect(fireEvent.keyDown(input, { code: "KeyR", altKey: true })).toBe(true);
		expect(
			fireEvent.keyDown(input, { code: "KeyS", altKey: true, shiftKey: true }),
		).toBe(true);
		expect(play).not.toHaveBeenCalled();
		expect(skip).not.toHaveBeenCalled();
	});

	it("swallows a held shortcut but acts only on the first press", () => {
		const { store, skip } = fakeGame();
		render(<Probe game={store} />);
		const input = screen.getByLabelText("field");
		fireEvent.keyDown(input, { code: "KeyS", altKey: true });
		const repeated = fireEvent.keyDown(input, {
			code: "KeyS",
			altKey: true,
			repeat: true,
		});
		expect(repeated).toBe(false);
		expect(skip).toHaveBeenCalledTimes(1);
	});

	it("does nothing while disabled, and again once re-enabled", () => {
		const { store, play } = fakeGame();
		const { rerender } = render(<Probe game={store} enabled={false} />);
		const input = screen.getByLabelText("field");
		expect(fireEvent.keyDown(input, { code: "Space", altKey: true })).toBe(
			true,
		);
		expect(play).not.toHaveBeenCalled();

		rerender(<Probe game={store} enabled />);
		fireEvent.keyDown(input, { code: "Space", altKey: true });
		expect(play).toHaveBeenCalledTimes(1);
	});

	it("registers one listener under StrictMode and removes it on unmount", () => {
		const { store, play } = fakeGame();
		const { unmount } = render(
			<StrictMode>
				<Probe game={store} />
			</StrictMode>,
		);
		fireEvent.keyDown(screen.getByLabelText("field"), {
			code: "Space",
			altKey: true,
		});
		expect(play).toHaveBeenCalledTimes(1);

		unmount();
		fireEvent.keyDown(document.body, { code: "Space", altKey: true });
		expect(play).toHaveBeenCalledTimes(1);
	});
});
