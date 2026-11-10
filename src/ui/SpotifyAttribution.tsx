import spotifyLogo from "@/ui/assets/spotify-logo-white.svg";
import { ATTRIBUTION_TEXT } from "@/ui/pickerCopy";

export function SpotifyAttribution(
	_props: Record<string, never>,
): React.JSX.Element {
	return (
		<footer className="flex items-center gap-4 p-4">
			<img src={spotifyLogo} alt="Spotify" className="h-auto w-24 shrink-0" />
			<p className="text-sm text-muted-foreground">{ATTRIBUTION_TEXT}</p>
		</footer>
	);
}
