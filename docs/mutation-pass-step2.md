# Mutation pass, step 2 (2026-11-18)

Each rule of the matcher, and of the fixes that came with step 2, was broken on purpose, one at
a time, in a throwaway copy of the project, and the tests that should catch it were run with
plain `node --test`. Rerun with `node tools/mutation-pass.mjs` (it runs step 1's list too).

**Result: 44 breaks, 43 turned a test red, 1 stayed green by design (S18).** The whole run,
with step 1's 60, was 103 breaks: 101 red, 2 green by design (M58, S18). An unbroken copy was
green first. S40 stayed green on the first run; its test was made stricter and then went red.

| # | Rule | Break | Turned red (one of the tests) | Why that test is enough |
|---|---|---|---|---|
| S01 | full-width letters count as normal ones | drop NFKC on the text | matches gta*: full-width "Gta 6" | the text is written in full-width letters |
| S02 | invisible characters are removed from the text | drop that step | matches gta*: "G" zero-width "TA 6" | an invisible character sits inside the word |
| S03 | every format and default-ignorable character counts | go back to a short hand-written list | every invisible character is removed... | it walks every such character in Unicode |
| S04 | piles of combining marks cannot slow normalization | keep the piles | a long page, and text built to slow a pattern down... | 100,000 stacked marks take 2 s without it |
| S05 | accents on Latin letters do not matter | keep the accents | matches jason e lucia: "Jason e Lúcia" | the entry has no accent, the text has one |
| S06 | marks that are part of a letter stay | strip every mark (the old way) | your own list ["でんき"] on "てんき" | with the mark gone, two different words become one |
| S07 | camel case is split | drop the split | matches gta*: "PlayGTA" | only the split shows a word starting there |
| S08 | case never matters | read only the split text | matches gta*: "gTA 6" | the split alone breaks this word |
| S09 | "&" means "and" | leave & as punctuation | matches jason and lucia: "Jason & Lucia" | the default list has no "&" entry any more |
| S10 | trademark signs are gaps | let Unicode turn them into "TM" | matches grand theft auto: "GRAND THEFT AUTO™ V" | the sign is glued to the last word |
| S11 | German sharp s equals ss | drop the fold | your own list ["straße"] on "STRASSE" | capital SS has no sharp s |
| S12 | Greek final sigma equals sigma | drop the fold | your own list ["λος σαντος"] on "ΛΟΣΣΑΝΤΟΣ" | the joined text has a middle sigma where the entry has a final one |
| S13 | any run of gap characters becomes one space | do not collapse | runs of spaces, punctuation and symbols become one space... | it checks normalize's output directly |
| S14 | the words of an entry may be written together | require a space | matches grand theft auto: "grandtheftauto" | there is no space at all |
| S15 | a match starts at a word start | drop the start boundary | does not match: "pegtag" | "gta" sits inside a word |
| S16 | a match ends at a word end (unless *) | drop the end boundary | does not match: "Leonidas, king of Sparta" | the word goes on after "leonida" |
| S17 | a letter of another script ends a word | any letter continues a word (the old way) | matches gta*: "我在玩GTA5" | a Chinese letter touches the Latin word |
| S17b | a digit ends a word | digits continue a word | matches leonida: "Leonida2026" | a digit touches the word |
| S17c | scripts without spaces have no word ends | give them one | your own list ["ゲーム"] on "ゲーム機が欲しい" | Japanese runs the next word straight on |
| S18 | what reaches the pattern is escaped (second lock) | drop `literal()` | **stayed green, by design** | punctuation and symbols never reach it: they split words first. The reviewer predicted this; it stays as a second lock behind the split, and the split itself is proven by S13, S14 and the "no character acts as a pattern" test |
| S19 | a star is read after normalizing | look for it before | your own list ["gta＊"] on "GTAVI" | a full-width star only becomes `*` after NFKC |
| S20 | a star anywhere but the end is refused | allow it | a * anywhere but the end is refused... | "vice*city" must not match "vice cityscape" |
| S21 | the length is measured after normalizing | measure the raw entry | 80 characters is allowed, 81 is not... | 5 characters of U+FDFA normalize to 90 |
| S22 | 80 characters is allowed | refuse 80 too | 80 characters is allowed, 81 is not... | an entry of exactly 80 is in the test |
| S23 | at most 10 words | drop the cap | an entry of more than 10 words is refused | 10 and 11 words side by side |
| S24 | 3 letters or digits, punctuation not counted | count characters | an entry needs 3 letters or digits... | "a-b" and "#gt" are 3 characters but 2 letters |
| S25 | repeats and refused entries take no place | count them against the cap | the list holds 200 entries... | "last one" is exactly the 200th real entry |
| S26 | a repeat is reported, with what it repeats | drop it silently | a repeat names the entry it repeats | it checks the code and `sameAs` |
| S27 | a match names the entry as written | name the normalized key | the same entry list cases ("Vice City") | the written form has capitals and spaces |
| S28 | blank lines are skipped | refuse them | blank lines are skipped... | "" and "   " must not appear in `rejected` |
| S29 | the first entry in the list wins a tie | reverse the order | your own list ["vice*","vice city"] on "vice city" | both entries match at the same place |
| S30 | a GtaBlocker reachable only through the page is not ours | take any GtaBlocker | a GtaBlocker that is only reachable through the page... | a prototype stands in for the page's window |
| S31 | the page is marked ready only after the matcher compiled | mark it ready at once | when the matcher fails to compile, the page is not marked ready | a stub compile that throws |
| S32 | content.js leaves nothing in the shared scope | unwrap it | content.js leaves nothing of its own... | it runs content.js twice in one scope |
| S33 | the matcher loads before content.js | swap the manifest order | the manifest loads every lib file, before content.js... | it compares the exact list |
| S34 | no file holds a direction-changing character | plant a raw U+202E | no project file holds an invisible or direction-changing character | it scans every text file in the project |
| S35 | every waiting update state is caught | catch only "pending" | a waiting update is found in either update folder... | it tries all six waiting states |
| S36 | the older update folder is checked too | skip it | a waiting update is found in either update folder... | each state is tried in both folders |
| S37 | no test Firefox starts while an update waits | skip the check | the harness refuses to start Firefox while an update is waiting... | it points at a Firefox that does not exist, so even the break starts none |
| S38 | run.cmd stops while an update waits | the check exits 0 | the command run.cmd uses says what to do, and exits 1... | it runs the real command on made-up folders |
| S39 | the secret check never crashes Node on an odd slice | decode the slice directly | a file at an odd position in a bigger buffer does not crash the check | the exact slice that killed Node 24.19 |
| S40 | the UTF-16 copy keeps every whole character | drop the last one | a file at an odd position... (the key-only lines) | the key ends in a single digit, so losing the last character leaves no key shape (the first version ended in 901 and stayed green) |
| S41 | Firefox applies the same rules | drop the camel split | Firefox agrees with the micro tests on every case | the same tables run in Firefox's own engine |
