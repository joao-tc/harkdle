import type { Selection } from "@/store/playlists";
import {
	cleaningSummary,
	errorText,
	loadingText,
	tooFewText,
} from "@/ui/pickerCopy";
import { Button } from "@/ui/primitives/button";
import { Progress } from "@/ui/primitives/progress";

const HINT_TEXT = "Pick a playlist, or paste a link, to start.";

function StatusText({
	selection,
}: {
	selection: Selection;
}): React.JSX.Element {
	switch (selection.status) {
		case "none":
			return <p className="text-sm text-muted-foreground">{HINT_TEXT}</p>;
		case "loading": {
			const { loaded, total } = selection;
			const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
			return (
				<>
					<p className="text-sm font-medium break-words">
						{selection.summary.name}
					</p>
					<Progress
						value={percent}
						aria-label={`Loading ${selection.summary.name}`}
					/>
					<p className="text-xs text-muted-foreground">
						{loadingText(loaded, total)}
					</p>
				</>
			);
		}
		case "ready":
			return (
				<>
					<p className="text-sm font-medium break-words">
						{selection.summary.name}
					</p>
					<p className="text-xs text-muted-foreground">
						{cleaningSummary(selection.playlist.report)}
					</p>
					{selection.gate.ok ? null : (
						<p className="text-xs text-destructive">
							{tooFewText(selection.gate.usable, selection.gate.needed)}
						</p>
					)}
				</>
			);
		case "error":
			return (
				<>
					<p className="text-sm font-medium break-words">
						{selection.summary.name}
					</p>
					<p className="text-xs text-destructive">
						{errorText(selection.error, "selection")}
					</p>
				</>
			);
	}
}

export function SelectionBar({
	selection,
	onContinue,
	onReload,
}: {
	selection: Selection;
	onContinue: () => void;
	onReload: () => void;
}): React.JSX.Element {
	const canContinue = selection.status === "ready" && selection.gate.ok;

	return (
		<div className="sticky bottom-0 border-t bg-background">
			<div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
				<div
					role="status"
					aria-live="polite"
					className="flex min-w-0 flex-1 basis-64 flex-col gap-1"
				>
					<StatusText selection={selection} />
				</div>
				<div className="flex gap-2">
					{selection.status === "none" ? null : (
						<Button type="button" variant="outline" onClick={onReload}>
							Reload
						</Button>
					)}
					<Button type="button" disabled={!canContinue} onClick={onContinue}>
						Continue
					</Button>
				</div>
			</div>
		</div>
	);
}
