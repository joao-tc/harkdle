// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectingScreen } from "./ConnectingScreen";
import { CountdownScreen } from "./CountdownScreen";

afterEach(cleanup);

describe("ConnectingScreen", () => {
	it("says it is connecting and offers no actions", () => {
		render(<ConnectingScreen />);
		expect(screen.getByRole("status").textContent).toBe(
			"Connecting to Spotify…",
		);
		expect(screen.queryAllByRole("button")).toHaveLength(0);
	});
});

describe("CountdownScreen", () => {
	it("shows the number in an assertive live region", () => {
		render(<CountdownScreen value={3} />);
		const number = screen.getByText("3");
		expect(number.closest("[aria-live]")?.getAttribute("aria-live")).toBe(
			"assertive",
		);
		expect(screen.queryAllByRole("button")).toHaveLength(0);
	});

	it("updates the announced number as the value changes", () => {
		const { rerender } = render(<CountdownScreen value={3} />);
		const region = screen.getByText("3").closest("[aria-live]");
		rerender(<CountdownScreen value={2} />);
		expect(region?.textContent).toBe("2");
		rerender(<CountdownScreen value={1} />);
		expect(region?.textContent).toBe("1");
		expect(screen.queryByText("3")).toBeNull();
	});
});
