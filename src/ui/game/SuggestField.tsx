import { useEffect, useId, useRef, useState } from "react";
import type { Field } from "@/game/types";
import {
	FIELD_PLACEHOLDER,
	lockedText,
	PICK_HINT,
	WRONG_MARK,
} from "@/ui/game/gameCopy";
import { Input } from "@/ui/primitives/input";

export interface SuggestFieldProps {
	field: Field;
	label: string;
	suggest: (query: string) => readonly string[];
	text: string;
	picked: string | null; // the suggestion the player chose, or null
	onText(text: string): void; // typing; the parent clears `picked`
	onPick(value: string): void;
	onSubmit(): void; // Enter with no highlighted suggestion
	lock: { value: string; points: number; featured: boolean } | null;
	wrong: boolean;
	hint: boolean;
	disabled: boolean;
	autoFocus?: boolean;
}

/**
 * A text field with a list of that field's own suggestions (ARIA 1.2 combobox).
 * Only a suggestion counts as a guess: the parent knows whether `text` was picked.
 */
export function SuggestField({
	field,
	label,
	suggest,
	text,
	picked,
	onText,
	onPick,
	onSubmit,
	lock,
	wrong,
	hint,
	disabled,
	autoFocus = false,
}: SuggestFieldProps): React.JSX.Element {
	const id = useId();
	const inputId = `${id}-input`;
	const listId = `${id}-list`;
	const noteId = `${id}-note`;
	const inputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);

	useEffect(() => {
		if (autoFocus) inputRef.current?.focus();
	}, [autoFocus]);

	const options =
		open && picked === null && text.trim() !== "" ? suggest(text) : [];
	const expanded = options.length > 0;
	const optionId = (index: number) => `${id}-option-${index}`;

	const pick = (value: string) => {
		onPick(value);
		setOpen(false);
		setActive(-1);
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				setOpen(true);
				if (options.length > 0) setActive((active + 1) % options.length);
				break;
			case "ArrowUp":
				event.preventDefault();
				setOpen(true);
				if (options.length > 0) {
					setActive(active <= 0 ? options.length - 1 : active - 1);
				}
				break;
			case "Enter": {
				event.preventDefault();
				const highlighted = expanded ? options[active] : undefined;
				if (highlighted !== undefined) pick(highlighted);
				else onSubmit();
				break;
			}
			case "Escape":
				if (expanded) {
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
					setActive(-1);
				}
				break;
			// Tab moves focus and never picks.
		}
	};

	const note = wrong ? (
		<p id={noteId} className="text-sm text-destructive">
			<span aria-hidden="true">✗ </span>
			{WRONG_MARK}
		</p>
	) : hint ? (
		<p id={noteId} className="text-sm text-muted-foreground">
			{PICK_HINT}
		</p>
	) : null;

	return (
		<div className="flex flex-col gap-1.5" data-field={field}>
			<label htmlFor={inputId} className="text-sm font-medium">
				{label}
			</label>
			{lock ? (
				<>
					<Input id={inputId} value={lock.value} disabled readOnly />
					<p className="text-sm text-muted-foreground">
						{lockedText(lock.value, lock.points, lock.featured)}
					</p>
				</>
			) : (
				<div className="relative">
					<Input
						id={inputId}
						ref={inputRef}
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={expanded}
						aria-controls={listId}
						aria-activedescendant={
							expanded && active >= 0 ? optionId(active) : undefined
						}
						aria-invalid={wrong || undefined}
						aria-describedby={note ? noteId : undefined}
						autoComplete="off"
						spellCheck={false}
						data-picked={picked !== null ? "" : undefined}
						placeholder={FIELD_PLACEHOLDER}
						value={text}
						disabled={disabled}
						onChange={(event) => {
							onText(event.target.value);
							setOpen(true);
							setActive(-1);
						}}
						onKeyDown={onKeyDown}
						onBlur={() => {
							setOpen(false);
							setActive(-1);
						}}
					/>
					<div
						id={listId}
						role="listbox"
						aria-label={label}
						hidden={!expanded}
						className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
					>
						{options.map((option, index) => (
							// Keyboard users act through the input (arrows + Enter); the click is for the pointer.
							// biome-ignore lint/a11y/useKeyWithClickEvents: the input owns the keyboard path
							<div
								key={option}
								id={optionId(index)}
								role="option"
								tabIndex={-1}
								aria-selected={index === active}
								data-active={index === active ? "" : undefined}
								className="cursor-pointer rounded-md px-2 py-1.5 text-sm data-[active]:bg-muted"
								// Keeps focus in the input so the blur handler does not close the list first.
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => pick(option)}
							>
								{option}
							</div>
						))}
					</div>
				</div>
			)}
			{note}
		</div>
	);
}
