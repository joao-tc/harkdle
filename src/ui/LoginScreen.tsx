import { Button } from "@/ui/primitives/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/ui/primitives/card";

export function LoginScreen(props: { onLogin: () => void }): React.JSX.Element {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-2xl">harkdle</CardTitle>
					<CardDescription>
						A song-guessing game that plays clips from your own Spotify
						playlists, Heardle-style.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<h2 className="font-medium">You'll need</h2>
					<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
						<li>A Spotify account with full Premium (not Lite or Mini)</li>
						<li>To be added to the app's allowlist (ask the owner)</li>
						<li>Desktop Chrome</li>
					</ul>
				</CardContent>
				<CardFooter>
					<Button className="w-full" onClick={props.onLogin}>
						Log in with Spotify
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
