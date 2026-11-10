export interface Visibility {
	isHidden(): boolean;
	subscribe(listener: (hidden: boolean) => void): () => void;
}

export function documentVisibility(
	doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
): Visibility {
	return {
		isHidden: () => doc.hidden,
		subscribe(listener) {
			const onChange = () => listener(doc.hidden);
			doc.addEventListener("visibilitychange", onChange);
			return () => doc.removeEventListener("visibilitychange", onChange);
		},
	};
}
