# Step 6 review findings, YouTube Shorts (2026-11-19)

Round 1: five blind reviews (security, correctness, code design, test quality, wording) and the
outside audit (ChatGPT, gpt-6-astra; Gemini, 3.8-flash-high), all on the same frozen copy of the
first Shorts build. Every finding was checked against the code; the ones that depended on
YouTube were checked on the live site in a throwaway headless Firefox. Sources: S security,
C correctness, D design, T tests, W wording, G ChatGPT, M Gemini.

## Checked on live YouTube (2026-11-19)

- From a GTA Short, the YouTube logo moved the address to Home before the title: Home was
  covered as about GTA for good, the tab "Hidden page" (still there 8 s later).
- From a Short not about GTA into a GTA one: the GTA video played uncovered, with its sound,
  for ~0.4 s (0.16 s of it heard) before its caption came.
- The caption is drawn on top of the player's cover: its GTA words stayed readable.
- YouTube swaps the next Short's video in ("emptied", "play", "loadstart") 16 to 245 ms BEFORE
  it changes the address; the caption comes ~0.8 s after the address.
- The caption is four rows (a search suggestion, the channel with Subscribe, the title, the
  music); the comments panel is OUTSIDE the Short element.
- `/shorts` (no slash) lasts ~1.5 s with the title "- YouTube" before the first Short.
- Under the cover, YouTube turns its video's sound back on by itself while it loads the next
  Short. The video stays paused, and a play is paused and muted at once: nothing was heard.

## The user's decisions on them (2026-11-19)

- Every Short starts under a "Checking for GTA..." cover, paused and muted, until its caption
  is read; it is lifted only when a caption shows it is not about GTA, then it plays from the
  start.
- A GTA Short's caption line gets its own cover (the channel and Subscribe stay).
- A caption that never changes (two Shorts with the very same one) is decided after 4 s.

## Real, fixed test-first

| # | Finding | From | Fix | Proven by |
|---|---|---|---|---|
| 1 | Leaving a GTA Short in place left the next page under the whole-page cover for good | D C T, live | `pageStep` sees every page (`allowed`); a GTA title left behind makes the next address wait for its own | page-cover-rules; youtube-shorts "leaving a GTA Short" |
| 2 | Show anyway outlived a trip through Shorts | C G | the same: a Shorts page goes through `pageStep` and forgets it | page-cover-rules |
| 3 | Into a GTA Short, ~0.4 s uncovered with its sound | W T C G, live | the user's checking cover (`sites.playerStep`), started by a new address or a new video source | sites-rules; youtube-shorts "into a GTA Short" |
| 4 | The GTA caption readable over the player's cover | C W, live | the caption's rows are covered like any card; covers in a Short never climb past it | youtube-shorts first journey, "a picture about GTA elsewhere" |
| 5 | A reloaded add-on left YouTube's video muted for good | T C S | the video's own setting kept on it (`data-gta-muted`), given back by the next copy | reload "its own sound back" |
| 6 | The add-on could press play on a video the person paused | S C G | `lib/media.js`: a play while no cover holds it spends the wish; the person lifting it never plays | media-rules |
| 7 | A replaced player box: the old, detached video played, the new box went unchecked | S C G | the player is found again on every pass; a detached video is never played | youtube-shorts "a new player box"; media-rules |
| 8 | A video moved out of a covered box stayed muted | D C S G | every held video no cover holds any more gets its sound back, wherever it is | media-covers "moves out" |
| 9 | Every recheck turned the sound on and off, and undid a mute set while covered | S C M | uncovering no longer touches media; it is freed only once no cover holds it | (structure; no test counts volume events) |
| 10 | An empty caption was taken as "not about GTA" | G | an empty caption never decides | sites-rules |
| 11 | m.youtube.com lost both covers | D S C T | only "www." is stripped | sites-rules |
| 12 | `/shorts` (no slash) was not a Shorts page | M | `/^\/shorts(\/|$)/` | sites-rules |
| 13 | A made-up "play" from the page counted | G M | only trusted play events | youtube-shorts "a made-up play" |
| 14 | Media in a shadow tree was not held, and its play not heard | D S C G T | media found in shadow trees; each gets its own play listener | media-covers "inside a shadow tree" |
| 15 | The whole-page cover paused but never muted | G D | one media rule for every cover | youtube-shorts "the whole-page cover pauses and mutes" |
| 16 | The player's box skipped the checks every cover gets | D C T | it goes through `canCarry`, falling back to the box around it (and keeps a box that carries its cover: the check climbed one box a pass) | youtube-shorts "cannot carry a cover" |
| 17 | A recheck could play a video covered again by a smaller card | S | the same as 9 | (structure) |
| 18 | Changes in a shadow tree under a Short were not seen | C M | the scope map is gone; `coveredAncestor` crosses shadow boundaries | (structure) |
| 19 | Mutation breaks P15 and P34 no longer applied (P41 already stale) | C | P15 applies again; P34 and P41 point at the current lines | mutation-pass-step6.md |
| 20 | Four breaks of the first build survived every test | T C | tests for GTA to GTA, a page-muted video, a covered playing video, a page moving into a Short | mutation-pass-step6.md |
| 21 | "Not about GTA" could not be told from the switch; no badge check | T C | the badge is checked before and after | youtube-shorts |
| 22 | The stand-in's timing was not YouTube's | T M | the new video first, the address 150 ms later, the caption 800 ms after that | youtube-shorts |
| 23 | No journey for the switch on a Short | M T | added (removing a word restarts the page the same way) | youtube-shorts "the switch off" |
| 24 | page-start loaded page.js without sites.js | D M | it loads media.js and sites.js too | page-start |
| 25 | Comments that did not match the code; mixed names (pageCover) | D | rewritten with the code; `allowsPageCover` | - |
| 26 | Changelog lines that promised more than the code, or mixed two things | W | rewritten: the Shorts player apart from a Short's tile, the wait, the tab title, "for that Short only", the limit on embedded videos | - |

