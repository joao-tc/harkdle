import type { PlaylistSummary } from "@/store/playlists";
import { Button } from "@/ui/primitives/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/ui/primitives/card";

export function SetupStandIn({
	summary,
	usable,
	onBack,
}: {
	summary: PlaylistSummary;
	usable: number;
	onBack: () => void;
}): React.JSX.Element {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="break-words">{summary.name}</CardTitle>
					<CardDescription>
						{usable === 1 ? "1 usable track" : `${usable} usable tracks`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Game setup arrives in a later update.
					</p>
				</CardContent>
				<CardFooter>
					<Button type="button" variant="outline" onClick={onBack}>
						Back
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
