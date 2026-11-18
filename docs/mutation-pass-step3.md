# Mutation pass, step 3 (2026-11-18)

Each rule of covering was broken on purpose, one at a time, in a throwaway copy of the project,
and the tests that should catch it were run with plain `node --test` (the macro ones in the
installed Firefox, headless). Rerun with `node tools/mutation-pass.mjs` (it runs every step's
list).

**Result: 41 breaks, 40 turned a test red, 1 stayed green by design (P37).** The whole run,
with steps 1 and 2, was 144 breaks: 141 red, 3 green by design (M58, S18, P37). An unbroken
copy was green first. P28 stayed green on the first run; a test was added (the tab title after
Show anyway) and it went red. S33 (step 2) had to follow the manifest's longer list.

| # | Rule | Break | Turned red (one of the tests) | Why that test is enough |
|---|---|---|---|---|
| P01 | no event aimed at a cover reaches the site | guard nothing | no click, middle click, right click or hover on a cover reaches the link around it | the page itself listens on document for every one, and a link wraps the cover |
| P02 | a middle click is stopped | drop auxclick | same test | a real middle click through WebDriver |
| P03 | a right click is stopped | drop contextmenu | same test | a real right click |
| P04 | a hover is stopped | drop mouseover | same test | a real pointer move onto the cover |
| P05 | a picture description counts | drop alt | GTA tiles, lines and comments are covered... | one tile says GTA only in its picture's alt |
| P06 | a screen-reader label counts | drop aria-label | same test | one tile says it only in aria-label |
| P07 | a tooltip counts | drop title | a box whose tooltip is about GTA is covered... | the box says it only in title |
| P08 | a covered box's tooltip hides the GTA text | keep the tooltip | same test | it checks the title attribute is gone while covered and back after |
| P09 | everything inside a cover is hidden | drop the descendant rule | a badge the site forces visible... / nothing inside a cover shows through | two badges the site sets visible |
| P10 | the hiding beats site rules at id strength | plain strength | a badge the site forces visible with !important stays hidden | the site's rule is `#id.class` with !important |
| P11 | a positioned box keeps its own position | anchor every box | a positioned box keeps its own position | an absolute and a sticky box |
| P12 | a card over 60% of the screen is passed over | no limit | a card taller than the screen is passed over... | an article 150% of the screen tall |
| P13 | the site's own ::before or ::after is left alone | always take both | a cover never changes a box's size... | a clearfix box and a 16:9 padding box, each against its twin |
| P14 | a box inside a shadow tree is never covered itself | allow it | content in a shadow tree is covered through its host | the host is not named like a card, the card is inside the shadow tree |
| P15 | a changed cover is chosen again from scratch | only uncover when nothing matches | a cover is chosen again when what made it changes | the shelf heading stops matching, an item inside starts |
| P16 | separate lines are never joined | join them with a space | text is joined within a line, never across lines | "the vice" / child block / "city council" |
| P17 | removing a piece of a line is noticed | ignore removals | removing a piece of a line... is noticed | removing the span forms "Vice City" |
| P18 | text changed in place is noticed | ignore characterData | same test | the text node's data is set directly |
| P19 | hidden text is not covered while hidden | treat hidden as shown | hidden text is not covered while hidden... | a menu holds a hidden GTA item |
| P20 | hidden text is covered once shown | never look again | same test | the `hidden` attribute is removed |
| P21 | what the person types is never covered | read editable areas | text the person is typing is never covered | a contenteditable box mentions GTA 6 |
| P22 | a box that changes size gets the size that fits | no resize | a box that changes size gets the cover size that fits | the box shrinks to one line |
| P23 | a removed covered box is let go | keep it | a covered box the page removes is let go... | the box is removed, then put back with new content |
| P24 | a covered host's shadow content is hidden | no shadow stylesheet | content in a shadow tree is covered through its host | a badge inside the shadow tree set visible |
| P25 | a change inside a shadow tree is noticed | do not watch shadow trees | same test | the shadow text changes after load |
| P26 | Escape does not close the whole-page cover | let it close | Escape does not close the whole-page cover | two real Escape presses, then the cover must still be on top |
| P27 | the tab stays "Hidden page" | do not hide it again | the whole-page cover stays when the site changes its title... | the site sets three titles |
| P28 | a title built from ours is not the site's | take "(1) Hidden page" | same test (its last part) | Show anyway must give back the last real title (added after the first run) |
| P29 | Show anyway is for this visit | forget it | Show anyway shows the page for this visit... | a later look must not bring the cover back (proved to have run) |
| P30 | a #link is the same visit | count the #part | same test | the hash changes after Show anyway |
| P31 | a new address not about GTA lifts the cover | never decide again | moving to another address that is not about GTA lifts the whole-page cover | pushState plus a normal title |
| P32 | a removed whole-page cover comes back | let it go | a page that removes the whole-page cover gets it back | the page removes our element |
| P33 | no key reaches the page under the cover | let them through | keys do not reach the page under the whole-page cover... | the page listens for keys; letters are pressed |
| P34 | the page's sound is paused under the cover | no pausing | same test | a looping sound the page starts again |
| P35 | a frame never takes the keyboard | frames act as the top page | an embedded GTA player does not take the keyboard from the page | the page's search box must keep the focus |
| P36 | not marked ready while the page is read | mark it at once | the page is not marked ready while it is still being read | a script in head records the marker while parsing |
| P37 | each changed part is read once | read nested parts too | **stayed green, by design** | reading a part twice is slower, not wrong: nothing for a test to see. The pairwise version was the quadratic one the reviews measured |
| P38 | a covered box that changes is looked at again | never recheck | a reused tile is uncovered... | the GTA tile's title becomes "Puppies sleeping" |
| P39 | nothing shows through the backdrop | a see-through backdrop | nothing of the page shows through the whole-page cover's backdrop | the pixels of a real screenshot where a link sits |
| P40 | the smallest card around a match is covered | nearest block only | GTA tiles, lines and comments are covered on the right box... | the tile (li) must be covered, not its title |
| P41 | a class that names a card makes a card | ignore classes | same test, and the class micro test | the comment is a `div.comment` |

Not covered by a break, and why:
- What a cover looks like (colours, the paw, the stripes): checked by eye in real Firefox
  screenshots against the agreed preview, not by a test.
- Firefox drawing the blur: headless Firefox draws none, which is why the backdrop is solid.
