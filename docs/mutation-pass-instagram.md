# Mutation pass, Instagram Reels and the later reports (2026-11-19 and 20)

Each rule was broken on purpose, one at a time, in a throwaway copy, and the tests that should
catch it were run: the micro ones in Node, the macro ones in the installed Firefox, headless, on
the stand-ins (`tests/fixtures/www.instagram.com/`: the Reels page, logged out and logged in,
with Instagram's order when scrolling; a single reel's page with "More posts"), with autoplay
allowed so that a paused video can only be the extension's doing. The run covers every
Instagram rule (I), the "Rockstar" change (W), and every earlier rule whose code or test the
Instagram work touched (the Shorts and media rules, Y and Z, and five others). Rerun:
`node tools/mutation-pass.mjs base I01 ...`.

**Result: 105 breaks, 102 turned a test red, 3 green by design.** An unbroken copy was green
first. The full run (after both review rounds) had 101 breaks with 5 green; what was done about
each is below, and W01 to W04 came after it, with the "Rockstar" change.

## What the run found (5 green)

- **I26, "a cover outside a reel's block is not the reel's"**: green because no test could
  tell. Live, a single reel and its "More posts" share the next box up, so the first box around
  a post below with one video in it is above the reel's block; read as the reel's, the person's
  "Not about GTA" for that post counted only for the reel being watched. A new journey scrolls
  the reel out of view and presses "Not about GTA" on the GTA post below: with the break the
  post stays covered. Red now.
- **I28, "a player's own box keeps its note"**: green because the check never fired, so it was
  removed rather than kept unproven. A line's cover never goes on a box that carries one
  (coverFrom), and a player box is only ever one that can carry a cover (playerBox), which a
  covered box cannot: both its pseudo-elements are the cover's. The journey "a picture about GTA
  inside a reel's player box: one cover on the box, with its note" still checks the note.
- **Green by design** (the code stays, and says why):
  - I29, "looking for the reel around a line stops at the main area": only saves work. Climbing
    on, the box holding every video is the whole page, and a line outside every reel is still
    no reel's (I26's check, now red). Stopping at the main area spares querying the whole page
    for every such line.
  - Y35 and Y38: as in the Shorts pass (docs/mutation-pass-step6.md): Y35 only saves work, and
    Y38's reason cannot be seen after "Not about GTA" spends the wish to play first (Z04, Z05).
- Repointed after the code moved (each red): Z12 (the stripes are set in one line now), Q04
  (a removed word the person also has as their own stays in the list).

## "Rockstar" alone (W)

The user's report: a GTA Short said only "Rockstar" and played (only "Rockstar Games" was built
in). The user chose to build in "Rockstar" alone, knowing it also covers Post Malone's song,
the energy drink and "a real rockstar"; those are accepted false hits in the tests. The user
had already added "Rockstar" by hand: an own word that this version builds in now becomes the
built-in one (listed once, its covers name it), as typing a built-in word in already did.

## Every break

