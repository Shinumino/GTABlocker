# Changelog

## Unreleased

Nothing you can use yet. The extension loads in Firefox, but it does not cover anything so far.

- **It knows what counts as GTA.** Any word starting with GTA (GTA 6, GTA V, GTA Online,
  GTA RP), Grand Theft Auto, Rockstar Games, Vice City, Leonida, Los Santos, Liberty City,
  San Andreas, and the names Jason and Lucia next to each other ("Jason and Lucia",
  "Jason & Lucia", "Jason e Lúcia", "Lucía y Jason"). A plain list of names like
  "Jason, Lucia and Pedro" does not count.
- Capitals, accents and spacing do not matter, so #ViceCity, @RockstarGames and gTA 6 count
  too, and so does GTA written inside Chinese, Japanese or Korean text.
- Once covering arrives, a few things that are not the game will be covered too: GTA as the
  Toronto area, the San Andreas fault, and "los santos" in Spanish.
- The test setup is in place. `run.cmd` opens a separate Firefox with the extension, to try it
  by hand. `check.cmd` checks it automatically with your installed Firefox, in a hidden window
  with a throwaway profile; your open Firefox is not touched.