## Dropped, with the reason

- A GTA comment covering a Short not about GTA (S D C): live, the comments panel is outside the
  Short element.
- A hostile page gaining control over media, or getting YouTube's rules elsewhere (S): it can
  only do to its own media what it could already do; host matching refuses look-alikes.
- "The cover never lifts, completely sure" (M, contains() across shadow trees): live, YouTube's
  caption is not in a shadow tree and the cover lifted; the code involved is gone.
- The add-on's play() refused by Firefox's default autoplay policy (C): the user's own try
  showed the next Short playing; not tested with the default policy.

## Later, on purpose

- The site API for Reddit, X, Google and Instagram (D), and hosts like old.reddit.com or
  google.com.br (M): with those sites, step 6's next part.
- A video in a frame embedded inside a covered item keeps playing: the changelog says so.
- A GTA Short now counts two covers or more on the icon (the player, the caption line).
- Wording: "rules made for" (W10) kept; the user saw it before.

## Round 2 (2026-11-19), on the fixed build

The same seven reviewers on a fresh frozen copy. Every finding was checked against the code;
the ones that depended on timing were reproduced in Firefox with stand-ins first (each new
journey below was seen failing on the round 2 copy).

The user's decisions on them: right after a GTA Short, the next one's cover says "Checking for
GTA..." too (not the last Short's word, and not counted on the icon until decided); inside a
Short, a caption line's cover shows the stripes only (the player's note already says it).

| # | Finding | From | Fix | Proven by |
|---|---|---|---|---|
| 1 | The add-on pressed play on a GTA video whose hold ended for another reason: moved out of its card, or under a whole-page cover closed because the page moved on (to a Short, or Back to Home) | D S C T | a release has its reason: only a recheck or a player decided clean ('content') may play; moved, gone or navigated is 'lost'; the whole-page cover closing never plays | media-covers "moves out... stays paused"; youtube-shorts "moves in place to a Short", "to a page not about GTA" |
| 2 | Covers drawn while a page was still loading were wiped by the start-up clean-up, and the player cover never came back | G C T | a player cover the page lost is drawn again | youtube-shorts "a page still loading" (`early.slow.html`) |
| 3 | Any caption row changing counted as the new Short's caption | G C T S | only the title row tells a new Short apart | "the caption's rows coming apart" |
| 4 | "Not about GTA" during the check: the Short played once it was shown | G | the person's word spends the wish ('stay') | media-rules; "while the next Short is being checked" |
| 5 | YouTube turns the sound back on under the cover | M T | muted again on "volumechange", five tries a second at most | "GTA after GTA" samples; "keeps turning the sound back on" |
| 6 | An empty caption made the page look again every 50 ms | G M D S C | no wake time without a caption | sites-rules |
| 7 | Shadow-tree listeners piled up on every restart | G S C | one set per tree for the life of the frame | (structure: no page can see it) |
| 8 | A video's first source held a Short under "Checking" for 4 s | D C | only a replaced source ("emptied") is the next Short | "first source late" |
| 9 | A player cover drawn again read its own pseudo-elements: its layers flipped | C | a drawn cover keeps its size and layers | "into a GTA Short" (layers stay "both") |
| 10 | Text that came into the player while covered was never read | D S C | read when the player is shown | "text that came into the player" |
| 11 | With no caption, the whole Short's words (its buttons) were read | D S | no caption reads as nothing, which never decides (fails closed) | "no caption at all" |
| 12 | A Short with no memory trusted the caption already there on a new video | C T D | a new video distrusts it | sites-rules |
| 13 | The next Short after a GTA one showed the last Short's word | W | the user's decision above | sites-rules; "from a GTA Short..." |
| 14 | One GTA Short said the same thing twice | W | the user's decision above (`data-gta-quiet`) | the first Shorts journey |
| 15 | Tests: the sound counter never seen counting, the window size not checked, no Undo or "that Short only" journey, round 1's row 9 held by structure only | T | the control shows it counts; the size is asserted; both journeys added; "no flicker on a recheck" (red on round 1) | - |
| 16 | "On a play" left in the docs; no step 6 security pass; changelog lines | M S W | fixed; security pass in CLAUDE.md; nine wording fixes | - |

### Dropped or accepted, with the reason

- Keys swallowed while the focus is inside a covered player (C): accepted; the guard takes
  every key aimed at a cover; the wheel and the side button move on.
- The player box may be the Short itself (C): kept on purpose; when nothing smaller can carry a
  cover, the whole Short is covered rather than nothing.
- A page whose own window listener stops a play first, a shadow tree attached after the cover,
  a detached `new Audio()`, Web Audio, a video in a frame (S): accepted limits, written in the
  security pass.
- Sound a page plays before the add-on has started (it reads its settings first): beyond its
  reach, on any site.
- Two items alive at once share the address as their key (D): YouTube reuses one; for the next
  sites.
- `playerStep`'s act is unused by page.js; more of page.js could be pure; one record per item;
  naming; how step 5's photos fit these covers (D): recorded for the next sites and step 5.
- One player box claimed by two items in one pass (S): a layout risk only.
- A restart of the add-on inside the 0.8 s gap starts with no memory (C T D): rare; a new video
  distrusts the caption (12), a bare restart does not.
- A page cancelling the add-on's timers by id (S, older than step 6): to check later.
