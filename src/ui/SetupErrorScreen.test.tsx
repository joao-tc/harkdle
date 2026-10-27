// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetupErrorKind } from "@/store/session";
import { SetupErrorScreen } from "@/ui/SetupErrorScreen";

afterEach(cleanup);

const noop = () => {};

const CASES: ReadonlyArray<{
	error: SetupErrorKind;
	title: string;
	retryName: string | null;
}> = [
	{
		error: "not-premium",
		title: "Spotify Premium required",
		retryName: "Retry",
	},
	{
		error: "not-allowlisted",
		title: "Not on the allowlist",
		retryName: "Retry",
	},
	{
		error: "wrong-origin",
		title: "Open the app at 127.0.0.1",
		retryName: null,
	},
	{ error: "missing-config", title: "App not configured", retryName: null },
	{
		error: "session-expired",
		title: "Session expired",
		retryName: "Log in again",
	},
	{ error: "unexpected", title: "Something went wrong", retryName: "Retry" },
	{
		error: "sdk-account",
		title: "Spotify player refused the account",
		retryName: "Retry",
	},
	{
		error: "sdk-init",
		title: "Spotify player couldn't start",
		retryName: "Retry",
	},
];

describe("SetupErrorScreen", () => {
	it.each(CASES)("renders $error", ({ error, title, retryName }) => {
		render(<SetupErrorScreen error={error} onRetry={noop} onLogout={noop} />);

		expect(screen.getByText(title)).toBeTruthy();
		if (retryName === null) {
			expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
			expect(screen.queryByRole("button", { name: "Log in again" })).toBeNull();
		} else {
			expect(screen.getByRole("button", { name: retryName })).toBeTruthy();
		}
		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
	});

	it("shows detail when given", () => {
		render(
			<SetupErrorScreen
				error="unexpected"
				detail="HTTP 500 from /me"
				onRetry={noop}
				onLogout={noop}
			/>,
		);
		expect(screen.getByText("HTTP 500 from /me")).toBeTruthy();
	});

	it("omits detail when not given", () => {
		render(
			<SetupErrorScreen error="unexpected" onRetry={noop} onLogout={noop} />,
		);
		expect(screen.queryByText("HTTP 500 from /me")).toBeNull();
		expect(document.querySelector("p.font-mono")).toBeNull();
	});

	it("shows devUrl as a link for wrong-origin", () => {
		render(
			<SetupErrorScreen
				error="wrong-origin"
				devUrl="http://127.0.0.1:5173/"
				onRetry={noop}
				onLogout={noop}
			/>,
		);
		const link = screen.getByRole("link", { name: "http://127.0.0.1:5173/" });
		expect(link.getAttribute("href")).toBe("http://127.0.0.1:5173/");
	});

	it("calls onRetry once when Retry is clicked", () => {
		const onRetry = vi.fn();
		const onLogout = vi.fn();
		render(
			<SetupErrorScreen
				error="unexpected"
				onRetry={onRetry}
				onLogout={onLogout}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onLogout).not.toHaveBeenCalled();
	});

	it("calls onRetry once when Log in again is clicked", () => {
		const onRetry = vi.fn();
		render(
			<SetupErrorScreen
				error="session-expired"
				onRetry={onRetry}
				onLogout={noop}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Log in again" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("calls onLogout once when Log out is clicked", () => {
		const onRetry = vi.fn();
		const onLogout = vi.fn();
		render(
			<SetupErrorScreen
				error="unexpected"
				onRetry={onRetry}
				onLogout={onLogout}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Log out" }));
		expect(onLogout).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
	});
});
