// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	CleaningReport,
	ContinueGate,
	LoadedPlaylist,
	PlaylistSummary,
	Selection,
} from "@/store/playlists";
import {
	cleaningSummary,
	errorText,
	loadingText,
	tooFewText,
} from "@/ui/pickerCopy";
import { SelectionBar } from "@/ui/SelectionBar";

afterEach(cleanup);

const noop = () => {};

const SUMMARY: PlaylistSummary = {
	id: "p1",
	name: "Road Trip Mix",
	ownerName: "Ana",
	coverUrl: null,
	trackCount: 40,
	collaborative: false,
	owned: true,
};

const REPORT: CleaningReport = {
	total: 42,
	usable: 40,
	removed: { duplicate: 2, unavailable: 0, local: 0, episode: 0 },
};

const PLAYLIST: LoadedPlaylist = {
	tracks: [],
	report: REPORT,
	index: { suggest: () => [] },
};

const OK_GATE: ContinueGate = { ok: true };

const ready = (gate: ContinueGate): Selection => ({
	status: "ready",
	summary: SUMMARY,
	playlist: PLAYLIST,
	gate,
});

const continueButton = () => screen.getByRole("button", { name: "Continue" });

describe("SelectionBar", () => {
	it("none shows the hint, a disabled Continue and no Reload", () => {
		render(
			<SelectionBar
				selection={{ status: "none" }}
				onContinue={noop}
				onReload={noop}
			/>,
		);
		expect(
			screen.getByText("Pick a playlist, or paste a link, to start."),
		).toBeTruthy();
		expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
		expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
	});

	it("loading shows the name, a progressbar and the loading text", () => {
		render(
			<SelectionBar
				selection={{
					status: "loading",
					summary: SUMMARY,
					loaded: 10,
					total: 40,
				}}
				onContinue={noop}
				onReload={noop}
			/>,
		);
		expect(screen.getByText("Road Trip Mix")).toBeTruthy();
		expect(screen.getByRole("progressbar")).toBeTruthy();
		expect(screen.getByText(loadingText(10, 40))).toBeTruthy();
		expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
	});

	it("loading with an unknown total still renders", () => {
		render(
			<SelectionBar
				selection={{ status: "loading", summary: SUMMARY, loaded: 0, total: 0 }}
				onContinue={noop}
				onReload={noop}
			/>,
		);
		expect(screen.getByText(loadingText(0, 0))).toBeTruthy();
	});

	it("ready shows the cleaning summary", () => {
		render(
			<SelectionBar
				selection={ready(OK_GATE)}
				onContinue={noop}
				onReload={noop}
			/>,
		);
		expect(screen.getByText("Road Trip Mix")).toBeTruthy();
		expect(screen.getByText(cleaningSummary(REPORT))).toBeTruthy();
		expect(screen.queryByText(/harkdle needs at least/)).toBeNull();
	});

	it("error shows the mapped message and Reload acts as Retry", () => {
		const onReload = vi.fn();
		render(
			<SelectionBar
				selection={{ status: "error", summary: SUMMARY, error: "network" }}
				onContinue={noop}
				onReload={onReload}
			/>,
		);
		expect(screen.getByText("Road Trip Mix")).toBeTruthy();
		expect(screen.getByText(errorText("network", "selection"))).toBeTruthy();
		expect((continueButton() as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Reload" }));
		expect(onReload).toHaveBeenCalledTimes(1);
	});

	it("ready with too few tracks shows the message and disables Continue", () => {
		const onContinue = vi.fn();
		render(
			<SelectionBar
				selection={ready({
					ok: false,
					reason: "too-few",
					usable: 3,
					needed: 10,
				})}
				onContinue={onContinue}
				onReload={noop}
			/>,
		);
		expect(screen.getByText(tooFewText(3, 10))).toBeTruthy();
		const button = continueButton() as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(onContinue).not.toHaveBeenCalled();
	});

	it("ready with an ok gate calls onContinue once per click", () => {
		const onContinue = vi.fn();
		const onReload = vi.fn();
		render(
			<SelectionBar
				selection={ready(OK_GATE)}
				onContinue={onContinue}
				onReload={onReload}
			/>,
		);
		const button = continueButton() as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		fireEvent.click(button);
		expect(onContinue).toHaveBeenCalledTimes(1);
		expect(onReload).not.toHaveBeenCalled();
	});

	it("Reload shows for every selected status and calls onReload", () => {
		const selections: Selection[] = [
			{ status: "loading", summary: SUMMARY, loaded: 0, total: 40 },
			ready(OK_GATE),
			{ status: "error", summary: SUMMARY, error: "unexpected" },
		];
		for (const selection of selections) {
			const onReload = vi.fn();
			render(
				<SelectionBar
					selection={selection}
					onContinue={noop}
					onReload={onReload}
				/>,
			);
			fireEvent.click(screen.getByRole("button", { name: "Reload" }));
			expect(onReload).toHaveBeenCalledTimes(1);
			cleanup();
		}
	});

	it("has a polite status region that does not contain the buttons", () => {
		render(
			<SelectionBar
				selection={ready(OK_GATE)}
				onContinue={noop}
				onReload={noop}
			/>,
		);
		const status = screen.getByRole("status");
		expect(status.getAttribute("aria-live")).toBe("polite");
		expect(status.contains(continueButton())).toBe(false);
	});
});
