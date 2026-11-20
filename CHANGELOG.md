# Changelog

## 0.1.2 (19 Nov 2026)

Install it the same way as before (about:addons, the gear icon, "Install Add-on From File..."):
it replaces 0.1.1, and your words and settings stay.

- **"Jason" and "Lucia" on their own now count as GTA** (you had to add them to your list: only
  the two together, like "Jason and Lucia", counted). They also cover anyone else with those
  names, like the actor Jason Statham or Ana Lúcia, the country Saint Lucia, and a list of names
  like "Jason, Lucia and Pedro" (0.1.0 said it did not count). A longer name, like "Luciana",
  does not count.
  - A page whose title has either name gets the whole-page "This page is about GTA" card: an
    email from a Jason, a chat with a Lúcia. "Show anyway" opens it for that visit, and you can
    remove either word in Settings with its bin button (Reset brings it back).
  - You added "jason" and "Lucia" to your own list: they become the built-in words. In Settings
    they are tagged "built-in" instead of "yours", their covers say "(matched: jason)" or
    "(matched: lucia)", and the toolbar menu offers "Not about GTA" for them instead of "Remove
    from my list".
- **The toolbar menu shows the add-on's version** (0.1.2), small and grey, at the bottom-right
  next to Settings.
- **Fixed:**
  - A line with odd capitals, like "RockStar Games: Jason trailer", was named after "jason";
    it is now named after "rockstar games", the word that starts first.
  - On a list of almost 200 words, a built-in word added by an update was silently left out.
  - Undo after removing one of your words could list it twice, if you had typed it again in
    other capitals.
  - The Reset question puts each word in quotes.

## 0.1.1 (19 Nov 2026)

Install it the same way as 0.1.0 (about:addons, the gear icon, "Install Add-on From File..."):
it replaces 0.1.0, and your words and settings stay.

- **Instagram Reels** (you reported that only the text was covered and the video played):
  - On the Reels page, and on a reel opened from a link, a reel whose text mentions GTA gets
    the "Hidden: this was about GTA" cover over its video and its sound button, and the video
    stays paused and muted. Its text is everything next to the video: the name, the caption,
    the music, and the comments shown under it.
  - Each line of that text that mentions GTA gets a plain striped cover. The other lines stay,
    and so do the Follow, like and comment buttons.
  - A comment about GTA covers its reel too, even when the reel itself is not about GTA.
  - A reel that is not about GTA plays as usual, also when you scroll back and forth.
    Instagram brings each reel's text together with its video, so a reel is checked at once
    and you will rarely see "Checking for GTA…" there.
  - "Not about GTA" in the toolbar menu shows the reel you are watching again; it counts for
    that reel only. Its sound comes back, but it stays paused until you press play.
  - The toolbar icon counts every GTA reel Instagram has loaded on the page, not only the one
    you are watching. A GTA reel usually counts 2: its video and its caption line.
  - Tried on the real Instagram while logged out (19 Nov 2026). Logged in, it was tried only
    on a test page built like the one you saved, so if a GTA reel still plays for you, use
    "Report missed GTA" on it.
  - Not yet: the Instagram feed, Explore, Stories, a post opened from a link, and the reels on
    a profile page are covered only as in 0.1.0 (their text and pictures), so a GTA video
    there can still play.
- **"Rockstar" on its own now counts as GTA** (you found a Short that said only "Rockstar" and
  played: only "Rockstar Games" counted). It also covers things that are not the game:
  Post Malone's song "rockstar", the Rockstar Energy drink, and lines like "a real rockstar
  developer". "Rock star" as two words, and "rockstars", do not count.
  - You added "Rockstar" to your own list: it becomes the built-in word. In Settings it is
    tagged "built-in" instead of "yours", and its covers say "(matched: rockstar)" instead of
    "(matched: a word from your list)".

## 0.1.0 (19 Nov 2026)

Signed by Mozilla and installed in your own Firefox. A new version comes as a new signed file:
install it the same way (about:addons, the gear icon, "Install Add-on From File..."), and your
words and settings stay. What it does:

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
  and its video or sound is paused and muted.
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
- **A toolbar icon** (the paw) shows how many things are covered on the page, or "off" (for
  now a GTA Short counts 2: its video and its title line).
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
- If you reload, update or reinstall the add-on, it clears what the old one left on open
  pages: the whole-page card, the covers, and the mute on videos it had paused (they stay
  paused). If you remove it for good, reload the page.
- Covers made by your own words say "a word from your list", so a site cannot read your list.
- **Fixed after trying it:** a Short's tile in a list (search results, the Shorts shelf) is now
  covered whole, picture and title (only its title line was); a Reddit search for GTA no
  longer covers the whole site in stripes (a hidden screen-reader line made the add-on cover
  Reddit's whole page). On Kick, a stream about GTA is now covered whole, its live preview
  too (only its title and category lines were).
- **Watching YouTube Shorts** (tried on the real YouTube, 19 Nov 2026):
  - Each Short starts behind a "Checking for GTA…" cover, paused and muted, until YouTube
    shows its title. That takes about a second. If the next Short's title is exactly the same
    as the last one's, it waits 4 seconds.
  - If its text (title, channel or music) mentions GTA, it stays covered, paused and muted,
    and the cover changes to "Hidden: this was about GTA". Each line of that text that
    mentions GTA gets a plain striped cover; the other lines stay.
  - If it is not about GTA, the cover goes and it plays with its sound.
  - Move to the next Short with the mouse wheel or the arrow button at the side.
  - Shorts never get the whole-page "This page is about GTA" card, so the tab shows the
    Short's own title, GTA words included. Leaving a GTA Short, that card can show for a
    moment, until the next page's title comes.
  - "Not about GTA" shows that Short again; it counts for that Short only, for each word the
    menu lists for it.
- When you uncover something yourself (Show anyway, Not about GTA, or turning it off), its
  sound comes back, but the video stays paused until you press play.
- A video or sound inside a covered item is paused and muted, and stays paused while the cover
  is on. Not yet: a video embedded from another site keeps playing, and you can hear it,
  inside a covered item or behind the whole-page card.
- Not there yet: dog and cat photos on pictures, and rules made for Reddit, X, Google and
  Instagram.
