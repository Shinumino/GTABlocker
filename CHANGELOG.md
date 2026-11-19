# Changelog

## Unreleased

Not installed in your Firefox yet (that is step 7). In the test Firefox (`run.cmd`) it now works:

- **GTA on a page is covered.** A video tile, a post, a comment, a search result or a line
  about GTA gets a dark striped cover that says "Hidden: this was about GTA" and which word
  matched, for example "(matched: vice city)". Big covers have a paw. Short lines read
  "Hidden (GTA): grand theft auto".
- **Nothing on the page moves or is removed.** The cover sits exactly where the item was, so
  sites keep working.
- **A cover cannot be clicked.** A stray click, a middle click or a right click on it does
  nothing, so no GTA video opens by accident, and pointing at it starts no preview.
- **When a page's title is about GTA**, a card covers the whole page: "This page is about GTA",
  the matched word, and a "Show anyway" button (only for that visit). The browser tab says
  "Hidden page" until you press it. While the card is up, keys do nothing on the page behind
  and its video or sound is paused.
- Pages that load more as you scroll are checked too: new posts get covered, and a tile reused
  for a normal video is uncovered.
- What you type is never covered, even if it mentions GTA.
- **It knows what counts as GTA.** Any word starting with GTA (GTA 6, GTA V, GTA Online,
  GTA RP), Grand Theft Auto, Rockstar Games, Vice City, Leonida, Los Santos, Liberty City,
  San Andreas, and the names Jason and Lucia next to each other ("Jason and Lucia",
  "Jason & Lucia", "Jason e Lúcia", "Lucía y Jason"). A plain list of names like
  "Jason, Lucia and Pedro" does not count.
- Capitals, accents and spacing do not matter, so #ViceCity, @RockstarGames and gTA 6 count
  too, and so does GTA written inside Chinese, Japanese or Korean text.
- A few things that are not the game are covered too: GTA as the Toronto area, the San Andreas
  fault, and "los santos" in Spanish.
- **A toolbar icon** (the paw) shows how many things are covered on the page, or "off".
- **Turn it off** from the toolbar menu (click the icon): "On this site" or "Everywhere". It stays off, even after
  closing Firefox, until you turn it back on, and pages follow at once, without a reload. A
  video embedded in a page follows the site you are on.
- **The toolbar menu lists what was covered here, by word.** "Not about GTA" shows those
  things again on this page and saves a report; Undo covers them again and takes the report
  back. For one of your own words the button is "Remove from my list". When something about
  GTA was not covered, "Report missed GTA" saves the page's address, with a note if you want.
- **Settings** (from the toolbar menu): your word list (it starts with the built-in words;
  add your own, remove any; Reset goes back to only the built-in words, and asks first), the
  sites where it is off, and your reports, which you can copy and send to Claude. Everything
  stays on this PC. A built-in word added in a later version reaches your list too, unless you
  removed it.
- A page saved on your PC (a local file) is covered like any page; only Everywhere turns it off.
- If you remove or reload the add-on while a page is fully covered, the next copy clears the
  old cover; after removing it for good, reload the page.
- Covers made by your own words say "a word from your list", so a site cannot read your list.
- **Fixed after trying it:** a YouTube Short about GTA is now covered whole, its picture too
  (only its title line was); a Reddit search for GTA no longer covers the whole site in
  stripes (a hidden screen-reader line made the add-on cover Reddit's whole page).
- Not there yet: dog and cat photos on pictures, and rules made for YouTube (the Shorts player:
  cover, pause and mute), Reddit, X, Google and Instagram.
