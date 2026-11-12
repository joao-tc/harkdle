# Song Guessing Game — High-Level Design

A personal web game based on a game played with friends: shuffle one of your Spotify playlists and guess each song in as little time as possible.

## Goals

- **Your own music.** Songs come from a playlist the player chooses, not from a genre or a random catalog.
- **No play limits.** You can play as many games as you like. This is a personal project, so it doesn't need daily caps.

## Platform & Constraints

- The game runs in the browser and plays full tracks through the **Spotify Web Playback SDK**.
- The app is in Spotify's **Development Mode**, which brings these limits:
  - The app owner needs an active, full **Spotify Premium** subscription. Premium Lite and Mini don't work with the SDK.
  - At most 5 allowlisted users.
  - Track lists are only available for playlists the logged-in user **owns or collaborates on**.
- The game is single-player only, for now.

## Playlist Loading

1. The player picks one of their own or collaborative playlists.
2. The game removes items it can't use:
   - local files
   - podcast episodes
   - tracks that are unavailable in the player's region
3. The game removes duplicates by track ID, and by ISRC where available. The ISRC catches the same recording released twice, for example on an album and its deluxe edition.
4. The cleaned list is shuffled once at the start of the game. The game then plays through that queue, so no song repeats within a game.

## Rounds

Each round plays one song, revealed in growing clips, Heardle-style:

| Step | Clip length |
|---|---|
| 1 | 1s (0.5s to be tested; see note) |
| 2 | 2s |
| 3 | 4s |
| 4 | 7s |
| 5 | 11s |
| 6 | 16s |

- Every step replays from the **same start point**.
- There is **no clock**. A step only advances on a skip or a wrong guess.
- The player can **skip** to the next step.
- The player can **give up**. The round ends, the song is revealed, and the player keeps the points from fields already guessed.

The clip lengths are starting values to be tuned through playtesting (see **Tunable Parameters**). A 0.5s first step is worth testing. Playback latency matters most at short lengths, so the clip timer must start when the track actually begins playing, not when play is requested.

### Start Position

- **Classic:** every clip starts at 0:00.
- **Random start:** each round picks a start point between 10% of the track's length and (length − 18 s). That leaves at least 16 seconds plus a 2-second margin after it. The start point is stored for the round, so every step uses the same point.
- **Short tracks:** the latest start is (length − 16 s − 2 s margin). If that is below 10% of the length, the round starts at 0:00 and reroll is disabled for it.

#### Rerolling the Start Point (Random start only)

- The player can **reroll** to a new random start point if the current one is unhelpful, for example a quiet section.
- Rerolls are counted **for the whole game**, not per round. A reroll is rarely needed, so a small shared budget is enough.
- The **first 3 rerolls of a game are free**.
- Each reroll after that is a **paid reroll**. It reduces the score of the round where it was used by **10%**, down to a minimum of 50% of that round's score. This stops players from rerolling repeatedly in search of an easy section.
- Paid rerolls stack linearly, per round: the round's score is multiplied by ×(1 − 0.1·n) for n paid rerolls in that round, floored at ×0.5.
- A reroll lands **at least 8 seconds away** from the current start point. If the start-point range has no such point, reroll is disabled for that round.
- Rerolling does not change the current step.
- If the track fails to load at the new start point, the reroll is cancelled: the round keeps its old start, no reroll is spent, and the player sees a notice.
- The screen shows how many free rerolls are left.

## Guessing

The three guess fields are visible during the whole round. Each uses autocomplete built from the playlist.

- **Title**
- **Artist:** the main artist earns full credit and a featured artist earns partial credit.
- **Album:** skipped when the track comes from a **single** (which includes EPs) or a **compilation**. The player sees a short note explaining why it was skipped.

### Suggestions

- Each field suggests only its own kind (titles, artists, albums), deduplicated after normalization.
- Picking a suggestion reveals nothing about the other fields.

### When Is a Guess Correct?

- The player must **pick a suggestion**.
- The comparison uses normalized text: case- and accent-insensitive, with version suffixes stripped. Normalization strips the **conservative list**: remaster(ed) [year], feat./ft./featuring, live (including "Live at X"), radio edit, single/album version, mono/stereo version, deluxe/expanded/anniversary/special edition, bonus track. Remix, acoustic, demo, instrumental and cover stay distinct. Tags are stripped only inside brackets or after a trailing dash, never at the start of a title, so "Live and Let Die" is untouched. A title that would be left empty keeps its tag.
- After suffix stripping, **delete every character that is not a Unicode letter, number or whitespace**, then collapse whitespace. "Don’t Stop" = "Dont Stop", "P!nk" = "Pnk". A text that would normalize to empty keeps its trimmed, lowercased, accent-stripped form.
- A same-titled song by another artist also counts for Title.

