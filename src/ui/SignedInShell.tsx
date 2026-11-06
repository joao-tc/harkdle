import type { AccountUser } from "@/store/session";
import { Button } from "@/ui/primitives/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/ui/primitives/card";

export function SignedInShell({
	user,
	onLogout,
}: {
	user: AccountUser;
	onLogout: () => void;
}) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Signed in as {user.displayName}</CardTitle>
					<CardDescription>
						The playlist picker comes next. For now this only proves that login
						works.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button variant="outline" onClick={onLogout}>
						Log out
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}
