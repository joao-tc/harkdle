import {
	GIVE_UP_BUTTON,
	GIVE_UP_CANCEL,
	GIVE_UP_CONFIRM,
	GIVE_UP_DESCRIPTION,
	GIVE_UP_TITLE,
} from "@/ui/game/gameCopy";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/ui/primitives/alert-dialog";
import { Button } from "@/ui/primitives/button";

/**
 * The Give up button and the confirmation it opens (L2). Nothing about the track is on
 * screen behind the dialog that was not already there, and only Confirm calls `onConfirm`.
 */
export function GiveUpDialog({
	disabled,
	onConfirm,
	onOpenChange,
}: {
	disabled: boolean;
	onConfirm(): void;
	onOpenChange(open: boolean): void;
}): React.JSX.Element {
	return (
		<AlertDialog onOpenChange={onOpenChange}>
			<AlertDialogTrigger asChild>
				<Button type="button" variant="ghost" disabled={disabled}>
					{GIVE_UP_BUTTON}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{GIVE_UP_TITLE}</AlertDialogTitle>
					<AlertDialogDescription>{GIVE_UP_DESCRIPTION}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{GIVE_UP_CANCEL}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						{GIVE_UP_CONFIRM}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
