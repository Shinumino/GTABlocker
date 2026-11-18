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

## Rules that are not gates, so they are written here

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
2. Matching: the GTA word list and its rules, as pure functions. First decide how extension code
   reaches the micro tests: content scripts are classic scripts in Firefox (no `export`), while
   this package is ES modules for Node.
3. Covering on any site: find the box around a match, cover pictures with a photo and text with
   a note, never remove; re-check a box when its content changes (YouTube reuses tiles). Decide
   then how DOM rules get micro tests (pure functions over plain data, or a pinned DOM library).
   The fixture server may need per-page headers then (sites ship a strict CSP) and video types.
4. Toolbar: the switch (everywhere / this site, read live), the count on the icon, the settings
   page with the word list. Reaching the toolbar from a test needs Marionette's chrome context;
   a review said Firefox 138+ wants `--remote-allow-system-access` for that (not verified yet).
   A fixed extension id for `moz-extension://` addresses goes in then too.
5. The bundled dog and cat photos, with their licences.
6. Site rules, one site per step: YouTube (with the Shorts player), Reddit, X, Google, Instagram.
7. Signing (AMO, unlisted) and installing it in the user's Firefox. The signing command runs
   `check.cmd` first and sends nothing on a red run.

## Security pass (step 1, 2026-11-18)

- **New input, from whom?** None in the shipped extension yet: it runs on every page and only
  sets one attribute. In the harness: pages from our own fixture server, Marionette replies from
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
- **What can a hostile page do, and what caps it?** Today, read the marker attribute and so learn
  that the extension is installed. Nothing about the user is in it. Later steps read page text;
  that text is data, never code, and the covers are built from our own strings and photos.
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
