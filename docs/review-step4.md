# Step 4 review findings (2026-11-18)

Five blind reviews (security, correctness, code design, test quality, wording) of the frozen
step 4 code. Every finding was checked against the code; the ones that depended on Firefox were
checked in the test Firefox. Status: open until each is fixed test-first.

## Checked in Firefox (2026-11-18, Firefox 160)

- An add-on removed or reloaded leaves the whole-page cover and the "Hidden page" title behind
  (its button dead). The new copy DOES run in the open tab, but did not clean the old cover.
- After removal no code of the old copy runs at all: neither a port's onDisconnect nor a timer.
  Only the next copy can clean up.
- An event page idle for about 30 s is unloaded, and a content script's port then disconnects
  with the add-on still alive: a disconnect alone does not mean "removed".
- Back to a page from the back-forward cache: the page is still covered, the badge is blank.
- A click on a switch's knob toggles it twice (no change); a click on the label works.
- Without `activeTab` the background still sees every web tab's address (content-script
  matches count as host permissions in Firefox MV3): `activeTab` adds nothing.

## The user's decisions on them (2026-11-18)

- Leftovers after a removal: the next copy cleans up (reload, update, turned back on); after a
  removal for good, a page reload clears it. The cover stays pinned against sites.
- Reports keep the full address (the part after "?" too): the settings table shows exactly
  what Copy all copies.
- The word list is stored as what was added and removed: a built-in word added in a later
  version reaches the list unless the person removed it.
- A page with no site address (a local file) is covered like any page and follows Everywhere;
  the menu lists its covers and says only Everywhere turns it off.

## Real, to fix

Settings model (lib/settings.js):
1. Undo restores a stale copy of the whole list or report array (menu and settings page):
   Remove A, Remove B, Undo A brings B back. Fix: inverse operations (restoreWord,
   restoreReport) in settings.js, micro-tested; pages keep only the removed item.
2. The word list is stored whole, and "own" means "not in this version's built-in list": a
   future built-in word never reaches an edited list, a dropped one turns into "own". Fix:
   store what was added and removed, derive the list (decision for the user).
3. Typing a built-in word back into a full list makes 201 words.
4. A word made only of invisible characters is added as an empty own word.
5. "Already in the list." does not say which entry it repeats.
6. Reports (browsing history) reach every content script with the settings. Fix: separate
   storage keys for the switch, the words and the reports.

On or off (one rule in three places):
7. A page with no site address (a local file) is covered, but the menu says nothing is
   covered there and lists nothing. Fix: one pure decision used by the content script, the
   background and the menu.

Page side (lib/page.js, content.js):
8. "Not about GTA" lives in one run: lost on any restart (a word list change, the switch off
   and on), and kept across in-place navigation on a single-page site. Fix: keyed by the
   address, carried across restarts like Show anyway.
9. Undo of any "Not about GTA" cancels a Show anyway the person pressed: the state does not
   record why the page was shown.
10. A page can fire fake pagehide events: each one sends a message, and the background's
    queue backs up, so new pages in every tab wait to start covering. Fix: trusted events
    only, a rate cap per frame, no write when nothing changed, and covering must not wait on
    the background without a time limit.
11. A settings change made while a page starts is missed (the listener is added after the
    read).
12. Covering now waits for two round trips before it starts (step 3 started at once).
13. The page restored from the back-forward cache sends nothing: the badge and the menu show
    the page left behind.
14. `label` has an unsafe default (the word itself): a caller that forgets it leaks own words.
15. Own words named like Object.prototype members ("constructor") are dropped from counts.
16. Own words longer than 80 characters as written are dropped from counts.
17. Leftovers of an earlier copy (the whole-page cover, cover attributes, stashed titles, the
    shadow stylesheet) are not cleaned by the next copy.

Background (lib/tabs.js, background.js):
18. The 64-frame cap fills with frames that have no covers or are gone.
19. A frame can be told the previous page's site, and the top frame's hello wipes counts that
    came before it.
20. Frames that are off resend "no covers" on every settings change; the background writes
    and repaints for each.
21. The background's rules (refusing tab-covers from a page, the site fallback) sit in
    browser-only code with no test. Fix: a pure handler in tabs.js.

