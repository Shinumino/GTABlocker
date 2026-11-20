// What the matcher must and must not match, shared by the micro tests (Node) and the macro test
// (Firefox's own JavaScript engine), so both engines prove the same tables.
//
// Invisible and direction-changing characters are written as \u{...} escapes, never raw: a raw
// one can make an editor show a line differently from what it is
// (tests/micro/source-text.test.mjs refuses them in every file).

// [text, the default entry that should match, or null]
export const SHOULD_MATCH = [
  ['GTA 6 trailer 3 is out', 'gta*'],
  ['gta vi', 'gta*'],
  ['GTAVI leaks', 'gta*'],
  ['#GTA6', 'gta*'],
  ['GTA Online weekly update', 'gta*'],
  ['Meu GTA RP favorito', 'gta*'],
  ["GTA's map is huge", 'gta*'],
  ['\u{FF27}\u{FF54}\u{FF41} \u{FF16}', 'gta*'], // full-width letters, as some sites write titles
  ['PlayGTA', 'gta*'], // joined camel case, as in a channel name
  // Case never matters, even when it looks like camel case (found in review, 2026-11-18).
  ['gTA 6', 'gta*'],
  ['GtA 6', 'gta*'],
  ['vIcE cItY', 'vice city'],
  ['GrAnD tHeFt AuTo', 'grand theft auto'],
  ['rOCKSTAR gAMES', 'rockstar games'],
  // Invisible characters hidden inside a word.
  ['G\u{200B}TA 6', 'gta*'], // zero-width space
  ['G\u{2066}TA 6', 'gta*'], // a direction isolate
  ['G\u{61C}TA', 'gta*'], // the Arabic letter mark
  ['G\u{E0020}TA', 'gta*'], // a tag character
  ['G\u{3164}TA', 'gta*'], // the Hangul filler
  // Languages written without spaces, or with words glued to a Latin name.
  ['我在玩GTA5', 'gta*'],
  ['新作GTA6の発売日', 'gta*'],
  ['在Vice City里', 'vice city'],
  ['Vice Cityで遊ぶ', 'vice city'],
  ['Leonida에서', 'leonida'],
  ['\u{5D1}GTA', 'gta*'], // a Hebrew prefix letter
  // Trademark signs, which Unicode would otherwise turn into the letters "TM" and "SM".
  ['GRAND THEFT AUTO\u{2122} V', 'grand theft auto'],
  ['VICE CITY\u{2122}', 'vice city'],
  ['ROCKSTAR GAMES\u{2120}', 'rockstar games'],
  // A digit ends a word.
  ['Leonida2026', 'leonida'],
  ['Vice City\u{B2}', 'vice city'],
  // Any spaces, punctuation or symbols between the words of an entry, or none.
  ['Grand Theft Auto VI', 'grand theft auto'],
  ['grand  theft\nauto', 'grand theft auto'],
  ['#GrandTheftAuto', 'grand theft auto'],
  ['grandtheftauto', 'grand theft auto'],
  ['Rockstar Games announced the date', 'rockstar games'],
  ['@RockstarGames', 'rockstar games'],
  ['rockstargames.com', 'rockstar games'],
  // "Rockstar" alone (the user's report, 2026-11-19: a GTA Short said only that).
  ['Rockstar', 'rockstar'],
  ['Rockstar just dropped the trailer', 'rockstar'],
  ['#Rockstar', 'rockstar'],
  ["Rockstar's next game", 'rockstar'],
  ['Back to Vice City', 'vice city'],
  ['#ViceCity', 'vice city'],
  ['vice-city', 'vice city'],
  ['Vice | City', 'vice city'],
  ['vice+city', 'vice city'],
  ['ViceCityStories', 'vice city'],
  ['O mapa de Leonida', 'leonida'],
  ['Los Santos at night', 'los santos'],
  ['Liberty City', 'liberty city'],
  ['San Andreas', 'san andreas'],
  // The pair: "&" counts as "and" (user's choice, 2026-11-18).
  ['Jason and Lucia', 'jason and lucia'],
  ['Jason & Lucia', 'jason and lucia'],
  ['Jason e L\u{FA}cia', 'jason e lucia'],
  ['Luc\u{ED}a y Jason', 'lucia y jason'],
  ['Lucia & Jason', 'lucia and jason'],
];

