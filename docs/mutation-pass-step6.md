# Mutation pass, step 6: YouTube Shorts and the media rule (2026-11-19, rounds 1 and 2)

Each rule was broken on purpose, one at a time, in a throwaway copy, and the tests that should
catch it were run: the micro ones in Node, the macro ones in the installed Firefox, headless, on
the stand-ins (`tests/fixtures/www.youtube.com/shorts/gta.html`, with YouTube's own timing:
the new video first, the address 150 ms later, the caption 800 ms after that;
`www.youtube.com/watch-gta.html`; `media.test/index.html`), with autoplay allowed so that a
paused video can only be the extension's doing. Rerun: `node tools/mutation-pass.mjs base Y01 ...`.

**Result: 48 breaks, 48 turned a test red.** The first run had 49 with 2 green; both are dealt
with below (Y24 left with its code). An unbroken copy was green first. This replaces the first build's table (Y01 to Y15 there), whose code was rewritten.

## What the first run found (2 green, both dealt with)

- **Y24, "a play decides the players at once"**: green. It was redundant: YouTube's new video
  sends "emptied" and "loadstart" with the play, and first (live), and those decide. The code
  was removed rather than kept unproven.
- **Y29, "the Short itself is never covered whole"**: green, because the test could not fail:
  in the test Firefox's 1366 x 683 window the Short is over the 60% a card may take, so the
  general rules never chose it. The journey now runs in a 1600 x 1000 window (the live checks'
  size), and the break turns it red.
- P15 applies again (the recheck is back to its first shape); P34 and P41 point at the lines as
  they are now (both were "NOT APPLIED" in the round 1 review).

