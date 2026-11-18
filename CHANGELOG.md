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
- Not there yet: a toolbar switch to turn covers off, your own word list, dog and cat photos
  on pictures, and rules made for YouTube, Reddit, X, Google and Instagram.