Menu and settings page:
22. The knob click toggles twice (see above).
23. Two quick "Not about GTA" clicks mix up the reports and their Undo.
24. The rows-stay-in-place rule lives only in menu.js. Fix: in menu-view.js, micro-tested.
25. The settings page keeps messages that an outside change made untrue ("reddit.com will be
    covered again once Everywhere is on" after Everywhere is on), and may drop the focus when
    its own save comes back as a change.
26. No empty state for an empty word list.
27. The icon's tooltip never says the state (the preview named it "GTA Blocker, off", "...,
    5 covered").
28. "Turn on" buttons do not name their site for screen readers.

Docs and permissions:
29. CLAUDE.md says the reload cleanup and chooseBox's reason are done: neither is. The
    reason goes back to the open items for step 6.
30. `activeTab` adds nothing (checked above): remove it, and correct the security pass.
31. The manifest description promises dog and cat photos (step 5).
32. CHANGELOG wording: Reset also removes your words; "Undo takes it back" is unclear; the
    missed-GTA sentence reads as if it saves on its own; "the icon's menu" vs "the toolbar
    menu".
33. CLAUDE.md says the switch is keyed by location.hostname; it is the tab's site without www.

Tests:
34. The embedded-player journey can pass with Everywhere off; check other.test stays covered,
    and the frame uncovers live.
35. The whole-page cover journey's title check and Show anyway check are weak.
36. No test of "Not about GTA" across frames or on the whole-page cover.
37. The menu's Settings button is never pressed.
38. openMenu waits for the static title, not for the menu to draw.
39. "Off is a real stop" is not checked for content added after off, nor for every attribute.
40. Settings page checks read before the async save; tests depend on each other; one report
    removed among two identical ones.
41. The own-word privacy check looks at one attribute only.
42. Micro gaps: the frame cap exactly, the 200 ms throttle, pagehide, read() of a built-in
    list, the 200-word and site caps, systemAccess off by default.
43. "Stays off after Firefox closes" is not proven (a temporary add-on cannot be restarted).

## Dropped, and why

- Red at rest on remove buttons: the user chose red on hover (Iris, round 6).
- "The 1 report goes for good" and similar: approved in the preview.
- Reordering the settings page: the user picked "one under the other".
- A port's disconnect as the cleanup signal: it fires on every idle unload (checked above).

## Status after the fixes (2026-11-18)

Every fix came with a test seen failing first: the micro tests on the old code, and the new
Firefox journeys (`toolbar-edges`, `reload`) on the frozen copy the reviewers had
(`GTAB_EXTENSION_DIR`), where the five bug journeys were red.

- Fixed, with their tests: 1 (`restoreWord`, `restoreReport`: settings-rules, settings-page),
  2 (added/removed, `withDefaults`: settings-rules), 3, 4, 5 (settings-rules, settings-page),
  6 (three keys; content-script "reads only the switch and the words"), 7 (`coverState`:
  settings-rules, content-script, menu-view), 8 (`cover.dismiss`: page-cover-rules,
  content-script), 9 (`showAnyway` cause, `undoShow`: page-cover-rules, toolbar-edges),
  10 (trusted events, 1 s cap, no-op writes: content-script, tabs-rules), 11, 12 (Promise.all,
  listener first: content-script), 13 (pageshow: content-script, toolbar-edges), 14 (label
  required), 15 (`countEntries`: page-cover-rules), 16 (200 characters: tabs-rules),
  17 (`cleanLeftovers`: reload), 18 (tabs-rules), 20 (content-script), 21 (`tabs.handle`:
  tabs-rules), 22 (toolbar-edges), 23 (menu.js: a row acts once), 24 (`menuView.keep`:
  menu-view), 25 (settings page: own writes skipped, outside changes clear messages:
  settings-page), 26 (menu-view, settings page), 27 (`paintFor` title: tabs-rules), 28
  (settings-page), 30 (extension-rules pins `storage` only), 31, 32, 33 (docs), 34, 35, 36,
  37, 38, 39, 40, 41, 42 (the journeys and micro tests named in each).
- Partly: 19, a frame told the previous page's site: the top frame now says hello at once,
  before its settings are read, which closes the usual case; a top frame stalled on purpose
  can still lose the race (low).
- Moved to step 6: 29's chooseBox reason, and a report carrying the frame's own host.
- Not provable here: 43 (a temporary add-on cannot outlive a Firefox restart); said in
  CLAUDE.md.
- A test-only finding while fixing: Escape pressed in the same burst of keys as a click lets
  Firefox close the menu before the menu handled the click. The journeys press it on its own.