| # | Rule | Break | Turned red (one of the tests) |
|---|---|---|---|
| P15 | a covered box that changes is chosen again from scratch | only uncover when nothing matches | covering-hard: removing a piece of a line, changing text in place... |
| P34 | the page's sound is held under the whole-page cover | no holding | covering: keys do not reach the page under the whole-page cover, and its sound is paused |
| P41 | a class that names a card makes a card | ignore classes | covering: GTA tiles, lines and comments are covered on the right box |
| Y01 | a Shorts page (/shorts too) gets no whole-page cover | give it one | youtube-shorts: a GTA Short: its player and its title line are covered... |
| Y02 | only the site itself gets its rules, not a look-alike | match the end of the name | sites-rules: the mobile site is a site of its own |
| Y03 | the mobile site keeps the general rules | strip "m." too | sites-rules: the mobile site is a site of its own |
| Y04 | a host is read whatever its case, and with a final dot | read it as given | sites-rules: YouTube Shorts get no whole-page cover |
| Y05 | a new Short's caption is not trusted until it changes | trust it at once | youtube-shorts: into a GTA Short from one not about GTA... |
| Y06 | an empty caption never decides while a Short is checked | let it decide | sites-rules: a Short with no caption yet is checked |
| Y07 | an empty caption never decides once a Short is decided | let it decide | sites-rules: an empty caption is never taken as "not about GTA" |
| Y08 | a caption that never changes is decided after 4 s | never | youtube-shorts: a Short whose caption is the very same... |
| Y09 | a GTA Short's cover stays while the next one is checked | show "Checking" instead | sites-rules: scrolling from a GTA Short: its cover stays... |
| Y10 | a new video in the Short restarts the check | ignore it | youtube-shorts: into a GTA Short from one not about GTA... |
| Y11 | the page looks again when the wait is over | never | youtube-shorts: a Short whose caption is the very same... |
| Y12 | a held video gets its own sound setting back | always sound on | youtube-shorts: a video the page had muted itself stays muted |
| Y13 | the play the page asked for goes through when the content changed | never | youtube-shorts: from a GTA Short to one not about GTA... |
| Y14 | a cover the person lifts leaves the video paused | play it too | youtube-shorts: "Not about GTA" on a covered Short... |
| Y15 | never a video taken out of the page | play it too | youtube-shorts: when the site puts in a new player box... |
| Y16 | a play while no cover holds it spends the wish | keep it | media-rules: played while no cover holds it |
| Y17 | a cover on a playing video remembers it was playing | forget it | media-rules: a cover on a playing video... |
| Y18 | a second cover keeps the first sound setting | take the mute as its own | media-rules: a second cover keeps the first sound setting |
| Y19 | the whole-page cover follows the site's rule | ignore it | youtube-shorts: a GTA Short: its player and its title line... |
| Y20 | a covered box holds its media | leave them | media-covers: a video inside a shadow tree... |
| Y21 | a play under a cover is paused and muted again | let it play | media-covers: a video inside a shadow tree... |
| Y22 | only a real play counts | a made-up one too | youtube-shorts: a made-up "play" from the page is not a wish to play |
| Y23 | a new video source is the first sign of the next Short | not listened to | youtube-shorts: into a GTA Short from one not about GTA... |
| Y25 | media inside shadow trees is found | light DOM only | media-covers: a video inside a shadow tree... |
| Y26 | a play inside a shadow tree is heard | the window only | media-covers: a video inside a shadow tree... |
| Y27 | every held video no cover holds any more gets its sound back, wherever it is | only one out of the page | media-covers: a video the page moves out of a covered card... |
| Y28 | a reloaded add-on gives a held video its own sound back | leave the old mute | reload: a video the earlier copy held gets its own sound back |
| Y29 | a Short's own covers stay inside it; the item is never covered whole | climb past it | youtube-shorts: a picture about GTA elsewhere in the Short... |
| Y30 | a box that carries the player's cover keeps it | check it again | youtube-shorts: a GTA Short: its player and its title line... |
| Y31 | the player cover goes on a box that can carry one | any box | youtube-shorts: a player box that cannot carry a cover... |
| Y32 | a Short being checked is not counted as a find | count it | youtube-shorts: a Short whose caption is the very same... |
| Y33 | a Short covered as about GTA is counted | not counted | youtube-shorts: "Not about GTA" on a covered Short... (the badge) |
| Y34 | a new player box takes the cover; the old one is let go | keep the old one | youtube-shorts: when the site puts in a new player box... (the badge) |
| Y35 | a change inside a player cover is left to the players pass | recheck it like a box | youtube-shorts: a GTA Short: ... (the player's insides change) |
| Y36 | a play under the whole-page cover is held too | only under box covers | youtube-shorts: the whole-page cover pauses and mutes... |
| Y37 | Show anyway's button: the sound back, it stays paused | let the page play it | youtube-shorts: the whole-page cover pauses and mutes... |
| Y38 | "Not about GTA": the sound back, it stays paused | let the page play it | youtube-shorts: "Not about GTA" on a covered Short... |
| Y39 | the switch off: the sound back, it stays paused | let the page play it | youtube-shorts: the switch off on a covered Short... |
| Y40 | a Short covered for a word said not about GTA is shown at once | wait for a change | youtube-shorts: "Not about GTA" on a covered Short... |
| Y41 | a GTA title left behind makes the next address wait for its own | take it as the new one | youtube-shorts: leaving a GTA Short in place... |
| Y42 | Show anyway keeps the title it was pressed on | forget it | page-cover-rules: Show anyway is for this visit... |
| Y43 | a page kept free of the whole-page cover closes one that was open | leave it open | youtube-shorts: a page covered whole that moves in place to a Short... |
| Y44 | a page kept free of the whole-page cover forgets Show anyway elsewhere | keep it | page-cover-rules: a page with no whole-page cover forgets Show anyway |
| Y45 | a GTA title shown with no cover is remembered | forget it | youtube-shorts: leaving a GTA Short in place... |
| Y46 | a Short being checked says so | the usual note | youtube-shorts: a Short whose caption is the very same... (the note's words) |

Why these tests are enough: each rule has at least one test that fails when that rule alone is
broken, and the macro ones run in the real Firefox with the real extension on a page that
behaves the way YouTube was measured to behave. The control journey shows the stand-in's video
really plays with its sound when nothing stops it, so "paused" and "muted" are the extension's.

Not covered by any break: rule 9 of `docs/review-step6.md` (no more sound flicker on a recheck)
is held by the code's shape, not by a test that counts volume events.

Also checked by hand on live YouTube (a throwaway headless Firefox, 2026-11-19): a GTA Short
covered and silent from the first sample when scrolled into; Shorts not about GTA "Checking"
then playing once their caption came; the logo from a GTA Short shows the card ~0.2 s, then
Home; the GTA title line reads "Hidden (GTA): gta*" with Subscribe usable.

## Round 2 (after the second review): 65 breaks, 63 red, 2 green by design

The whole list again (P15, P34, P41, Y01 to Y46, Z01 to Z18) on the round 2 code. Y09 left the
list: its rule ("a GTA Short's cover keeps its word while the next one is checked") was turned
round by the user (Z02). Y11, Y16, Y26, P15 and Z15 point at their lines as they are now.

What the run found, and what was done:

- **Y37 and Y39 green**: the release reason gave "the person lifted it" priority over
  "decided", which only matters for a video just decided; the rule is now "decided, or else the
  caller's reason", and both turn red (Show anyway's button, the switch).
- **Z09 green twice**: the early-load journey could not fail. First the add-on started after
  the stand-in's one mid-load source change (it now changes it every 100 ms, and the journey
  checks a cover existed before the page loaded, or says the run proves nothing); then the
  journey waited for "covered" and the 4 s decision brought the cover back (it now checks every
  100 ms for 1.5 s). Red now.
