import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ListState, PlaylistSummary } from "@/store/playlists";
import { PlaylistCard } from "@/ui/PlaylistCard";
import { EMPTY_LIST_TEXT, errorText, OPEN_SPOTIFY_URL } from "@/ui/pickerCopy";
import { Alert, AlertDescription } from "@/ui/primitives/alert";
import { Button } from "@/ui/primitives/button";
import { Skeleton } from "@/ui/primitives/skeleton";

// Spotify guidelines: show at most 20 items per content set at first.
const PAGE_SIZE = 20;
const SKELETON_COUNT = 10;
const SKELETON_KEYS = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

const GRID_CLASSES =
	"grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

interface PlaylistGridProps {
	list: ListState;
	selectedId: string | null;
	onSelect: (s: PlaylistSummary) => void;
	onRefresh: () => void;
}

export function PlaylistGrid({
	list,
	selectedId,
	onSelect,
	onRefresh,
}: PlaylistGridProps): React.JSX.Element {
	const [visible, setVisible] = useState(PAGE_SIZE);

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-lg font-medium">Your playlists</h2>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Refresh"
					onClick={onRefresh}
				>
					<RefreshCw />
				</Button>
			</div>
			{list.status === "idle" || list.status === "loading" ? (
				<div aria-busy="true" className={GRID_CLASSES}>
					<span className="sr-only">Loading playlists…</span>
					{SKELETON_KEYS.map((key) => (
						<Skeleton key={key} className="aspect-[3/4] w-full rounded-xl" />
					))}
				</div>
			) : null}
			{list.status === "error" ? (
				<div className="flex flex-col items-start gap-3">
					<Alert variant="destructive">
						<AlertDescription>{errorText(list.error, "list")}</AlertDescription>
					</Alert>
					<Button type="button" variant="outline" onClick={onRefresh}>
						Retry
					</Button>
				</div>
			) : null}
			{list.status === "ready" && list.playlists.length === 0 ? (
				<p className="text-sm text-muted-foreground">{EMPTY_LIST_TEXT}</p>
			) : null}
			{list.status === "ready" && list.playlists.length > 0 ? (
				<>
					<ul className={GRID_CLASSES}>
						{list.playlists.slice(0, visible).map((summary) => (
							<PlaylistCard
								key={summary.id}
								summary={summary}
								selected={summary.id === selectedId}
								onSelect={onSelect}
							/>
						))}
					</ul>
					<div className="flex flex-wrap items-center gap-4">
						{list.playlists.length > visible ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => setVisible((v) => v + PAGE_SIZE)}
							>
								Show more
							</Button>
						) : null}
						<a
							href={OPEN_SPOTIFY_URL}
							target="_blank"
							rel="noreferrer"
							className="rounded-lg text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							OPEN SPOTIFY
						</a>
					</div>
				</>
			) : null}
		</section>
	);
}
