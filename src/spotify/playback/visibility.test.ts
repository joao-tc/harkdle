import { describe, expect, it } from "vitest";
import { documentVisibility } from "./visibility";

function fakeDoc() {
	const target = new EventTarget();
	const doc = {
		hidden: false,
		addEventListener: target.addEventListener.bind(target),
		removeEventListener: target.removeEventListener.bind(target),
	};
	return {
		doc,
		setHidden(hidden: boolean) {
			doc.hidden = hidden;
			target.dispatchEvent(new Event("visibilitychange"));
		},
	};
}

describe("documentVisibility", () => {
	it("isHidden reads doc.hidden", () => {
		const { doc } = fakeDoc();
		const visibility = documentVisibility(doc);
		expect(visibility.isHidden()).toBe(false);
		doc.hidden = true;
		expect(visibility.isHidden()).toBe(true);
	});

	it("notifies with true on hide and false on show", () => {
		const { doc, setHidden } = fakeDoc();
		const seen: boolean[] = [];
		documentVisibility(doc).subscribe((hidden) => seen.push(hidden));
		setHidden(true);
		setHidden(false);
		expect(seen).toEqual([true, false]);
	});

	it("stops notifying after unsubscribe", () => {
		const { doc, setHidden } = fakeDoc();
		const seen: boolean[] = [];
		const unsubscribe = documentVisibility(doc).subscribe((hidden) =>
			seen.push(hidden),
		);
		setHidden(true);
		unsubscribe();
		setHidden(false);
		expect(seen).toEqual([true]);
	});

	it("keeps two subscribers independent", () => {
		const { doc, setHidden } = fakeDoc();
		const visibility = documentVisibility(doc);
		const a: boolean[] = [];
		const b: boolean[] = [];
		const unsubscribeA = visibility.subscribe((hidden) => a.push(hidden));
		visibility.subscribe((hidden) => b.push(hidden));
		setHidden(true);
		unsubscribeA();
		setHidden(false);
		expect(a).toEqual([true]);
		expect(b).toEqual([true, false]);
	});
});
