// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import { STEPS, type Step } from "@/game/types";
import { LadderBar } from "./LadderBar";

afterEach(cleanup);

const states = () =>
	within(screen.getByRole("list"))
		.getAllByRole("listitem")
		.map((item) => item.getAttribute("data-state"));

describe("LadderBar", () => {
	it.each(STEPS)(
		"marks step %i as current, earlier spent, later upcoming",
		(step) => {
			render(<LadderBar step={step} clipMs={DEFAULT_CONFIG.clipMs} />);
			expect(states()).toEqual(
				STEPS.map((s) =>
					s < step ? "spent" : s === step ? "current" : "upcoming",
				),
			);
			expect(screen.getByRole("list").getAttribute("aria-label")).toBe(
				`Step ${step} of 6`,
			);
		},
	);

	it("labels the segments with the clip lengths", () => {
		render(<LadderBar step={1} clipMs={DEFAULT_CONFIG.clipMs} />);
		expect(
			screen.getAllByRole("listitem").map((item) => item.textContent),
		).toEqual(["1s", "2s", "4s", "7s", "11s", "16s"]);
	});

	it("takes the labels from the config it is given", () => {
		const clipMs: Record<Step, number> = {
			1: 500,
			2: 1500,
			3: 3000,
			4: 5000,
			5: 8000,
			6: 12000,
		};
		render(<LadderBar step={3} clipMs={clipMs} />);
		expect(
			screen.getAllByRole("listitem").map((item) => item.textContent),
		).toEqual(["0.5s", "1.5s", "3s", "5s", "8s", "12s"]);
	});

	it("flags only the current segment for assistive technology", () => {
		render(<LadderBar step={4} clipMs={DEFAULT_CONFIG.clipMs} />);
		const current = screen
			.getAllByRole("listitem")
			.filter((item) => item.getAttribute("aria-current") === "step");
		expect(current.map((item) => item.textContent)).toEqual(["7s"]);
	});
});
