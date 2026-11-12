// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GiveUpDialog } from "./GiveUpDialog";

afterEach(cleanup);

function setup(disabled = false) {
	const onConfirm = vi.fn();
	const onOpenChange = vi.fn();
	const user = userEvent.setup();
	render(
		<GiveUpDialog
			disabled={disabled}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
		/>,
	);
	return { onConfirm, onOpenChange, user };
}

const openDialog = (user: ReturnType<typeof userEvent.setup>) =>
	user.click(screen.getByRole("button", { name: "Give up" }));

describe("GiveUpDialog", () => {
	it("asks before doing anything", async () => {
		const { onConfirm, user } = setup();
		expect(screen.queryByRole("alertdialog")).toBeNull();
		await openDialog(user);

		expect(screen.getByRole("alertdialog")).toBeTruthy();
		expect(screen.getByText("Give up this round?")).toBeTruthy();
		expect(
			screen.getByText(
				"The song will be revealed and the round scores what you have locked.",
			),
		).toBeTruthy();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("closes on Keep playing without confirming", async () => {
		const { onConfirm, user } = setup();
		await openDialog(user);
		await user.click(screen.getByRole("button", { name: "Keep playing" }));

		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("closes on Escape without confirming", async () => {
		const { onConfirm, user } = setup();
		await openDialog(user);
		await user.keyboard("{Escape}");

		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("confirms exactly once", async () => {
		const { onConfirm, user } = setup();
		await openDialog(user);
		await user.click(
			screen.getByRole("button", { name: "Give up", hidden: false }),
		);

		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	it("cannot be opened while disabled", async () => {
		const { user, onOpenChange } = setup(true);
		const trigger = screen.getByRole("button", { name: "Give up" });
		expect(trigger).toHaveProperty("disabled", true);
		await user.click(trigger);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("reports opening and closing to the parent", async () => {
		const { onOpenChange, user } = setup();
		await openDialog(user);
		await user.keyboard("{Escape}");

		expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
	});
});
