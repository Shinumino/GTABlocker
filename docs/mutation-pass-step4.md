# Mutation pass, step 4 (2026-11-18)

Each rule of the toolbar menu, the settings page, the background and the new page-side rules
was broken on purpose, one at a time, in a throwaway copy of the project, and the tests that
should catch it were run with plain `node --test` (the macro ones in the installed Firefox,
headless). Rerun with `node tools/mutation-pass.mjs` (it runs every step's list).

**Result for the whole run, steps 1 to 4: 197 breaks, 190 turned a test red, 7 stayed green by
design** (M58, S18, P37 from earlier steps; Q30, Q31, Q41, Q42 below). An unbroken copy was
green first. The first run found four more that were not red, each fixed and then seen red:

- M55 (a permission not agreed) added a second `"permissions"` key, which JSON reading drops:
  the break did nothing. It now adds "tabs" inside the real list.
- S33 (the load order) no longer matched the manifest's lines; it follows them now.
- P29 (Show anyway remembered): the break put "Hidden page" back and stopped covering with an
  error, and the test only looked for the cover. It now checks the tab title and that later
  content is still covered.
- P36 (not "ready" while the page is read): covering now starts after the settings are read,
  when a short page has long finished loading. A new fixture is sent in two parts a second
  apart (`*.slow.html`, `tests/support/fixtures.mjs`), and records the covers when the page is
  marked ready.

Earlier breaks whose code moved in step 4 were pointed at it: M56 and S31 (content.js marks the
page through `mark`), P28 and P31 (the whole-page decisions are `cover.pageStep` now), P36.

| # | Rule | Break | Turned red (one of the tests) |
|---|---|---|---|
| Q01 | a local file is covered | treat it as off | a page with no site address (a local file) is covered, and follows Everywhere |
| Q02 | "On this site" turns its site off | ignore the sites turned off | "On this site" off: every cover goes, the page works again... |
| Q03 | "Everywhere" off turns every site off | ignore Everywhere | "Everywhere" off: no site is covered and the site row is hidden... |
| Q04 | a built-in word dropped later is forgotten, never "own" | keep any removed word | stored settings are read defensively... |
| Q05 | a repeat names the entry it repeats | "Already in the list." only | a refused word says why... (settings page) |
| Q06 | a word of invisible characters only is blank | trim only | a blank word, or one made only of invisible characters, is refused |
| Q07 | a full list refuses a built-in word typed back | no check | a full list refuses one more word, a built-in one typed back in too |
| Q08 | a built-in word typed back in is built-in again | never recognise it | a built-in word typed back in is built-in again... |
| Q09 | Undo puts a word back where it was | always first | Undo of a removal puts back only that word, where it was |
| Q10 | Undo of a report never makes a copy | put it back even if there | one report removed...; Undo puts back only that report |
| Q11 | a report drops the #part | keep it | reports: newest first, the last 50 kept, the full address without its #part |
| Q12 | the last 50 reports are kept | 500 | stored lists are capped: 200 own words, 1000 sites, 50 reports |
| Q13 | a page never reads the reports | read them too | a page reads only the switch and the words, never the reports |
| Q14 | a frame with no covers takes no slot | store it | what a page reports is capped... |
| Q15 | a report that changes nothing writes nothing | always a new state | a frame with no covers takes no slot, and a report that changes nothing writes nothing |
| Q16 | at most 64 frames with covers a tab | 640 | what a page reports is capped... |
| Q17 | a page can never read a tab's covers | answer anyone | the background: a page can never read a tab's covers |
| Q18 | a frame of an unknown tab decides by its own site | no fallback | the background: a page says hello and learns the tab's site |
| Q19 | the icon's tooltip says the state | always the name | the background: a page says hello... (the title) |
| Q20 | a word to show again is checked for length | any length | "Not about GTA" and its Undo from the menu reach the page side; anything else is ignored |
| Q21 | covers are counted without a prototype | a plain object | covers are counted by word, a word named like an object's own property too |
| Q22 | an Undo lifts only the Show anyway its word caused | any word | a Show anyway pressed on the button outlives the Undo of "Not about GTA" on another word |
| Q23 | words shown again end with the address | keep them everywhere | "Not about GTA" belongs to the address |
| Q24 | a new address forgets why the old one was shown | keep the cause | a new address forgets why the old one was shown |
| Q25 | page.start refuses to run without label | run anyway | page.start refuses to run without label, before it touches anything |
| Q26 | the words shown again outlive a restart | drop them | "Not about GTA" outlives a change of the word list on the same page |
| Q27 | an earlier copy's whole-page cover is removed | leave it | a removed and reinstalled add-on leaves no dead whole-page cover |
| Q28 | an earlier copy's cover attributes are cleared | leave them | covers left by an earlier copy are taken over by the next one |
| Q29 | a page restored by Back tells its covers again | say nothing | Back to a page from the back-forward cache shows its own count on the icon again |
| Q30 | off disconnects the page watcher | keep it | **stayed green, by design**: after stop() a flag keeps everything from running; the disconnect only frees memory, which no test can see |
| Q31 | stop removes its click guards | leave them | **stayed green, by design**: a guard acts only on a covered box, and stop() uncovered them all; leaving it is a leak no test can see |
| Q32 | "Not about GTA" lifts that word's whole-page cover | only box covers | "Not about GTA" on the word of a whole-page cover lifts it; Undo brings it back |
| Q33 | Undo covers that word again | do not look again | "Not about GTA" reaches every frame of the tab; its Undo too |
| Q34 | a change made while the page starts is not lost | the stored value wins | a settings change made while the page starts is not lost |
| Q35 | covering never waits more than 1 s for the background | wait forever | a background that does not answer holds covering up for a moment only |
| Q36 | a fake pagehide is ignored | trust it | page events a site can fake are ignored... |
| Q37 | a page restored by Back says hello again | no pageshow | Back to a page from the back-forward cache shows its own count... |
| Q38 | a frame that stays off sends nothing on each change | resend | a frame that stays off sends nothing more when the settings change |
| Q39 | the user's own words never reach the page | show them | a refused word says why...; an open page covers it ... with "a word from your list" |
| Q40 | a click on the knob switches once | pass it on again | a click on the knob of a switch switches it once |
| Q41 | a row acts once | act again | **stayed green, by design**: the row is redrawn as its Undo before a second click can land on it; the guard is a second lock |
| Q42 | only the stores that changed are written | write all | **stayed green, by design**: an unchanged store written again changes nothing a page reacts to (they compare what they cover with); it costs a little work |
| Q43 | the page is told before anything is saved | tell it last | "Not about GTA" shows that word's covers on this page and saves a report; Undo takes both back |
| Q44 | the site row is hidden while Everywhere is off | show it | "Everywhere" off: ... the site row is hidden |
| Q45 | Firefox's own pages are never covered | no such pages | Firefox's own pages are never covered, and the menu says so |
| Q46 | a local file says only Everywhere turns it off | no note | a page with no site address (a local file) is covered and listed |
| Q47 | an empty word list is explained | say nothing | an empty word list covers nothing, and the menu says how to fix it |
| Q48 | a cover from your own word offers Remove from my list | Not about GTA | a cover from your own word never shows the word, and "Remove from my list" takes it out |
| Q49 | a row acted on stays, with its Undo | drop it | "Not about GTA" shows that word's covers... Undo takes both back |
| Q50 | a change made in the menu clears messages it made untrue | keep them | a change made in the menu shows in the open settings page at once, and clears a message it made untrue |
| Q51 | the page's own saves do not redraw it | redraw on each | a refused word says why... (the message the redraw wiped) |
| Q52 | a switch change repaints every icon | no repaint | the icon says "off" when covering is turned off, also on a page with nothing covered |
| Q53 | no permission but storage | ask for activeTab again | the manifest asks for no permission beyond the agreed ones |

Three rules got their test during this pass, because no test would have seen them break: Q25
(`tests/micro/page-start.test.mjs`), Q26 and Q52 (`tests/macro/toolbar-edges.test.mjs`).

Not covered by a break, and why:
- What the menu and the settings page look like: checked by eye against the agreed preview
  (`docs/design/menu-preview.html`), not by a test.
- "Stays off after Firefox closes": a temporary add-on cannot outlive a restart.
