import { CONNECTING_TEXT } from "@/ui/game/gameCopy";

export function ConnectingScreen(
	_props: Record<string, never>,
): React.JSX.Element {
	return (
		<section className="flex flex-col items-center py-16">
			<p role="status" className="text-lg text-muted-foreground">
				{CONNECTING_TEXT}
			</p>
		</section>
	);
}