// Accepted on 2026-11-18: the list is temporary and the user chose "all of GTA" knowing these.
// They are tests so that a change to them is a decision, not an accident.
export const ACCEPTED_FALSE_HITS = [
  ['Traffic in the GTA today', 'gta*'], // Greater Toronto Area
  ['the San Andreas fault', 'san andreas'],
  ['D\u{ED}a de todos los santos', 'los santos'], // ordinary Spanish
  // Accepted on 2026-11-19 with "rockstar" alone (the user's choice).
  ['a real rockstar developer', 'rockstar'],
  ['Post Malone - rockstar', 'rockstar'],
  ['Rockstar Energy Drink', 'rockstar'],
];

export const SHOULD_NOT_MATCH = [
  ['a rock star on stage', null], // two words: not the one entry
  ['the rockstars of jazz', null], // a whole word only
  ['grand theft', null],
  ['auto theft is up', null],
  ['Jason', null],
  ['Lucia', null],
  ['Jason Statham and Lucia', null],
  // A list of names is not the pair (user's choice, 2026-11-18).
  ['Thanks to Jason, Lucia and Pedro', null],
  ['Jason/Lucia', null],
  ['Jason. Lucia said', null],
  ['Leonidas, king of Sparta', null],
  ['Carlos Santos', null],
  ['carlossantos', null],
  ['the vice president', null],
  ['city hall', null],
  ['pegtag', null],
  ['GT A', null],
  ['Nothing about games here', null],
  ['', null],
];

export const ALL_CASES = [...SHOULD_MATCH, ...ACCEPTED_FALSE_HITS, ...SHOULD_NOT_MATCH];

// [the user's list, text, the entry that should match (as written, trimmed), or null]
export const ENTRY_CASES = [
  [['youtube'], 'YouTube', 'youtube'],
  [['YouTube'], 'youtube', 'YouTube'],
  [['Red Dead Redemption'], 'red dead redemption 2', 'Red Dead Redemption'],
  [['Red Dead Redemption'], '#RedDeadRedemption', 'Red Dead Redemption'],
  [['Red Dead Redemption'], 'red dead', null],
  [['Red Dead*'], 'Red Deadline', 'Red Dead*'],
  [['Red Dead*'], 'Red Dead', 'Red Dead*'],
  [['Red Dead*'], 'Red Deed', null],
  [['Red Dead'], 'Red Deadline', null],
  [['gta\u{FF0A}'], 'GTAVI', 'gta\u{FF0A}'], // a full-width star, as a Japanese keyboard types it
  [['gta*\u{200B}'], 'GTAVI', 'gta*\u{200B}'], // an invisible character after the star
  [['a.b.c'], 'a b c', 'a.b.c'],
  [['a.b.c'], 'axbxc', null],
  [['tom & jerry'], 'Tom and Jerry', 'tom & jerry'],
  [['stra\u{DF}e'], 'STRASSE', 'stra\u{DF}e'], // German sharp s
  [['\u{3BB}\u{3BF}\u{3C2} \u{3C3}\u{3B1}\u{3BD}\u{3C4}\u{3BF}\u{3C2}'], '\u{39B}\u{39F}\u{3A3}\u{3A3}\u{391}\u{39D}\u{3A4}\u{39F}\u{3A3}', '\u{3BB}\u{3BF}\u{3C2} \u{3C3}\u{3B1}\u{3BD}\u{3C4}\u{3BF}\u{3C2}'], // Greek final sigma
  [['ゲーム'], 'ゲーム機が欲しい', 'ゲーム'], // Japanese has no spaces: no word ends
  [['でんき'], 'てんき', null], // the voicing marks are part of the letter, not an accent
  [['काल'], 'कल', null], // Devanagari vowel signs too
  [['काल'], 'काल', 'काल'], // and the word itself is accepted and found
  [['vice*', 'vice city'], 'vice city', 'vice*'], // two could match: the first in the list wins
  [['vice city', 'vice*'], 'vice city', 'vice city'],
];

// [text, what normalize() turns it into]
export const NORMALIZE_CASES = [
  ['\u{FF27}\u{FF54}\u{FF41}', 'gta'],
  ['L\u{FA}cia S\u{C3}O', 'lucia sao'],
  ['G\u{200B}T\u{AD}A\u{FEFF}', 'gta'],
  ['ViceCity', 'vice city'],
  ['AUTO\u{2122}', 'auto '],
  ['Jason & Lucia', 'jason and lucia'],
  ['vice -_.,!\u{2605}  city', 'vice city'],
];
