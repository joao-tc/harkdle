import type { InterruptionReason } from "@/store/game";

// Every user-facing string of the game screens, and the helpers that need numbers.
// The numbers are formatted in en-US so the text does not depend on the browser's locale.

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const trimmed = (n: number): string => NUMBER.format(n);

/** "1,840". */
export const formatNumber = (n: number): string => NUMBER.format(n);

// ── Setup ──────────────────────────────────────────────────────────────────────
export const usableTracks = (n: number): string =>
	n === 1 ? "1 usable track" : `${n} usable tracks`;
export const SETUP_TRACKS_LABEL = "Tracks";
export const SETUP_MODE_LABEL = "Mode";
export const MODE_X_TRACKS = "X Tracks";
export const MODE_ENDLESS = "Endless";
export const SETUP_START_FROM_LABEL = "Start from";
export const START_CLASSIC = "Classic";
export const START_RANDOM = "Random";
export const COMING_SOON = "coming soon";
export const comingSoon = (label: string): string =>
	`${label} (${COMING_SOON})`;
export const VOLUME_LABEL = "Volume";
export const volumePercent = (volume: number): string =>
	`${Math.round(volume * 100)}%`;
export const START_BUTTON = "Start";
export const BACK_BUTTON = "Back";

// ── Connecting and countdown ───────────────────────────────────────────────────
export const CONNECTING_TEXT = "Connecting to Spotify…";
export const COUNTDOWN_LABEL = "Next round in";

// ── Round ──────────────────────────────────────────────────────────────────────
export const roundHeader = (n: number, x: number): string =>
	`Round ${n} of ${x}`;
export const scoreText = (n: number): string => `Score ${formatNumber(n)}`;
export const ladderLabel = (step: number, of: number): string =>
	`Step ${step} of ${of}`;
export const clipLabel = (ms: number): string => `${ms / 1000}s`;
export const playLabel = (ms: number): string => `Play ${clipLabel(ms)} clip`;
export const PLAYING_LABEL = "Playing…";
export const PREPARING_LABEL = "Preparing…";

export const FIELD_TITLE = "Title";
export const FIELD_ARTIST = "Artist";
export const FIELD_ALBUM = "Album";
export const FIELD_PLACEHOLDER = "Start typing…";
export const PICK_HINT = "Pick one of the suggestions to submit this field.";
export const WRONG_MARK = "Not it";
export const ALBUM_SKIPPED_TEXT =
	"Album skipped — this track is a single/compilation";

export const SUBMIT_BUTTON = "Submit";
export const SKIP_BUTTON = "Skip";
export const SKIP_LAST_STEP_BUTTON = "Skip (ends the round)";
export const skipLabel = (step: number): string =>
	step === 6 ? SKIP_LAST_STEP_BUTTON : SKIP_BUTTON;
export const GIVE_UP_BUTTON = "Give up";

/** "+300", "+37.5", "+1,000". */
export const pointsText = (points: number): string => `+${trimmed(points)}`;

/** "✓ Value · +300", or "✓ Value · featured artist · +150". */
export const lockedText = (
	value: string,
	points: number,
	featured: boolean,
): string =>
	featured
		? `✓ ${value} · featured artist · ${pointsText(points)}`
		: `✓ ${value} · ${pointsText(points)}`;

// ── Give up dialog ─────────────────────────────────────────────────────────────
export const GIVE_UP_TITLE = "Give up this round?";
export const GIVE_UP_DESCRIPTION =
	"The song will be revealed and the round scores what you have locked.";
export const GIVE_UP_CONFIRM = "Give up";
export const GIVE_UP_CANCEL = "Keep playing";

// ── Play here ──────────────────────────────────────────────────────────────────
export const playHereReason = (reason: InterruptionReason): string =>
	reason === "taken-over"
		? "Spotify is playing elsewhere."
		: "harkdle's player disconnected.";
export const PLAY_HERE_BUTTON = "Play here";
export const PLAY_HERE_WORKING = "Reconnecting…";
export const PLAY_HERE_FAILED =
	"Couldn't reconnect. Check Spotify is open and try again.";

// ── Skipped track ──────────────────────────────────────────────────────────────
export const SKIPPED_NOTICE = "A track couldn't be loaded and was skipped.";
export const DISMISS_BUTTON = "Dismiss";

// ── Reveal ─────────────────────────────────────────────────────────────────────
export type MultiplierKind = "hatTrick" | "randomStart" | "rerolls";

const MULTIPLIER_NAME: Readonly<Record<MultiplierKind, string>> = {
	hatTrick: "Hat trick",
	randomStart: "Random start",
	rerolls: "Rerolls",
};

/** "Hat trick ×1.5", "Hat trick ×2.0", "Random start ×1.25", "Rerolls ×0.9". */
export const multiplierLabel = (
	kind: MultiplierKind,
	value: number,
): string => {
	const shown = Number.isInteger(value) ? value.toFixed(1) : trimmed(value);
	return `${MULTIPLIER_NAME[kind]} ×${shown}`;
};
export const ROUND_TOTAL = "Round total";
export const SCORE_LABEL = "Score";
export const PLAY_ON_SPOTIFY = "PLAY ON SPOTIFY";
export const trackUrl = (id: string): string =>
	`https://open.spotify.com/track/${id}`;
export const NEXT_BUTTON = "Next";
export const NOT_GUESSED = "Not guessed";
export const COVER_ALT = "Album cover";
export const NO_COVER_ALT = "No album cover available";
export const FEATURED_ARTIST = "featured artist";

// ── Results ────────────────────────────────────────────────────────────────────
export const FINAL_SCORE = "Final score";
export const HAT_TRICKS = "Hat tricks";
export const ROUNDS_PLAYED = "Rounds played";
export const stepRowLabel = (step: number): string => `Step ${step}`;
export const MISSED_LABEL = "Missed";
export const PLAY_AGAIN_BUTTON = "Play again";
export const CHANGE_PLAYLIST_BUTTON = "Change playlist";
export const NO_TRACKS_PLAYED = "No tracks could be played.";
export const HISTOGRAM_LABEL = "Rounds by the step the title was guessed";

// ── Footer ─────────────────────────────────────────────────────────────────────
export const GAME_ATTRIBUTION = "Track data and artwork from Spotify";
