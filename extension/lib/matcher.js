// GtaBlocker.matcher: decides whether a piece of text is about GTA.
//
// A classic script, not a module: Firefox content scripts cannot use import/export, and the
// scripts listed together in the manifest share one global scope, where GtaBlocker lives. The
// micro tests load this same file (no build step).
//
// The list is plain words, not patterns, because the user edits it (step 4):
// - case, accents on Latin, Greek and Cyrillic letters, full-width letters, trademark signs and
//   invisible characters do not matter;
// - between the words of an entry, any run of spaces, punctuation or symbols counts, or none at
//   all, so "vice city" also finds "Vice-City", "#ViceCity" and "vicecity";
// - "&" means "and", so "Jason & Lucia" is "Jason and Lucia" (user's choice, 2026-11-18);
// - an entry matches whole words only ("leonida" does not match "Leonidas"), except that a `*`
//   at the very end means "a word starting with" ("gta*" finds GTAV, GTA6, GTAOnline). Only a
//   letter of the same script ends a word, so "我在玩GTA5" and "Leonida에서" still match, and
//   a digit never does ("Leonida2026");
// - punctuation and symbols in an entry only separate its words; every other character is
//   escaped, so nothing in an entry can act as a pattern.
//
// For human text, not addresses or ids: camel case is split, so a random video id such as
// "xGtaQ1" reads as "x gta q1" and matches (about 1 in 19,000 random YouTube ids, measured in
// review). The page side (lib/page.js) gives it one line at a time: the pieces of one line
// joined as they show on screen, separate lines never joined, because "vice" on one line and
// "city" on the next would otherwise read as "vice city" (it takes any gap between words).

