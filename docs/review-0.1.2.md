# Review findings, 0.1.2: "Rockstar", "jason" and "lucia" alone, and the version in the menu (2026-11-19)

The user's reports after 0.1.0 and 0.1.1: a GTA Short said only "Rockstar" and played; a GTA
post named Jason or Lucia without the pair. The user added the words to their own list, then
chose to build them in, knowing the false hits. The user also asked for the add-on's version in
a corner of the toolbar menu (picked: bottom-right, on the row of its buttons).

The "Rockstar" change and the rule that turns an own word into the built-in one went into the
signed 0.1.1 after that version's Instagram reviews, so they had no review of their own. This
round reviews them with 0.1.2. Five blind reviewers (security, correctness, design, test
quality, wording), each with the agreed spec and a frozen copy of the code (a detached git
worktree). Every finding was checked against the code; the claims about what matches were run
in Node. Sources: S security, C correctness, D design, T tests, W wording.

## Told to the user, decided

- A built-in name reaches further than a line (S): a page title with "Jason" or "Lúcia" brings
  the whole-page card (an email from a Jason, a Gmail inbox for lucia.santos@..., a chat with
  Ana Lúcia), an account named "lucia_br" commenting under a reel covers it, and "jason92"
  matches. The user kept the names built in: "they can always remove the word ... better to
  protect them from possible spoilers". The README's limits now say so, and how to remove a
  word; the security entries in CLAUDE.md name the reach and its caps.

## Real, fixed test-first

| # | Finding | From | Fix | Proven by |
|---|---|---|---|---|
| 1 | With mixed capitals, the camel-case reading was read first, so a later name won over an earlier GTA word: "RockStar Games: Jason trailer" was named "jason", and "Not about GTA" on that row would show a real GTA line | C | both readings are read; the match that starts earlier (counted in letters) wins, then the earlier entry | matcher cases "RockStar Games: Jason trailer", "gTA 6 with Jason", "JaSon and Lucia", "Jason aNd Lucia" |
| 2 | The matcher's own cap of 200 dropped the newest built-in words on a full list (186 own + 17 built-in: "jason", "lucia" and a pair never matched) | C S | the page compiles every stored word; the cap stays on adding | content-script "a full list of own words still uses every built-in word" |
| 3 | The own word turned built-in was only read so, never saved: what a later version did with it depended on whether the person had edited the list | D C S | the background saves the words as read, once, after an update (never at a first install: read then, the add-on stopped covering pages in Firefox, see the mutation pass, W15) | background "after an update...", "a first install does not even read the stored words"; settings-page "updated from an earlier version that kept ... own words" (the real update in Firefox) |
| 4 | Undo after removing an own word and typing it again in other capitals listed it twice | C | Undo brings nothing back when the word is in the list already; an own word that repeats an earlier one is listed once | settings-rules "Undo of a removed own word does nothing...", "an own word that repeats another own word..." |
| 5 | A built-in list that repeated a word of its own made its first copy impossible to remove (only a later version's list could be like this) | D | only an own word is ever a repeat; one path for one word and for the list | settings-rules "a built-in list that repeats a word of its own..." |
| 6 | The Reset question could read "jason and lucia, jason e lucia and 5 more" | D | each word in quotes | settings-view, settings-page |
| 7 | The "same word" rule was tested with capitals and spaces only; a cover's label was checked without the matcher | T | "Lúcia", "#Rockstar", "Vice-City" (and "RockStar", which stays the person's own: it also finds "a rock star"); the label checked through find() | settings-rules |
| 8 | The version check never laid out the busiest row, nor its grey; the version could fall behind the changelog; only one state of the menu was checked | T | the row measured with "Report missed GTA" in it, the colour checked; the manifest's version must be the changelog's newest; the version in every state | toolbar-edges, extension-rules, menu-view |
| 9 | The order of the built-in list (longer entries first) was written as two cases, not as a rule | D | a test checks it for every two built-in entries | matcher "a built-in entry found inside a longer one comes after it" |
| 10 | The user's real stored words were never tried in Firefox | T | a journey stores "Rockstar", "jason", "Lucia" as own words: Settings lists each once, as built-in, and a cover names the word | settings-page |
| 11 | Wording: the changelog did not take back 0.1.0's "Jason, Lucia and Pedro does not count", and said "listed once" where the user sees a tag change; the README's "Jason and Lucia" read as the pair; stale or unclear comments and test names; the security entries understated the reach | W S | rewritten | this file |

## Dropped, and why

- "No mutation breaks for 0.1.2" (T): written after the reviewers' copy was frozen (W05 on).
- "read() runs the matcher on every call" (D): measured 0.03 ms for the switch alone, 1.5 ms at
  200 own words, never driven by a page.
- "An own 'RockStar' stays the person's own" (T): right, since it also finds "a rock star": a
  different word. Now pinned by a test.
- "menu.js reads the version on every redraw" (D): moved to once anyway.
