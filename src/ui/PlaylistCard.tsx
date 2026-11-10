import { cn } from "cn";
import { useState } from "react";
import type { PlaylistSummary } from "@/store/playlists";
import { playlistUrl } from "@/ui/pickerCopy";
import { Badge } from "@/ui/primitives/badge";

interface PlaylistCardProps {
	summary: PlaylistSummary;
	selected: boolean;
	onSelect: (s: PlaylistSummary) => void;
}

const FOCUS_RING =
	"outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PlaylistCard({
	summary,
	selected,
	onSelect,
}: PlaylistCardProps) {
	const [imageFailed, setImageFailed] = useState(false);
	const showImage = summary.coverUrl !== null && !imageFailed;

	return (
		<li
			className={cn(
				"flex min-w-0 flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground",
				selected ? "ring-2 ring-primary" : "ring-1 ring-border",
			)}
		>
			<button
				type="button"
				aria-pressed={selected}
				onClick={() => onSelect(summary)}
				className={cn(
					"flex min-w-0 flex-col gap-2 rounded-lg border border-transparent text-left",
					FOCUS_RING,
				)}
			>
				<div data-testid="cover" className="aspect-square w-full">
					{showImage ? (
						<img
							src={summary.coverUrl ?? undefined}
							alt=""
							onError={() => setImageFailed(true)}
							className="size-full rounded-[8px] object-contain"
						/>
					) : (
						<div
							data-testid="cover-placeholder"
							className="size-full rounded-[8px] bg-muted"
						/>
					)}
				</div>
				<span className="block min-w-0 break-words text-sm font-medium">
					{summary.name}
				</span>
				<span className="block min-w-0 break-words text-xs text-muted-foreground">
					{summary.ownerName} · {summary.trackCount}{" "}
					{summary.trackCount === 1 ? "track" : "tracks"}
				</span>
				{summary.collaborative ? (
					<Badge variant="secondary">Collaborative</Badge>
				) : null}
			</button>
			<a
				href={playlistUrl(summary.id)}
				target="_blank"
				rel="noreferrer"
				className={cn(
					"w-fit rounded-lg border border-transparent text-xs font-medium underline-offset-4 hover:underline",
					FOCUS_RING,
				)}
			>
				OPEN SPOTIFY
			</a>
		</li>
	);
}
