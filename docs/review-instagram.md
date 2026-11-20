# Review findings, Instagram Reels (the user's first report, 2026-11-19)

The report: on Instagram's Reels page only a GTA reel's caption was covered; its video played
(two reels named, `/reels/Df7SJWPh8Ro/` and `/reels/Df7ql1DJKp4/`). Reproduced on the live
site, logged out, in a throwaway headless Firefox with the add-on, and in the user's saved
logged-in page.

Two rounds of blind reviews, each on a frozen copy of the code (a detached git worktree):
round 1 with five reviewers (security, correctness, design, test quality, wording), round 2
with four (security, correctness, test quality, design with wording in one: the design changes
were the reviewers' own suggestions, so one reader for both was enough). Every finding was
checked against the code; the ones that depended on Instagram were checked on the live site.
Sources: S security, C correctness, D design, T tests, W wording.

## Checked on live Instagram (2026-11-19, logged out)

- Each reel is its own block with its own video; the next reel is never swapped into the same
  elements. The caption is there when the block is (the full caption, also on the saved page).
- The address changes with every reel. Scrolling on: the old video pauses, the address
  changes 1 to 4 ms later, pictures change class 13 to 24 ms after the address, the next video
  plays 31 to 47 ms after it.
- On load, the captions came 46 ms before the videos.
- A single reel's page: 13 comment links under the reel's own code (`/p/<code>/c/<id>/`), and
  "More posts" (links to 10 other posts) shares the next box up with the reel.
- The class names are scrambled; titles are only "Instagram".
- Logged in (the user's saved page): the box around the video and the faint copy of its
  picture is marked `data-virtualized`; the controls carry aria-label "Press to play".
- Cost, copying a pass's page work into the live page: 0.84 ms with 4 reels, 0.40 ms on a
  single reel; Instagram changed the page once in 5 s of playback.

## The user's decisions (2026-11-19)

- Fix the Reels page and a single reel now; the feed, Explore, Stories and profiles later.
- The same as Shorts: covered, paused and muted until read; its GTA lines striped.
- Everything in the reel's block counts, the comments too.
- (From the user's earlier rules, applied here:) "Not about GTA" counts for that reel only, as
  for one Short; a cover stays until the reel is read as not about GTA, so leaving the Reels
  page in place keeps a GTA reel still on the page covered.

## Round 1: real, fixed test-first

Each fix has a journey that was red on the round-1 code (run against the frozen copy with
`GTAB_EXTENSION_DIR`) and green after.

| # | Finding | From | Fix | Proven by |
|---|---|---|---|---|
| 1 | A reel's block is worked out on every pass and changes as the page does; kept by its block, the reel's cover was dropped for a moment and its sound came back | D S C | players kept by their video; a box still used by a player is never let go | instagram-reels "keeps its cover ... a second reel comes in", "More posts comes in after it" |
| 2 | "Not about GTA" was kept per address, which every reel on the page shares: every reel with the word was shown, and the next one played when scrolled to | S C | the word kept per reel, by its video, for the reel being watched | "counts for the reel being watched only" |
| 3 | Words in the video's own wrapper (a label) left no box to cover: the video played | S C D | `boxLevel` falls back to the first box that can carry a cover, then the reel itself | "a label with words on the video itself" |
| 4 | The scroll journey could not fail: the stand-in changed nothing after the address | T | the stand-in changes a class after the address, as Instagram does live | the mutation pass (I13) |
| 5 | Reel codes with "_" or "-", and `/<name>/reel/<code>/`, got no player | T C | the path pattern takes both | sites-rules |
| 6 | A reel shown in a dialog, alone on the page, would read the whole page | C D | an item never reaches the body either | "a reel shown in a dialog" |
| 7 | Moving between Instagram pages without a reload was never tested | T | journeys onto and off the Reels page | "moving in place onto ...", "... off the Reels page" |
| 8 | The rules for the item and the cover box could only be tested in Firefox | D | `itemLevel`, `boxLevel` pure in sites.js; page.js measures | sites-rules |
| 9 | "Read at once" waits were longer than the 4 s check | T | waits of 1.5 s at most for those | the journeys themselves |
| 10 | The caption-first journey did not check its own setup | T | the stand-in waits for a caption to be read first and says so (`__captionFirst`) | "brings each reel's caption before its video" |
| 11 | The controls' changing label was not modeled, so "words outside the player box" was untested | T | the stand-in's label flips as the video plays | "a new source in the same reel" (I16) |
| 12 | Wording: 17 points (changelog promised more than the code did, stale comments, "one box above") | W | rewritten | the round 2 wording review |

## Round 2: real, fixed test-first

| # | Finding | From | Fix | Proven by |
|---|---|---|---|---|
| 1 | The person's word, kept by the video, carried over when another reel's video came into it: the GTA reel played with its sound | S C D | a new source forgets the word | "a reel the person showed, then given another reel's video" |
| 2 | A new video's first source sends no "emptied": a GTA reel added to the page played uncovered until the next flush (~30 ms) | S C | read at its first "play" | the stand-in's `__playedUncovered`, in "brings each reel's caption before its video" and "reels added as the person scrolls" |
| 3 | Covered on a box holding words (no smaller box could carry it), every word was inside its own cover: a GTA reel stayed "Checking", a clean one never played | S C | a player box with words is read whole | "no box between a reel's video and its row can carry a cover" |
| 4 | Off the Reels page in place, a kept GTA reel could not be shown by "Not about GTA", and a clean one was kept for nothing | D C | keep only covered reels, and let go one whose word the person showed | the two "off the Reels page in place" journeys |
| 5 | A caption read before its video was no reel's: after "Not about GTA" on another reel it stayed uncovered | S | a reel's block is read once more when its video first comes | "a reel added with its caption before its video, after Not about GTA on another" |
| 6 | The new-source journey could not tell a reading from the 4 s wait, and its timing could flake | T | timed from the new source; decided within 2 s | "a new source in the same reel" |
| 7 | The per-pass item list was never shown to be reset | T | a clean single reel with More posts coming in late | "a single reel not about GTA stays uncovered when More posts ... comes in after it" |
| 8 | Reels taken off the page were never shown to be let go | T | the stand-in removes a reel | "a reel taken off the page is let go" |
| 9 | Missing: Undo on a reel, the word surviving a restart, which reel is watched, a new video element in a covered reel, the fallback to the whole reel, a player's own box keeping its note | T | journeys for each | the journeys of those names |
| 10 | The item rule was written twice; the box rule redid the words already summed | D | `sites.fitsItem`, used by both; `boxLevel` reads the summed words | sites-rules |
| 11 | Stale wording, overclaims in the notes (the no-box case, the cost) | W D S | rewritten; the limits listed | this file, CLAUDE.md |

## Dropped, and why

- "Undo acts on the reel watched at Undo time, not the one shown" (S, round 2): the menu offers
  Undo only in the same open menu, right after "Not about GTA" (`done` lives in `menu.js` for
  that menu only), and the popup closes as soon as the page is touched. Checked in the code.
- "A creator can hide the word behind more" (S, round 1): the full caption is in the page,
  live and on the user's saved page.
- "The menu says 'Shown again on this page' while other reels stay covered" (D, round 2): the
  same words already stand for one Short on YouTube; the changelog says it counts for that reel.

## Accepted limits (in CLAUDE.md's security pass)

- The reel being watched is the one whose player box shows the largest area in the window;
  boxes are the same size on Instagram, and no stand-in can tell area from share.
- When neither a box around the video nor the reel itself can carry a cover, there is none.
- A reel with nothing to read stays "Checking"; the switch turns it off.
- A block with a second video, or links to two posts, cuts the reel down (not seen live).
- The cost grows faster than the number of reels, and each "emptied" runs a pass of its own.
- Other videos on a single reel's page would become players (not seen live: More posts were
  pictures).
