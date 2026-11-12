// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VolumeControl } from "./VolumeControl";

afterEach(cleanup);

describe("VolumeControl", () => {
	it("shows the 0-1 volume as a 0-100 slider with a percent readout", () => {
		render(<VolumeControl volume={0.8} onChange={() => {}} />);
		const slider = screen.getByRole("slider", { name: "Volume" });
		expect((slider as HTMLInputElement).value).toBe("80");
		expect(slider.getAttribute("min")).toBe("0");
		expect(slider.getAttribute("max")).toBe("100");
		expect(screen.getByText("80%")).toBeTruthy();
	});

	it("reports a change as a 0-1 value", () => {
		const onChange = vi.fn();
		render(<VolumeControl volume={0.8} onChange={onChange} />);
		fireEvent.change(screen.getByRole("slider"), { target: { value: "35" } });
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith(0.35);
	});

	it("moves one point per arrow key, which the browser does for a step of 1", () => {
		render(<VolumeControl volume={0.5} onChange={() => {}} />);
		expect(screen.getByRole("slider").getAttribute("step")).toBe("1");
	});

	it("reaches both ends", () => {
		const onChange = vi.fn();
		render(<VolumeControl volume={0.5} onChange={onChange} />);
		fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
		fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
		expect(onChange).toHaveBeenNthCalledWith(1, 0);
		expect(onChange).toHaveBeenNthCalledWith(2, 1);
	});

	it("associates the label with the input", () => {
		render(<VolumeControl volume={0.2} onChange={() => {}} />);
		expect(screen.getByLabelText("Volume")).toBe(screen.getByRole("slider"));
	});
});
