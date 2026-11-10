import { type FormEvent, useState } from "react";
import type { PasteState } from "@/store/playlists";
import { errorText, restrictedPasteText } from "@/ui/pickerCopy";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";

export function PlaylistPasteBox({
	paste,
	onLookup,
}: {
	paste: PasteState;
	onLookup: (input: string) => void;
}) {
	const [text, setText] = useState("");
	const blank = text.trim() === "";

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (blank) return;
		onLookup(text.trim());
	};

	return (
		<div className="flex flex-col gap-2">
			<form className="flex gap-2" onSubmit={submit}>
				<Input
					type="text"
					aria-label="Paste a playlist link"
					placeholder="https://open.spotify.com/playlist/… or spotify:playlist:…"
					value={text}
					onChange={(event) => setText(event.target.value)}
				/>
				<Button type="submit" disabled={blank || paste.status === "loading"}>
					Look up
				</Button>
			</form>
			{paste.status === "loading" && (
				<p role="status" className="text-sm text-muted-foreground">
					Looking up…
				</p>
			)}
			{paste.status === "restricted" && (
				<p role="alert" className="text-sm text-destructive">
					{restrictedPasteText(paste.name, paste.ownerName)}
				</p>
			)}
			{paste.status === "error" && (
				<p role="alert" className="text-sm text-destructive">
					{errorText(paste.error, "paste")}
				</p>
			)}
		</div>
	);
}