| # | Rule | Break | Turned red (one of the tests) |
|---|---|---|---|
| M14 | every .env file is refused | refuse only ".env" itself | check-repo: any .env file is refused, except .env.example |
| Q24 | a new address forgets why the old one was shown | keep the cause | page-cover-rules: a new address forgets why the old one was shown |
| Q26 | the words shown again outlive a restart | drop them | toolbar-edges: "Not about GTA" outlives a change of the word list on the same page |
| Q28 | an earlier copy's cover attributes are cleared | leave them | reload: covers left by an earlier copy are taken over by the next one: the... |
| Y01 | a Shorts page (/shorts too) gets no whole-page cover | give it one | youtube-shorts: a GTA Short: its player and its title line are covered, the video... |
| Y02 | only the site itself gets its rules, not a look-alike | match the end of the name | sites-rules: the mobile site is a site of its own: it keeps the general rules (its... |
| Y03 | the mobile site keeps the general rules | strip "m." too | sites-rules: the mobile site is a site of its own: it keeps the general rules (its... |
| Y04 | a host is read whatever its case, and with a final dot | read it as given | sites-rules: YouTube Shorts get no whole-page cover; every other YouTube page may... |
| Y05 | a new Short's caption is not trusted until it changes | trust it at once | youtube-shorts: from a GTA Short to one not about GTA: covered until its caption is... |
| Y06 | an empty caption never decides while a Short is checked | let it decide | sites-rules: a Short with no caption yet is checked (covered, "Checking for... |
| Y07 | an empty caption never decides once a Short is decided | let it decide | sites-rules: an empty caption is never taken as "not about GTA" (ChatGPT review,... |
| Y08 | a caption that never changes is decided after 4 s | never | youtube-shorts: a Short whose caption is the very same as the last one’s is decided... |
| Y10 | a new video in the Short restarts the check | ignore it | youtube-shorts: into a GTA Short from one not about GTA: covered and silent from the... |
| Y11 | the page looks again when the wait is over | never | youtube-shorts: a Short whose caption is the very same as the last one’s is decided... |
| Y12 | a held video gets its own sound setting back | always sound on | youtube-shorts: a video the page had muted itself stays muted after a GTA Short |
| Y13 | the play the page asked for goes through when the content changed | never | youtube-shorts: from a GTA Short to one not about GTA: covered until its caption is... |
| Y14 | a cover the person lifts leaves the video paused | play it too | youtube-shorts: the switch off on a covered Short gives its sound back and leaves it... |
| Y15 | never a video taken out of the page | play it too | media-rules: never played: a video taken out of the page, one already playing, or... |
| Y16 | a play while no cover holds it spends the wish | keep it | media-rules: played while no cover holds it: the old wish to play is spent |
| Y17 | a cover on a playing video remembers it was playing | forget it | media-rules: a cover on a playing video pauses and mutes it, keeps its own sound... |
| Y18 | a second cover keeps the first sound setting | take the mute as its own | media-rules: a second cover keeps the first sound setting (by then it is the... |
| Y19 | the whole-page cover follows the site's rule | ignore it | youtube-shorts: a GTA Short: its player and its title line are covered, the video... |
| Y20 | a covered box holds its media | leave them | media-covers: a video inside a shadow tree, in a covered card, is paused and muted,... |
| Y21 | a play under a cover is paused and muted again | let it play | media-covers: a video inside a shadow tree, in a covered card, is paused and muted,... |
| Y22 | only a real play counts | a made-up one too | youtube-shorts: a made-up "play" from the page is not a wish to play: the Short stays... |
| Y23 | a new video source is the first sign of the next Short | not listened to | youtube-shorts: into a GTA Short from one not about GTA: covered and silent from the... |
| Y25 | media inside shadow trees is found | light DOM only | media-covers: a video inside a shadow tree, in a covered card, is paused and muted,... |
| Y26 | a play inside a shadow tree is heard | the window only | media-covers: a video inside a shadow tree, in a covered card, is paused and muted,... |
| Y27 | every held video no cover holds any more gets its sound back, wherever it is | only one out of the page | media-covers: a video the page moves out of a covered card gets its own sound back,... |
| Y28 | a reloaded add-on gives a held video its own sound back | leave the old mute | reload: a video the earlier copy held gets its own sound back: the next Short... |
| Y29 | a Short's own covers stay inside it; the item is never covered whole | climb past it | youtube-shorts: a picture about GTA elsewhere in the Short is covered on its own; the... |
| Y30 | a box that carries the player's cover keeps it | check it again | instagram-reels: a page that brings each reel’s caption before its video (as live): the... |
| Y31 | the player cover goes on a box that can carry one | any box | youtube-shorts: a player box that cannot carry a cover: the cover goes on the box... |
| Y32 | a Short being checked is not counted as a find | count it | youtube-shorts: a Short whose caption is the very same as the last one’s is decided... |
| Y33 | a Short covered as about GTA is counted | not counted | youtube-shorts: "Not about GTA" on a covered Short shows it again with its sound, but... |
| Y34 | a new player box takes the cover; the old one is let go | keep the old one | youtube-shorts: when the site puts in a new player box, the cover follows it, and the... |
| Y35 | a change inside a player cover is left to the players pass | recheck it like a box | green by design (above) |
| Y36 | a play under the whole-page cover is held too | only under box covers | youtube-shorts: the whole-page cover pauses and mutes the page’s video too; Show... |
| Y37 | Show anyway's button: the sound back, it stays paused | let the page play it | youtube-shorts: the whole-page cover pauses and mutes the page’s video too; Show... |
| Y38 | "Not about GTA": the sound back, it stays paused | let the page play it | green by design (above) |
| Y39 | the switch off: the sound back, it stays paused | let the page play it | youtube-shorts: the switch off on a covered Short gives its sound back and leaves it... |
| Y40 | a Short covered for a word said not about GTA is shown at once | wait for a change | instagram-reels: a reel the person showed, then given another reel’s video: the new one... |
| Y41 | a GTA title left behind makes the next address wait for its own | take it as the new one | youtube-shorts: leaving a GTA Short in place for a page not about GTA leaves no... |
| Y42 | Show anyway keeps the title it was pressed on | forget it | page-cover-rules: Show anyway is for this visit: the same address stays shown, another... |
| Y43 | a page kept free of the whole-page cover closes one that was open | leave it open | youtube-shorts: a page covered whole that moves in place to a Short loses its... |
| Y44 | a page kept free of the whole-page cover forgets Show anyway elsewhere | keep it | page-cover-rules: a page with no whole-page cover forgets Show anyway, like any other... |
| Y45 | a GTA title shown with no cover is remembered | forget it | youtube-shorts: leaving a GTA Short in place for a page not about GTA leaves no... |
| Y46 | a Short being checked says so | the usual note | youtube-shorts: a Short whose caption is the very same as the last one’s is decided... |
| Z01 | an empty caption sets no time to look again (no polling) | wake anyway | sites-rules: an empty caption gives no time to wake at: only the caption coming can... |
| Z02 | right after a GTA Short the next one says "Checking", not the last word | keep the last word | youtube-shorts: from a GTA Short to one not about GTA: covered until its caption is... |
| Z03 | a new video on an item with no memory does not trust the caption there | trust it | sites-rules: a new video on a Short the add-on had no memory of does not trust the... |
| Z04 | "not about GTA" while covered spends the wish to play | keep it | youtube-shorts: "Not about GTA" on a covered Short shows it again with its sound, but... |
| Z05 | "Not about GTA" spends the wish of what its covers and a checked player hold | do not | youtube-shorts: "Not about GTA" on a covered Short shows it again with its sound, but... |
| Z06 | the title row tells a new Short apart, not the whole caption | the whole caption | youtube-shorts: the caption’s rows coming apart: a changed channel line alone does not... |
| Z07 | no caption at all reads as nothing, which never decides | read the whole Short | youtube-shorts: a Short with no caption at all stays "Checking": nothing to decide on... |
| Z08 | only a replaced source ("emptied") is the next Short, not a first one | any source | youtube-shorts: a video that gets its first source late is not a new Short: no 4 s... |
| Z09 | a player cover the page lost is drawn again | trust the map | youtube-shorts: a page still loading when the add-on starts: the Short it covered then... |
| Z10 | a held video the page unmutes under a cover is muted again | let it be | youtube-shorts: from a GTA Short to one not about GTA: covered until its caption is... |
| Z11 | a page that keeps unmuting is let be after five tries a second | fight for ever | youtube-shorts: a page that keeps turning the sound back on under the cover is let be... |
| Z12 | a line inside a Short or a reel shows the stripes only | its words too | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| Z13 | a cover drawn again keeps its size and layers | measure it again | youtube-shorts: into a GTA Short from one not about GTA: covered and silent from the... |
| Z14 | a player shown again has what is under it read | never read | youtube-shorts: text that came into the player while it was covered is read once the... |
| Z15 | a hold that ends for any other reason ("lost") never plays | play it | media-covers: a video the page moves out of a covered card gets its own sound back,... |
| Z16 | a card read again and found clean lets its video play on | it stays paused | media-covers: a covered card read again and found not about GTA: its video plays on,... |
| Z17 | a Short's player decided clean lets the page's play through | it stays paused | youtube-shorts: from a GTA Short to one not about GTA: covered until its caption is... |
| Z18 | the whole-page cover closing never plays what it held | play it | youtube-shorts: a page covered whole that moves in place to a Short loses its... |
| I01 | the Reels page and a single reel get the player | no player | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| I02 | every other Instagram page keeps the general rules | the player everywhere | sites-rules: Instagram: every other page keeps the general rules (feed, Explore,... |
| I03 | reel codes have "_" and "-" too | letters and digits only | instagram-reels: "Not about GTA" counts for the reel being watched only: the others... |
| I04 | a reel under a name (/<name>/reel/<code>/) gets the player | no name | sites-rules: Instagram: the Reels page and a single reel get a player found from... |
| I05 | a link's post is read anywhere in its path (also under a name) | from the start only | sites-rules: Instagram: a link’s post is its code, from /p/<code> or /reel/<code>,... |
| I06 | a reel's block links to one POST at most (its comments' links are its own) | count links | instagram-reels: a single reel about GTA: its video covered, paused and muted; its... |
| I07 | a reel's block holds no other video | ignore other videos | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| I08 | a reel's block links to one post at most | ignore posts | instagram-reels: a single reel not about GTA, with a GTA post below it: the reel plays... |
| I09 | the reel's cover goes on the highest box with no words | the first that can carry one | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| I10 | with words on the video, the first box that can carry a cover | none | instagram-reels: a label with words on the video itself: the cover still goes on the... |
| I11 | with no box it can take, the whole reel is covered | nothing | instagram-reels: a reel block holding a second video: the reel’s video is still... |
| I12 | a box still used by a player is never let go | let it go | instagram-reels: the site puts a new video element in a covered reel: the cover stays,... |
| I13 | a reel is not checked again on a new address (key item) | on every address | instagram-reels: through a GTA reel to the next one and back |
| I14 | a Short is checked again on a new address (key address) | only on a new source | youtube-shorts: on YouTube a new address alone starts a check: covered from the... |
| I15 | a new source in a reel starts its check again | ignore it | instagram-reels: a new source in the same reel: checked again until its caption... |
| I16 | a reel's words outside its player box tell a new reel apart | all its words | instagram-reels: a new source in the same reel: checked again until its caption... |
| I17 | a reel is read from its whole block | its player box only | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| I18 | "Not about GTA" inside a reel counts for that reel, not the address | the address | instagram-reels: a reel the person showed, then given another reel’s video: the new one... |
| I19 | "Not about GTA" shows the covers in the reel being watched only | every cover of the word | instagram-reels: "Not about GTA" counts for the reel being watched only: the others... |
| I20 | the reel being watched is the one most shown | the first | instagram-reels: "Not about GTA" counts for the reel being watched only: the others... |
| I21 | Undo covers the watched reel again | it stays shown | instagram-reels: "Not about GTA" shows the reel being watched again, with its sound,... |
| I22 | a reel shown by the person stays shown over a restart | forget it | instagram-reels: "Not about GTA" on a reel outlives a change of the word list (the... |
| I23 | off a Reels page, a reel still on the page keeps its cover | let it go | instagram-reels: moving in place off the Reels page with the GTA reel still on it: its... |
| I24 | the player follows the address, asked on every pass | the first address only | instagram-reels: moving in place onto the Reels page (no reload): its reels are read... |
| I25 | a reel's block never reaches the main area or the body | climb on | instagram-reels: one reel on the page, with words about GTA in the header next to it:... |
| I26 | a cover outside a reel's block is not the reel's | any element near the video | instagram-reels: a single reel scrolled out of view: "Not about GTA" on the GTA post... (new) |
| I27 | words never drawn (SVG titles) are not words around the video | count them | instagram-reels: a GTA reel (logged out): its video, controls and the faint copy around... |
| I29 | looking for the reel around a line stops at the main area | climb on | green by design (above) |
| I30 | a new source in a reel forgets the person's word for the reel before | keep it | instagram-reels: a reel the person showed, then given another reel’s video: the new one... |
| I31 | a reel's video no pass has read is read at its first play | wait for the flush | instagram-reels: a page that brings each reel’s caption before its video (as live): the... |
| I32 | a player box that took words with it is read whole | only outside it | instagram-reels: no box between a reel’s video and its row can carry a cover: the row... |
| I33 | off a Reels page, a reel with no cover is let go | keep it | instagram-reels: off the Reels page in place: a reel not about GTA is let go (the... |
| I34 | off a Reels page, a reel whose word the person showed is let go | keep it | instagram-reels: off the Reels page in place: "Not about GTA" shows a GTA reel kept... |
| I35 | a reel's block is read once more when its video first comes | never | instagram-reels: a reel added with its caption before its video, after "Not about GTA"... |
| Q04 | a built-in word dropped later is forgotten, never "own" | keep any removed word | settings-rules: stored settings are read defensively: a wrong field falls back to its... |
| W01 | "rockstar" alone is a built-in word | drop it | matcher: the default list is the one agreed on 2026-11-18 (with "rockstar"... |
| W02 | "rockstar games" comes before "rockstar" | put "rockstar" first | matcher: the default list is the one agreed on 2026-11-18 (with "rockstar"... |
| W03 | an own word this version has built in becomes the built-in one | keep it as their own | settings-rules: an own word that a later version builds in becomes the built-in one:... |
| W04 | such a word stays in the list even where it is stored as removed | keep it removed | settings-rules: an own word that a later version builds in becomes the built-in one:... |

## 0.1.2: "jason" and "lucia" alone, the version in the menu, and the review fixes

Run after the 0.1.2 reviews (docs/review-0.1.2.md), on every matching rule (S), every settings
and menu rule (Q) and every rule from the later reports (W), with the baseline: **117 breaks,
111 red, 6 green**; after W15 below, **112 red, 5 green by design.** An unbroken copy was green
first.

- Five are older and green by design, as their own records say: S18 (docs/mutation-pass-step2.md),
  Q30, Q31, Q41 and Q42 (docs/mutation-pass-step4.md). Nothing about them changed.
- **W15, "the stored words are read only after an update, never at a first install"**: green,
  because only a micro test with a fake browser ran it, and the fake saw no difference. The
  check was removed as unproven, and the next three full runs of the journeys failed (38, 51
  and 44 journeys: whole files where the add-on never covered the page). Put back, they were
  all green. Reading storage in the background at a first install breaks the add-on's first
  pages in Firefox. The check stays, pinned by a micro test ("a first install does not even
  read the stored words") and by the add-on-loads journey; red now. The lesson: a break whose
  only tests use a fake browser can only show what the fake models. A new journey also proves
  that an update (this version installed over an older one with the user's own words) covers
  pages and saves the words (W14 red through it).
- S08, S25 and Q08 point at the lines as they are now (find() reads both ways; compile takes a
  limit; builtInFor and the list share one path). Each is red.

| # | Rule | Break | Turned red (one of the tests) |
|---|---|---|---|
| W05 | "jason" and "lucia" alone are built-in words | drop them | matcher: the default list is the one agreed on 2026-11-18 (with "rockstar",... |
| W06 | the pairs come before the single names | put the names first | matcher: the default list is the one agreed on 2026-11-18 (with "rockstar",... |
| W07 | the menu shows the add-on's version | show nothing | toolbar-edges: the menu shows the add-on's version, small, at the bottom-right on the... |
| W08 | the version sits at the right end of the buttons' row | right after the buttons | toolbar-edges: the menu shows the add-on's version, small, at the bottom-right on the... |
| W09 | the version is smaller than the buttons | the buttons' size | toolbar-edges: the menu shows the add-on's version, small, at the bottom-right on the... |
| W10 | the version is grey | the text colour | toolbar-edges: the menu shows the add-on's version, small, at the bottom-right on the... |
| W11 | read both ways, the match that starts earlier wins | the camel-case reading first | matcher: matches rockstar games: "RockStar Games: Jason trailer" |
| W12 | at the same start in both readings, the earlier entry wins | the later one | matcher: matches jason and lucia: "Jason aNd Lucia" |
| W13 | the page uses every word in the stored list | only the first 200 | content-script: a full list of own words still uses every built-in word, a later... |
| W14 | after an update the background saves the words as read | never | settings-page: updated from an earlier version that kept "Rockstar", "jason", "Lucia"... |
| W15 | the stored words are read only after an update, never at a first install | on any install | background: a first install does not even read the stored words; extension-loads: the extension runs on a YouTube page |
| W16 | nothing to fold is not written | write it anyway | background: an update with nothing to change, or a first install, writes nothing |
| W17 | an own word that repeats an earlier own word goes | keep it | settings-rules: an own word that repeats another own word is listed once, the first... |
| W18 | only an own word is ever a repeat | a built-in one too | settings-rules: a built-in list that repeats a word of its own still lets the person... |
| W19 | Undo brings nothing back when the word is back in another spelling | bring it back | settings-rules: Undo of a removed own word does nothing when the word is back in... |
| W20 | the Reset question puts each word in quotes | no quotes | settings-page: Reset asks first and names what goes; Escape keeps the list, "Reset... |
| W21 | the manifest's version is the changelog's newest | leave it behind | extension-rules: the version in the manifest is the newest one in the changelog |
| Q04 | a built-in word dropped later is forgotten, never "own" | keep any removed word | settings-rules: stored settings are read defensively: a wrong field falls back to its... |
| Q08 | a built-in word typed back in is built-in again | never recognise it | settings-rules: a built-in word typed back in is built-in again, in its own place and... |
| S08 | case never matters (gTA 6, YouTube) | read only the split text | matcher: matches gta*: "gTA 6" |
| S25 | repeats and refused entries take no place | count them against the cap | matcher: the list holds 200 entries; repeats and refused entries do not take a... |