- **A defense removed**: "do not clean a page that was still loading" and "draw a player cover
  the page lost again" closed the same hole and hid each other; the second, more general, stays.
- **Green by design**:
  - Y35, "a change inside a player cover is left to the players pass": since Z09 a player cover
    lost to a recheck is drawn again in the same pass, so the rule only saves work. Kept for
    that; no page can see the difference.
  - Y38, "Not about GTA: sound back, stays paused": "Not about GTA" spends the wish to play
    first (Z04, Z05, both red), so the release reason after it cannot be seen either.
- Not breakable from a page at all: one set of shadow-tree listeners per tree, and a stopped run
  handing its listeners on (they are idle either way). Held by the code's shape.

| # | Rule | Break | Turned red (one of the tests) |
|---|---|---|---|
| Z01 | an empty caption sets no time to look again (no polling) | wake anyway | sites-rules: an empty caption gives no time to wake at |
| Z02 | right after a GTA Short the next one says "Checking", not the last word | keep the last word | youtube-shorts: from a GTA Short to one not about GTA... (checking in the gap) |
| Z03 | a new video on an item with no memory does not trust the caption there | trust it | sites-rules: a new video on a Short the add-on had no memory of |
| Z04 | "not about GTA" while covered spends the wish to play | keep it | media-rules: the person saying "not about GTA" while it is still covered |
| Z05 | "Not about GTA" spends the wish of what its covers and a checked player hold | do not | youtube-shorts: "Not about GTA" while the next Short is being checked |
| Z06 | the title row tells a new Short apart, not the whole caption | the whole caption | youtube-shorts: the caption's rows coming apart |
| Z07 | no caption at all reads as nothing, which never decides | read the whole Short | youtube-shorts: a Short with no caption at all stays "Checking" |
| Z08 | only a replaced source ("emptied") is the next Short | any source | youtube-shorts: a video that gets its first source late |
| Z09 | a player cover the page lost is drawn again | trust the map | youtube-shorts: a page still loading when the add-on starts |
| Z10 | a held video the page unmutes under a cover is muted again | let it be | youtube-shorts: a GTA Short after a GTA Short stays covered all along |
| Z11 | a page that keeps unmuting is let be after five tries a second | fight for ever | youtube-shorts: a page that keeps turning the sound back on |
| Z12 | a caption line inside a Short shows the stripes only | its words too | youtube-shorts: a GTA Short: its player and its title line are covered... |
| Z13 | a cover drawn again keeps its size and layers | measure it again | youtube-shorts: into a GTA Short from one not about GTA (layers) |
| Z14 | a player shown again has what is under it read | never read | youtube-shorts: text that came into the player while it was covered |
| Z15 | a hold that ends for any other reason never plays | play it | media-covers: a video the page moves out of a covered card... stays paused |
| Z16 | a card read again and found clean lets its video play on | it stays paused | media-covers: a covered card read again and found not about GTA |
| Z17 | a Short's player decided clean lets the page's play through | it stays paused | youtube-shorts: from a GTA Short to one not about GTA... plays on its own |
| Z18 | the whole-page cover closing never plays what it held | play it | youtube-shorts: a page covered whole that moves in place to a page not about GTA |
