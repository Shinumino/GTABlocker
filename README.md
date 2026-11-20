# GTA Blocker

A Firefox add-on that covers anything about GTA (Grand Theft Auto) on the pages you visit:
video tiles, posts, comments, search results and lines of text. A covered item gets a dark
striped cover that says "Hidden: this was about GTA" and which word matched. Nothing on the
page is removed, so sites keep working, and a cover cannot be clicked by accident.

- **The words it knows:** any word starting with GTA (GTA 6, GTA V, GTA Online), Grand Theft
  Auto, Rockstar Games, Rockstar, Vice City, Leonida, Los Santos, Liberty City, San Andreas,
  Jason, Lucia (each name on its own). Capitals, accents and spacing do not matter (#ViceCity
  counts). You can add and remove words in Settings.
- **YouTube Shorts and Instagram Reels:** a Short or reel about GTA is covered, paused and
  muted; one that is not plays as usual.
- **A page whose title is about GTA** gets a card over the whole page, with "Show anyway".
- **The toolbar icon** counts what is covered on the page. Its menu turns the add-on off on
  one site or everywhere, and "Not about GTA" shows a wrong cover again.
- **Nothing leaves your computer:** your words, settings and notes are stored in Firefox, and
  the add-on sends nothing anywhere.

## Install

Download the `.xpi` file from the [latest release](../../releases/latest). In Firefox, open
`about:addons`, click the gear icon, choose "Install Add-on From File...", pick the file and
click Add. It needs Firefox 142 or later, on a computer.

It is signed by Mozilla but not listed on addons.mozilla.org, so it does not update by itself:
install each new release the same way. Your words and settings stay.

## Limits

- It reads text only. A picture or video whose title, caption or description never names GTA
  is not covered.
- On Instagram, the feed, Explore and Stories are covered by their text only so far, so a GTA
  video there can still play.
- Some covers are not about the game: GTA as the Greater Toronto Area, the San Andreas fault,
  "los santos" in Spanish, Post Malone's "rockstar", anyone named Jason or Lucia. A page whose
  title has one of them, like an email from a Jason, gets the whole-page card. "Not about GTA"
  or "Show anyway" shows them again, and Settings removes any word you do not want, built-in
  ones too (Reset brings them back).
- Phone apps cannot be reached by any add-on.

## Report a problem

Open an issue with the page's address, what you saw, and the add-on's version (the small
number at the bottom-right of its menu). In the add-on, "Report missed GTA" and "Not about GTA"
keep a note in Settings, on your computer only: you can copy them from there into the issue.

## Build and test (Windows)

You need Node.js 24 or later and Firefox.

- `setup.cmd` installs the development tools into this folder, as `package-lock.json` pins
  them.
- `run.cmd` opens a separate Firefox with a fresh, empty profile and the add-on loaded, to try
  it by hand. Your own Firefox is not touched.
- `test.cmd` runs the micro tests, then the browser tests in a headless Firefox.
- `check.cmd` runs everything: a check that no keys are committed, the micro tests, Mozilla's
  add-on linter, a dependency audit, and the browser tests.

`CHANGELOG.md` lists what changed in each version, and `CLAUDE.md` and `docs/` hold the
project's notes: how it is built, the reviews, and what each test proves.

## License

MIT, see `LICENSE`. GTA, Grand Theft Auto and Rockstar Games are trademarks of Take-Two
Interactive. This project is not affiliated with or endorsed by Take-Two Interactive or
Rockstar Games.