### Main vs Featured Artist

- `artists[0]` is the main artist and earns full credit.
- Any other listed artist is a featured artist and earns **50%** of the Artist points.
- A featured-artist guess locks the Artist field at 50%. It costs no step and is final (no later upgrade).

### Submitting

- The player can submit any combination of the unlocked fields at once.
- A **correct** field **locks in** and costs nothing.
- **Any wrong field advances one step.** A submission costs at most one step, however many fields were wrong.
- Mixed submission (one field right, one wrong): the correct fields lock at the **current** step, then the step advances once.
- Each locked field records the step at which it was guessed. Its points are based on that step.

### End of Round

A round ends when one of these happens:

- **Every field is guessed**: title, artist and album, or just title and artist when the album question was skipped.
- **The player runs out of steps**: a skip or a wrong guess at step 6.
- **The player gives up.**

## Scoring

Each field is scored **independently**, based on the step at which it was locked:

| Step | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Title | 1000 | 800 | 600 | 400 | 250 | 100 |
| Artist (30%) | 300 | 240 | 180 | 120 | 75 | 30 |
| Album (50%) | 500 | 400 | 300 | 200 | 125 | 50 |

The points for the fields that were guessed are added together. A player who gets the artist and album but misses the title still keeps the artist and album points.

**Combo (hat trick):** the round's total is multiplied when **all required fields** were guessed:

- Title, artist and album: **×1.5**
- Title and artist, when the album question was skipped: **×2.0**. Skipped rounds get no album points, so the higher multiplier keeps them close to a normal round.
- A featured-artist lock still earns the hat trick: the combo needs every required field locked, at whatever credit.

**Mode multiplier:** Random start scores **×1.25**. It applies to every round of a Random-start game, including a round that fell back to 0:00 because the track was short.

**Reroll penalty:** once the 3 free rerolls of the game are used up, each paid reroll reduces the score of its round by 10%, down to a minimum of 50% (see **Rerolling the Start Point**).

Order of calculation for a round:

> (title + artist + album points) × combo × mode multiplier × reroll penalty

Field points stay exact (a featured-artist lock at step 5 is 37.5). The **round total is rounded once**, with `Math.round`, after all multipliers (combo, random-start, reroll penalty). The running score is a sum of integer round totals.

Example maximum at step 1 in Classic:

- Normal round: (1000 + 300 + 500) × 1.5 = **2700**
- Album-skipped round: (1000 + 300) × 2.0 = **2600**

## Game Modes

Both modes can be played with Classic or Random start.

- **X Tracks:** play a fixed number of songs and get the highest score you can.
- **Endless:**
  - The run ends after **3 misses**. A miss is a round where the title wasn't guessed, even if the artist or album was.
  - If every song in the playlist has been played, the run ends with a **"Playlist cleared!"** screen.

## End-of-Game Stats

- Final score
- **Histogram:** how many songs were guessed at each step (1–6), plus a "missed" column
  - A round counts at the step where its **Title** was locked. "Missed" means the Title was never locked, even if the artist or album were. This is the same rule as the Endless miss.
- **Hat-trick count**

## Tunable Parameters

All gameplay numbers live in **one configuration file**, not scattered through the code, so they can be changed easily after playtesting.

| Parameter | Starting value |
|---|---|
| Clip lengths per step | 1s, 2s, 4s, 7s, 11s, 16s (also test a 0.5s first step) |
| Title points per step | 1000, 800, 600, 400, 250, 100 |
| Artist points | 30% of the title points for the same step |
| Album points | 50% of the title points for the same step |
| Featured-artist credit | 50% of the Artist points |
| Combo multiplier | ×1.5 |
| Combo multiplier, album skipped | ×2.0 |
| Random-start multiplier | ×1.25 |
| Random start range | 10% of the track's length to (length − 18 s) |
| Minimum time left after the start point | 16s plus a 2s margin |
| Free rerolls per game | 3 |
| Minimum distance of a reroll from the current start | 8 s |
| Penalty per paid reroll | −10% of the score of the round where it was used |
| Minimum after reroll penalties | 50% of the round's score |
| Endless lives | 3 misses |

## Open Questions

- Do the reroll penalty values feel right? To be decided through playtesting.

## Saved for Later

- **Release-year bonus:** the player guesses the year and earns points based on how close they are (from `album.release_date`).
- **Daily seed:** the same song order and start points for everyone, so friends can compare scores.
- **Local game history**, so stats can show improvement across games.
