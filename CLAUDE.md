# GTA Blocker

A Firefox extension that finds anything about GTA on the pages the user visits and covers it:
pictures and videos with a dog or cat photo, text with a short note. Nothing on the page is
removed, only covered, so sites keep working. Temporary by the user's choice (around the
GTA 6 launch), but the house rules in `~/.claude/CLAUDE.md` apply in full. This file records
how each one is met here, and says so where one is not.

Local project, one user, no remote. The agreed design and every decision behind it are in the
galaxy note `project-gta-blocker` (decided 2026-11-18, do not re-litigate).

## Commands

| | |
|---|---|
| `setup.cmd` | one time (and after `package-lock.json` changes): install the dev tools into `node_modules` |
| `run.cmd` | open a separate Firefox with the extension loaded, in a fresh profile; edits reload it. Your own Firefox is not touched |
| `test.cmd` | micro tests, then macro tests (only if micro is green). Narrow run: `test.cmd micro`, `test.cmd tests\micro\check-repo.test.mjs` |
| `check.cmd` | the gate: repo check, micro, Mozilla's linter (warnings fail), `npm audit`, macro |
| `node tools\mutation-pass.mjs` | the mutation pass (about 7 minutes): breaks each rule in a copy and shows which test turns red. Results per step in `docs/` |

