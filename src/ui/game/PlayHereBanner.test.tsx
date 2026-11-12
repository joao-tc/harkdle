// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAY_HERE_FAILED } from "./gameCopy";
import { PlayHereBanner } from "./PlayHereBanner";

afterEach(cleanup);

describe("PlayHereBanner", () => {
	it("names the taken-over reason", () => {
		render(
			<PlayHereBanner
				reason="taken-over"
				recovery="idle"
				onRecover={() => {}}
			/>,
		);
		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.getByText("Spotify is playing elsewhere.")).toBeTruthy();
		expect(screen.queryByText(PLAY_HERE_FAILED)).toBeNull();
	});

	it("names the device-lost reason", () => {
		render(
			<PlayHereBanner
				reason="device-lost"
				recovery="idle"
				onRecover={() => {}}
			/>,
		);
		expect(screen.getByText("harkdle's player disconnected.")).toBeTruthy();
	});

	it("calls onRecover once per press", async () => {
		const onRecover = vi.fn();
		const user = userEvent.setup();
		render(
			<PlayHereBanner
				reason="taken-over"
				recovery="idle"
				onRecover={onRecover}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Play here" }));
		expect(onRecover).toHaveBeenCalledTimes(1);
	});

	it("shows the working state with a disabled button", async () => {
		const onRecover = vi.fn();
		const user = userEvent.setup();
		render(
			<PlayHereBanner
				reason="taken-over"
				recovery="working"
				onRecover={onRecover}
			/>,
		);
		const button = screen.getByRole("button", { name: "Reconnecting…" });
		expect(button).toHaveProperty("disabled", true);
		await user.click(button);
		expect(onRecover).not.toHaveBeenCalled();
	});

	it("shows the failure line and keeps the button as a retry", async () => {
		const onRecover = vi.fn();
		const user = userEvent.setup();
		render(
			<PlayHereBanner
				reason="device-lost"
				recovery="failed"
				onRecover={onRecover}
			/>,
		);
		expect(screen.getByText(PLAY_HERE_FAILED)).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Play here" }));
		expect(onRecover).toHaveBeenCalledTimes(1);
	});
});
