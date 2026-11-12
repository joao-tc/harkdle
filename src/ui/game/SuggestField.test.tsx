// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PICK_HINT } from "./gameCopy";
import { SuggestField, type SuggestFieldProps } from "./SuggestField";

afterEach(cleanup);

const SONGS = ["Alpha", "Alpine", "Beta"];
const suggest = (query: string) =>
	SONGS.filter((s) => s.toLowerCase().includes(query.trim().toLowerCase()));

type Overrides = Partial<
	Pick<SuggestFieldProps, "lock" | "wrong" | "hint" | "disabled" | "suggest">
>;

function Controlled({
	onSubmit,
	onTextSpy,
	onPickSpy,
	...overrides
}: Overrides & {
	onSubmit?: () => void;
	onTextSpy?: (text: string) => void;
	onPickSpy?: (value: string) => void;
}) {
	const [text, setText] = useState("");
	const [picked, setPicked] = useState<string | null>(null);
	return (
		<>
			<SuggestField
				field="title"
				label="Title"
				suggest={suggest}
				text={text}
				picked={picked}
				onText={(next) => {
					setText(next);
					setPicked(null);
					onTextSpy?.(next);
				}}
				onPick={(value) => {
					setText(value);
					setPicked(value);
					onPickSpy?.(value);
				}}
				onSubmit={onSubmit ?? (() => {})}
				lock={null}
				wrong={false}
				hint={false}
				disabled={false}
				{...overrides}
			/>
			<output data-testid="picked">{picked ?? "none"}</output>
			<button type="button">after</button>
		</>
	);
}

const input = () => screen.getByRole("combobox", { name: "Title" });

describe("SuggestField", () => {
	it("lists only the suggestions for what was typed", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "alp");

		expect(
			screen.getAllByRole("option").map((option) => option.textContent),
		).toEqual(["Alpha", "Alpine"]);
		expect(input().getAttribute("aria-expanded")).toBe("true");
	});

	it("shows no list for blank text", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "  ");
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect(input().getAttribute("aria-expanded")).toBe("false");
	});

	it("picks the highlighted suggestion with arrows and Enter", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<Controlled onSubmit={onSubmit} />);
		await user.type(input(), "alp");
		await user.keyboard("{ArrowDown}{ArrowDown}");
		expect(input().getAttribute("aria-activedescendant")).toBe(
			screen.getByRole("option", { name: "Alpine" }).id,
		);
		await user.keyboard("{Enter}");

		expect(screen.getByTestId("picked").textContent).toBe("Alpine");
		expect((input() as HTMLInputElement).value).toBe("Alpine");
		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("wraps the highlight with ArrowUp", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "alp");
		await user.keyboard("{ArrowUp}");
		expect(input().getAttribute("aria-activedescendant")).toBe(
			screen.getByRole("option", { name: "Alpine" }).id,
		);
	});

	it("picks a suggestion by click and keeps the input focused", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "be");
		await user.click(screen.getByRole("option", { name: "Beta" }));

		expect(screen.getByTestId("picked").textContent).toBe("Beta");
		expect(document.activeElement).toBe(input());
	});

	it("submits on Enter once when nothing is highlighted", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<Controlled onSubmit={onSubmit} />);
		await user.type(input(), "alp");
		await user.keyboard("{Enter}");

		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId("picked").textContent).toBe("none");
	});

	it("submits on Enter when the list is empty", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		render(<Controlled onSubmit={onSubmit} />);
		await user.click(input());
		await user.keyboard("{Enter}");
		await user.type(input(), "zzz{Enter}");
		expect(onSubmit).toHaveBeenCalledTimes(2);
	});

	it("moves focus on Tab without picking", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "alp");
		await user.keyboard("{ArrowDown}{Tab}");

		expect(document.activeElement).toBe(screen.getByRole("button"));
		expect(screen.getByTestId("picked").textContent).toBe("none");
		expect((input() as HTMLInputElement).value).toBe("alp");
	});

	it("closes the list on Escape and keeps the text", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		await user.type(input(), "alp");
		await user.keyboard("{Escape}");
		expect(screen.queryAllByRole("option")).toHaveLength(0);
		expect((input() as HTMLInputElement).value).toBe("alp");
	});

	it("reports edits after a pick through onText", async () => {
		const user = userEvent.setup();
		const onTextSpy = vi.fn();
		render(<Controlled onTextSpy={onTextSpy} />);
		await user.type(input(), "be");
		await user.click(screen.getByRole("option", { name: "Beta" }));
		onTextSpy.mockClear();
		await user.keyboard("x");

		expect(onTextSpy).toHaveBeenCalledWith("Betax");
		expect(screen.getByTestId("picked").textContent).toBe("none");
	});

	it("shows a locked field as disabled with the tick, value and points", () => {
		render(
			<Controlled lock={{ value: "Alpha", points: 300, featured: false }} />,
		);
		expect(screen.getByLabelText("Title")).toHaveProperty("disabled", true);
		expect(screen.getByText("✓ Alpha · +300")).toBeTruthy();
		expect(screen.queryByRole("combobox")).toBeNull();
	});

	it("says so when a lock is a featured artist", () => {
		render(<Controlled lock={{ value: "Bob", points: 150, featured: true }} />);
		expect(screen.getByText("✓ Bob · featured artist · +150")).toBeTruthy();
	});

	it("shows the ✗ line, and flags the input, when wrong", () => {
		render(<Controlled wrong />);
		expect(screen.getByText("Not it")).toBeTruthy();
		expect(input().getAttribute("aria-invalid")).toBe("true");
		expect(input().getAttribute("aria-describedby")).toBeTruthy();
	});

	it("shows the pick-a-suggestion hint", () => {
		render(<Controlled hint />);
		expect(screen.getByText(PICK_HINT)).toBeTruthy();
	});

	it("disables the input", () => {
		render(<Controlled disabled />);
		expect(input()).toHaveProperty("disabled", true);
	});

	it("focuses itself when asked to", () => {
		render(
			<SuggestField
				field="title"
				label="Title"
				suggest={suggest}
				text=""
				picked={null}
				onText={() => {}}
				onPick={() => {}}
				onSubmit={() => {}}
				lock={null}
				wrong={false}
				hint={false}
				disabled={false}
				autoFocus
			/>,
		);
		expect(document.activeElement).toBe(input());
	});
});