Needs: Node 24, git (the repo check reads git's view of the files), the installed Firefox
(`C:\Program Files\Mozilla Firefox\firefox.exe`, or set `FIREFOX_BIN`), and the internet for
`setup.cmd` and the audit step of `check.cmd`. `web-ext` 10.8.0 is pinned exactly.

## How the harness works

- **Micro tests** (`tests/micro/`, a few seconds in all) prove rules one at a time, with no
  browser. Each file runs alone: `test.cmd tests\micro\<file>`.
- **Macro tests** (`tests/macro/`, about half a minute) drive the installed Firefox, headless,
  through Marionette, the automation protocol built into Firefox (`tests/support/marionette.mjs`).
  No geckodriver, Selenium or Playwright: Playwright's Firefox is a patched build, not the one
  the user runs, and an unsigned download is likely blocked by Smart App Control here.
- A macro file calls `useFirefox()` (`tests/support/browser-test.mjs`), which registers the
  start and the stop with node:test, so no file can forget to stop its browser.
- Each macro file gets a throwaway profile (`%TEMP%\gtablocker-ff-XXXXXX`) and loads the
  extension as a temporary add-on, the same way `about:debugging` does.
- **The outside world is fake.** The test profile sends every hostname to 127.0.0.1, where the
  fixture server (`tests/support/fixtures.mjs`) serves `tests/fixtures/<hostname>/`. A test that
  opens `www.youtube.com` gets our page; a host with no fixture gets a 404, never the real site.
- `tools/test.mjs` runs the suites for both `test.cmd` and `check.cmd`. It is red when no test
  ran, because `node --test` alone calls that a pass.
- **Extension code is plain scripts, no build** (user's choice, 2026-11-18). Firefox content
  scripts cannot use import/export, and the scripts listed together in the manifest share one
  global, so each file adds its part to one object, `GtaBlocker` (`lib/matcher.js` adds
  `GtaBlocker.matcher`). Micro tests load the same files with
  `tests/support/extension-script.mjs`, in a fresh `vm` context that has the JavaScript
  built-ins and nothing else, so a script that reaches for `document` or `process` fails there.
  Values from that context are another realm: compare `plain()` copies. Macro tests run the
  same file inside Firefox (`matcher-in-firefox.test.mjs`) against the same table of cases
  (`tests/support/matcher-cases.mjs`), because Node and Firefox have different engines.

## Rules that are not gates, so they are written here

- **Never start Firefox while an update is waiting** (now a gate: `tools/firefox_update.mjs`,
  run by `startFirefox` and `run.cmd`). Firefox installs a waiting update at launch, before it
  reads any setting, into `C:\Program Files\Mozilla Firefox`, under the user's open Firefox.
  On 2026-11-18 the first test run of this project did exactly that (160.0 to 160.0.1, Firefox's
  update log at 08:49:43) and its killed test browser left a crash report in the user's
  per-user Crash Reports folder. If the gate says an update waits: ask the user to restart
  their own Firefox; never work around it.

- **Never stop Firefox by name, never by id alone.** The user has Firefox open all day and it
  starts processes all the time. `tests/support/firefox-process.mjs` decides what is ours: the
  command line names our profile, or it holds the profile's `parent.lock`, or it is a child of
  one of ours that started after its parent did. A process is its id plus its start time, and
  `killExact` kills only when both still match. Never use `taskkill /T` (it follows parent ids,
  which Windows reuses). The micro tests in `profile-processes.test.mjs` prove each case with
  made-up process tables; change that file first when this logic changes.
- **Never remove a site's element; cover it.** YouTube, Reddit, X and Instagram keep their own map
  of the page, and a node that vanishes can throw, stop infinite scroll or come back. (From the
  design, enforced by tests from step 3 on.)
- **A site is its hostname.** Tests serve `http://<host>:<port>/` while the real sites are
  `https://<host>/`. Anything keyed by site (the "this site" switch, site rules) uses
  `location.hostname`, and match patterns use `*://`, so both behave the same.
- **Fixtures are stand-ins we write by hand**, shaped like the real page, never copies of a
  site's HTML.
- **When a real site changes its layout,** the tests stay green and the extension stops working
  there. Only trying it on the real site shows this; note each such check in the changelog.

## Build order

Each step ends with blind reviews (security, correctness, design, test quality, wording) and a
mutation pass, before the next starts.

1. **Harness** (done 2026-11-18): the four commands, the Firefox driver, the fixture server, the
   repo check.
2. **Matching** (built 2026-11-18, `extension/lib/matcher.js`; the rules are in its header).
   In short: case, accents (Latin, Greek, Cyrillic), full-width letters, trademark signs and
   every format or default-ignorable character do not matter; the words of an entry may be
   written together or with any spaces, punctuation or symbols between ("vicecity",
   "Vice-City", "#ViceCity"); `&` means "and" (user's choice: a list like "Jason, Lucia and
   Pedro" is not the pair); whole words only, where only a letter of the same script continues
   a word (so `我在玩GTA5` matches) and a digit ends it; a trailing `*` means "a word starting
   with". Punctuation in an entry only separates words; nothing in an entry can act as a
   pattern. Caps: 200 entries, 80 characters after normalizing, 10 words, 3 letters or digits.
   `compile()` returns `find(text)` (the entry as written, or null; the earliest match wins,
   then list order) and `rejected` (`{ index, entry, code, reason }`, plus `sameAs` for a
   repeat; blank lines are skipped). Contracts, written in the file's header: it is for human
   text, not addresses or ids, and it is given one line at a time (lib/page.js joins the pieces
   of one line as they show and never joins separate lines, since it takes any gap between words).
3. **Covering** (built 2026-11-18, reviewed and fixed the same day).
   - `lib/cover.js`: the rules as plain logic over plain descriptions of elements (micro tests,
     no DOM library): the smallest card around a match (tags, roles, card-like custom elements,
     class tokens like `comment` or `video-card`), a card at most 60% of the screen, else the
     nearest block at any size; never html/body/main; never a box inside a shadow tree (the page
     stylesheet does not reach there; its host is covered); a box whose site uses both its
     ::before and ::after is passed over, one used means a one-layer cover (`layersFor`); sizes
     xs/s/m/l from the box's height and width.
   - `lib/page.js`: reads the real page line by line (the pieces of one line joined, separate
     lines and child blocks never), plus alt, title and aria-label, entering shadow trees (each
     frame runs its own copy: all_frames, match_about_blank). Covers with attributes only, and
     sets a covered box's own tooltip aside in data-gta-title. Watches the page from
     document_start; a change re-reads only the line it touches; a covered box that changes is
     chosen again from scratch; removed boxes are let go; hidden matches wait until shown;
     editable areas are never read. Swallows clicks, hovers and keys aimed at a cover.
   - The whole-page cover (top page: a modal `<dialog>` in a closed shadow tree on `<html>`,
     under a name that changes every run; in a frame: a plain panel that never takes the focus):
     it follows the address, not the title (it stays until Show anyway, whatever the site does
     with its title; the first title the site sets for a new address decides again); the tab
     says "Hidden page"; Escape cannot close it; no key reaches the page and its video or sound
     is paused; a page that removes it gets it back. Its look is PAGE_COVER_CSS in page.js, on a
     solid backdrop (see the note in `docs/design/cover-preview.html`).
   - `content.css` draws the cover on boxes (the agreed look).
   - Known gap: a shadow tree attached long after its host appeared is only read when the host
     changes. Dog and cat photos (step 5) will replace the note on pictures.
4. Toolbar: the switch (everywhere / this site, read live), the count on the icon, the settings
   page with the word list. Rebuild the matcher on every list change (about 1 ms for 200
   entries) and swap it in; show each refusal's `reason` next to its line (`index`). The page
   marker must never reflect the user's own list (a page could read it). Open points from the
   step 3 reviews, to settle at the start of step 4:
   - the off switch needs `page.start` to return a stop(): disconnect both observers, remove
     the listeners, uncover everything, close the whole-page cover (and restore the title);
   - "Show anyway" (revealedAt) must outlive a stop and start, or a toggle brings the cover back;
   - the right click is swallowed on covers (preventDefault on contextmenu), which also blocks
     a per-cover "Report this cover" menu: decide which;
   - `chooseBox` should say why it chose a box (card by tag, role, name, class, or the nearest
     block) for the report;
   - move the whole-page cover's decisions (checkTitle) into lib/cover.js with micro tests
     before changing them;
   - a page can test whether a word is on the list (it sees what gets covered): harmless for
     the default list, but the user's own words would be readable that way. Decide with the
     user;
   - reloading the extension leaves an old whole-page cover with a dead button.
   Reaching the toolbar from a test needs Marionette's chrome context;
   a review said Firefox 138+ wants `--remote-allow-system-access` for that (not verified yet).
   A fixed extension id for `moz-extension://` addresses goes in then too.
5. The bundled dog and cat photos, with their licences.
6. Site rules, one site per step: YouTube (with the Shorts player), Reddit, X, Google, Instagram.
   If a site needs words of its own, give it its own matcher: adding them to the user's list
   would take places in the user's 200 and show up on their settings page as theirs. Move the
   site names now in the general rules (`shreddit|reddit` in CARD_NAME, `tweet` in
   CARD_CLASS) into the site rules then.
7. Signing (AMO, unlisted) and installing it in the user's Firefox. The signing command runs
   `check.cmd` first and sends nothing on a red run.

## Security pass (step 1, 2026-11-18)

- **New input, from whom?** None in the step 1 extension: it ran on every page and only set one
  attribute (step 3 reads the page, below). In the harness: pages from our own fixture server, Marionette replies from
  the Firefox it started, and the process list (ids, parents, start times, names; never another
  program's command line: the profile match runs inside WMI).
- **New surface?**
  - A content script on every page and frame (`<all_urls>`).
  - While a macro test runs: the fixture server on 127.0.0.1, random port, serving
    `tests/fixtures/` only (`tests/micro/fixtures-server.test.mjs`); and Marionette on
    127.0.0.1, random port. Marionette can run privileged code in that test Firefox, and any
    program on this PC could connect to it for those seconds. The test Firefox holds no logins
    or personal data, so this is accepted.
  - While `run.cmd` is open: web-ext's remote-debugging port on 127.0.0.1, the same trade.
- **New permission?** The ability to read and change every page, the widest an extension can
  have; the user agreed to it on 2026-11-18. In return: no other permission, no background
  script, no network access, no remote code, and `data_collection_permissions: none`. These are
  tests now, not promises: `tests/micro/extension-rules.test.mjs`.
- **What can a hostile page do, and what caps it?** In step 1, read the marker attribute and so
  learn that the extension is installed. Nothing about the user is in it. Page text is data,
  never code, and the covers are built from our own strings (step 3 below).
- **Step 2 (matching, 2026-11-18).** New input: the text of every page (from step 3 on) and the
  user's own list (step 4). What hostile page text can try, and what stops it:
  - make the pattern slow: every run of spaces, punctuation and symbols is collapsed to one
    space before matching, so the pattern only ever sees short gaps (a 20-million-symbol gap
    once overflowed its stack), and piles of 8 or more combining marks are dropped before
    Unicode normalization (100,000 of them once took 2 s). The micro test feeds both, plus a
    116 KB page, with a 1 s limit. That limit catches a catastrophic slowdown, not a small one;
  - hide a word: every format and default-ignorable character is removed (a test walks all of
    them), full-width letters are turned into normal ones, and trademark signs become gaps;
  - read our state: `GtaBlocker` lives in the content script's own scope, and the matcher takes
    it only as an own property, so a page element with that id cannot stand in for it.
  A user's entry can never act as a pattern (punctuation only separates words, and anything
  else that is not a letter or digit is escaped). An entry with fewer than 3 letters or digits
  is refused, but a common 3-letter word ("the") is accepted and would cover most pages: that
  is the user's own choice in step 4. No new surface or permission.
- **Step 3 (covering, 2026-11-18).**
  - New input: every page's structure, styles, text and title, in every frame (all_frames,
    match_about_blank).
  - New surface: attributes on a site's boxes (`data-gta-cover`, `-word`, `-size`, `-anchor`,
    `-layers`, `-title`, `-within`); `content.css` on every page; a small stylesheet added to
    each shadow tree found (hides a covered host's shadow content); one element of ours, the
    whole-page cover, on `<html>`, in a closed shadow tree, built element by element (no HTML
    strings; the matched word goes in as text); capture-phase listeners on `window` that act
    on events whose path holds a covered box, and on every key while the whole-page cover is
    up; the tab title, rewritten to "Hidden page" while a page is covered; media on that page
    paused.
  - New permission: none.
  - What a hostile page can do, and what caps it: read the attributes and so learn which word
    matched, and test whether a word is on the list by watching what gets covered (today the
    public default list; a step 4 decision for the user's own words); fake a cover on its own
    content (harmless); fight the whole-page cover on its own page: it cannot hide it with
    styles (display, visibility, opacity and content-visibility are pinned inline), cannot
    break it with an element of the same name (the name changes every run), and gets it back
    when it removes it; a page that draws its GTA content in a canvas or an image without
    text cannot be read at all (accepted). Make us work by changing itself constantly: changes
    are read in batches every 30 ms, a change re-reads only its own line, and finding the
    outermost changed parts walks each one's ancestors (no pairwise comparison); there is no
    cap. Shadow trees nested more than 32 deep are not read.
- **No invisible or direction-changing character in any file** (`tests/micro/source-text.test.mjs`).
  The file tool used here turns a typed `\uXXXX` into the real character; write `\u{...}`.
- **Done automatically in `check.cmd`:** `npm audit` (dependencies) and `tools/check_repo.mjs`
  (no `.env`, no Mozilla API key shape, no known key value in the working copy, the staged copy,
  or anything under `extension/`).
- **Not done:** no CI service, because there is no remote. `check.cmd` is the whole gate.

## The other house rules

- **Off switch:** step 4 (the toolbar switch, read live). Until then: disable the add-on in
  `about:addons`.
- **Who can do what:** one user, no roles.
- **Telling us it is broken:** step 4 will add "report a wrong cover" to the toolbar menu, with
  the page address and which rule matched, and nothing else.
- **Fan-out cost:** none. The extension makes no network request of its own.
- **Personal data (LGPD):** none stored. The settings (word list, switch) stay in the browser's
  extension storage; uninstalling removes them.
- **Secrets:** the AMO signing keys (`WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET`), from step 7, in
  `.env` (gitignored, and refused by the repo check if it is ever picked up). Rotation runbook:
  written in step 7, before the keys exist.
- **Backups:** nothing to back up. Everything is rebuilt from this folder.
