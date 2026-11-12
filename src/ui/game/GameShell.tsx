import type { CSSProperties, ReactNode } from "react";
import type { Accent } from "@/ui/game/accent";
import { GAME_ATTRIBUTION } from "@/ui/game/gameCopy";
import { SpotifyAttribution } from "@/ui/SpotifyAttribution";

const ON_COLOR = { light: "#ffffff", dark: "#000000" } as const;

/**
 * The frame every game stage shares (D1): one column, the full Spotify logo with the
 * attribution line, and the cover's accent as the page background when there is one.
 */
export function GameShell({
	accent,
	children,
}: {
	accent?: Accent;
	children: ReactNode;
}): React.JSX.Element {
	const style = accent
		? ({
				"--art-accent": accent.color,
				"--art-on-accent": ON_COLOR[accent.onColor],
			} as CSSProperties)
		: undefined;
	return (
		<main
			style={style}
			className="min-h-screen w-full bg-(--art-accent) text-(--art-on-accent)"
		>
			<div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pt-8">
				<div className="flex flex-1 flex-col justify-center gap-4 pb-4">
					{children}
				</div>
				<SpotifyAttribution text={GAME_ATTRIBUTION} />
			</div>
		</main>
	);
}
