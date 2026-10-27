import type { SetupErrorKind } from "@/store/session";
import { Alert, AlertDescription, AlertTitle } from "@/ui/primitives/alert";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";

interface ErrorCopy {
	title: string;
	message: string;
	fix: string;
	retryLabel?: string;
	canRetry: boolean;
}

const COPY: Record<SetupErrorKind, ErrorCopy> = {
	"not-premium": {
		title: "Spotify Premium required",
		message:
			"The Spotify Web Playback SDK needs full Premium. Premium Lite and Mini don't work.",
		fix: "Switch this account to full Premium, or log out and use another account.",
		canRetry: true,
	},
	"not-allowlisted": {
		title: "Not on the allowlist",
		message:
			"harkdle runs in Spotify's Development Mode, which only serves people the owner added.",
		fix: "Ask the owner to add your Spotify account email.",
		canRetry: true,
	},
	"wrong-origin": {
		title: "Open the app at 127.0.0.1",
		message:
			"Login only works when the page is opened at the address registered with Spotify. localhost is not accepted.",
		fix: "Open the 127.0.0.1 address instead.",
		canRetry: false,
	},
	"missing-config": {
		title: "App not configured",
		message: "No Spotify client ID is set.",
		fix: "Set VITE_SPOTIFY_CLIENT_ID in .env and restart the dev server.",
		canRetry: false,
	},
	"session-expired": {
		title: "Session expired",
		message: "Spotify no longer accepts your login.",
		fix: "Log in again.",
		retryLabel: "Log in again",
		canRetry: true,
	},
	unexpected: {
		title: "Something went wrong",
		message: "harkdle couldn't reach Spotify or got an unexpected answer.",
		fix: "Try again. The detail below may help.",
		canRetry: true,
	},
	"sdk-account": {
		title: "Spotify player refused the account",
		message:
			"Spotify's player rejected this account, usually a Premium problem.",
		fix: "Check the account has full Premium, then retry.",
		canRetry: true,
	},
	"sdk-init": {
		title: "Spotify player couldn't start",
		message: "The browser couldn't start Spotify's player.",
		fix: "Use desktop Chrome and make sure DRM/protected content is enabled, then retry.",
		canRetry: true,
	},
};

export function SetupErrorScreen({
	error,
	detail,
	onRetry,
	onLogout,
	devUrl,
}: {
	error: SetupErrorKind;
	detail?: string;
	onRetry: () => void;
	onLogout: () => void;
	devUrl?: string;
}): React.JSX.Element {
	const copy = COPY[error];

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
			<Card>
				<div className="flex flex-col gap-4 px-(--card-spacing)">
					<Alert variant="destructive">
						<AlertTitle>{copy.title}</AlertTitle>
						<AlertDescription>
							<p>{copy.message}</p>
							<p>{copy.fix}</p>
						</AlertDescription>
					</Alert>
					{error === "wrong-origin" && devUrl ? (
						<a
							href={devUrl}
							className="font-mono text-sm break-all text-foreground underline underline-offset-3"
						>
							{devUrl}
						</a>
					) : null}
					{detail ? (
						<p className="font-mono text-xs break-words text-muted-foreground">
							{detail}
						</p>
					) : null}
					<div className="flex gap-2">
						{copy.canRetry ? (
							<Button type="button" onClick={onRetry}>
								{copy.retryLabel ?? "Retry"}
							</Button>
						) : null}
						<Button type="button" variant="outline" onClick={onLogout}>
							Log out
						</Button>
					</div>
				</div>
			</Card>
		</main>
	);
}
