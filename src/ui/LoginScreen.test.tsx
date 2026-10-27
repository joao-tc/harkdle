// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/ui/LoginScreen";

afterEach(cleanup);

describe("LoginScreen", () => {
	it("shows what the player needs", () => {
		render(<LoginScreen onLogin={vi.fn()} />);

		screen.getByText(/Premium/);
		screen.getByText(/allowlist/);
		screen.getByText(/Chrome/);
	});

	it("calls onLogin once when the button is clicked", () => {
		const onLogin = vi.fn();
		render(<LoginScreen onLogin={onLogin} />);

		fireEvent.click(
			screen.getByRole("button", { name: "Log in with Spotify" }),
		);

		expect(onLogin).toHaveBeenCalledTimes(1);
	});
});