(function (root) {
  'use strict';

  // An own property only. In a content script, a missing name can be looked up through to the
  // page's window, where an element with id="GtaBlocker" would answer.
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  // Agreed with the user on 2026-11-18: all of GTA, not only GTA 6, for as long as this is
  // installed. Known false hits, accepted: GTA as the Greater Toronto Area, the San Andreas
  // fault, and "los santos" in ordinary Spanish. "Jason & Lucia" is covered by the "and" forms.
  const DEFAULT_ENTRIES = Object.freeze([
    'gta*', 'grand theft auto', 'rockstar games', 'vice city', 'leonida', 'los santos',
    'liberty city', 'san andreas',
    'jason and lucia', 'jason e lucia', 'jason y lucia',
    'lucia and jason', 'lucia e jason', 'lucia y jason',
  ]);

  // Caps for a list the user types: an entry under 3 letters ("a*") would cover almost every
  // word on every page, and the caps keep one pattern over the whole list cheap. The length is
  // counted after normalizing, because one character can expand to 18 (U+FDFA).
  const LIMITS = Object.freeze({ maxEntries: 200, maxLength: 80, maxWords: 10, minChars: 3 });

  // What a refusal says to the person who typed the entry (shown by step 4's settings page).
  const REASONS = Object.freeze({
    'not-text': 'This line could not be read. Delete it and type it again.',
    'too-long': `Too long: ${LIMITS.maxLength} characters at most.`,
    'too-many-words': `Too many words: ${LIMITS.maxWords} at most.`,
    'too-short': 'Too short: use at least 3 letters or numbers.',
    'star-not-at-end': 'A * only works at the end, where it means "words starting with".',
    duplicate: 'Already in the list.',
    'list-full': `The list is full (${LIMITS.maxEntries} at most). Remove one to add this.`,
  });

  // Format characters and default-ignorable code points: zero-width spaces and joiners, the soft
  // hyphen, direction marks and isolates, tags, fillers, the BOM. All of them can hide a word
  // from a filter while it looks the same on screen.
  const INVISIBLE = /[\p{Cf}\p{DI}]/gu;
  // Long runs of combining marks ("zalgo" text). Unicode normalization sorts every run of marks,
  // and a run of 100,000 took 2 s (measured in review); no real word stacks 8.
  const MARK_PILE = /\p{M}{8,}/gu;
  // Accents on these scripts are dropped; in others (Japanese voicing marks, Devanagari vowel
  // signs) a mark is part of the letter and stays.
  const ACCENT = /(?<=[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu;
  const CAMEL = /(\p{Ll})(\p{Lu})/gu;
  const SYMBOL = /\p{So}/gu;
  const GAP_RUN = /[\s\p{P}\p{S}_]+/gu;
  const LETTERS = /[\p{L}\p{M}\p{N}]/gu;

  // Scripts that put spaces between words. A letter of the same script next to an entry means
  // the word goes on; any other script, a digit or punctuation ends it. In scripts written
  // without spaces (Chinese, Japanese, Korean, Thai and others) a word has no visible end, so
  // there an entry matches wherever its letters appear.
  const SPACED_SCRIPTS = ['Latin', 'Greek', 'Cyrillic', 'Armenian', 'Georgian', 'Hebrew', 'Arabic',
    'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada',
    'Malayalam', 'Sinhala', 'Ethiopic'].map((name) => [name, new RegExp(`^\\p{Script=${name}}$`, 'u')]);

  function sameScriptClass(ch) {
    for (const [name, test] of SPACED_SCRIPTS) {
      if (test.test(ch)) return `[\\p{Script=${name}}\\p{M}]`;
    }
    return null;
  }

  // A trademark-like sign that Unicode would turn into several letters (\u{2122} becomes "TM")
  // is a gap instead. A sign that becomes a single letter (a circled G) stays that letter.
  function symbolAsGap(ch) {
    const folded = ch.normalize('NFKC');
    return folded !== ch && [...folded].length > 1 && /\p{L}/u.test(folded) ? ' ' : ch;
  }

  // The text as the matcher reads it. With `camel`, "ViceCity" becomes "vice city"; without it,
  // "vicecity". find() reads both, because splitting camel case breaks text whose case is mixed
  // for other reasons ("gTA 6", "YouTube" against an entry "youtube").
  function prepare(text, camel) {
    let s = String(text)
      .replace(MARK_PILE, '')
      .replace(SYMBOL, symbolAsGap)
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(/&/g, ' and ');
    if (camel) s = s.replace(CAMEL, '$1 $2');
    return s
      .toLowerCase()
      .replace(/\u{DF}/gu, 'ss') // German sharp s
      .replace(/\u{3C2}/gu, '\u{3C3}') // Greek final sigma
      .normalize('NFD')
      .replace(ACCENT, '')
      .normalize('NFC')
      // Every run of spaces, punctuation and symbols becomes one space, so no long gap can ever
      // reach the pattern (20 million symbols in one gap once overflowed its stack).
      .replace(GAP_RUN, ' ');
  }

  function normalize(text) {
    return prepare(text, true);
  }

  // Every character as a \u{...} escape unless it is a letter, mark or digit. Punctuation never
  // gets this far (it separates words), so this is a second lock, not the first.
  function literal(word) {
    return word.replace(/[^\p{L}\p{M}\p{N}]/gu, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
  }

  function parseEntry(entry) {
    if (typeof entry !== 'string') return { code: 'not-text' };
    // Cheap refusal before any work: nothing over a few times the cap can normalize under it.
    if (entry.length > LIMITS.maxLength * 4) return { code: 'too-long' };
    let text = entry.normalize('NFKC').replace(INVISIBLE, '').trim();
    if (text === '') return { blank: true };
    const prefix = text.endsWith('*');
    if (prefix) text = text.slice(0, -1);
    if (text.includes('*')) return { code: 'star-not-at-end' };
    const words = prepare(text, true).split(' ').filter(Boolean);
    const joined = words.join(' ');
    if ([...joined].length > LIMITS.maxLength) return { code: 'too-long' };
    if (words.length > LIMITS.maxWords) return { code: 'too-many-words' };
    if ((joined.match(LETTERS) || []).length < LIMITS.minChars) return { code: 'too-short' };
    const first = [...words[0]][0];
    const last = [...words[words.length - 1]].pop();
    const before = sameScriptClass(first);
    const after = prefix ? null : sameScriptClass(last);
    return {
      entry: entry.trim(),
      key: joined + (prefix ? '*' : ''),
      pattern: (before ? `(?<!${before})` : '') + words.map(literal).join(' ?') + (after ? `(?!${after})` : ''),
    };
  }

  // Builds a matcher for a list. find(text) returns the entry that matched, as written (trimmed),
  // or null. When two could match, the one that starts earlier in the text wins, then the one
  // earlier in the list. rejected lists every refused entry: { index, entry, code, reason },
  // plus sameAs (the index of the entry it repeats) for a duplicate. Blank lines are skipped.
  function compile(entries) {
    const accepted = [];
    const rejected = [];
    const seen = new Map();
    const list = Array.isArray(entries) ? entries : [];
    list.forEach((entry, index) => {
      const parsed = parseEntry(entry);
      if (parsed.blank) return;
      let code = parsed.code;
      if (!code && seen.has(parsed.key)) code = 'duplicate';
      if (!code && accepted.length >= LIMITS.maxEntries) code = 'list-full';
      if (code) {
        const refusal = { index, entry, code, reason: REASONS[code] };
        if (code === 'duplicate') refusal.sameAs = seen.get(parsed.key);
        rejected.push(Object.freeze(refusal));
        return;
      }
      seen.set(parsed.key, index);
      accepted.push(parsed);
    });
    // One pattern for the whole list, so a text is read once, not once per entry.
    const combined = accepted.length === 0 ? null
      : new RegExp(accepted.map((a) => `(${a.pattern})`).join('|'), 'u');
    const first = (text) => {
      const match = combined.exec(text);
      if (!match) return null;
      for (let i = 1; i < match.length; i++) {
        if (match[i] !== undefined) return accepted[i - 1].entry;
      }
      return null;
    };
    return Object.freeze({
      entries: Object.freeze(accepted.map((a) => a.entry)),
      rejected: Object.freeze(rejected),
      find(text) {
        if (!combined) return null;
        const split = prepare(text, true);
        const found = first(split);
        if (found !== null) return found;
        const whole = prepare(text, false);
        return whole === split ? null : first(whole);
      },
    });
  }

  ns.matcher = Object.freeze({ DEFAULT_ENTRIES, LIMITS, REASONS, normalize, compile });
})(globalThis);
