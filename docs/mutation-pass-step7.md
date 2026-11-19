# Mutation pass, step 7: signing (2026-11-19)

Every rule of the signing command broken on purpose, one at a time, in a throwaway copy (which,
since this step, never holds `.env`). The rules' tests (`sign-rules`, fakes) and the real-seams
test (`sign-run`: a throwaway git project, a fake web-ext, a fake check) were run.

**Result: 24 breaks, 24 red.** The rules were written before their tests this time, so these
breaks are what shows each test can fail.

| # | Rule | Break |
|---|---|---|
| G01 | without good keys nothing runs | go on |
| G02 | only a version higher than any signed is sent | sign any |
| G03 | the whole check runs first | skip it |
| G04 | a failed check sends nothing | send anyway |
| G05 | what web-ext prints is masked | print it as it is |
| G06 | an unlisted signature, never a listing | listed |
| G07 | a failed upload keeps its exit code | report success |
| G08 | only the extension folder exactly as committed is sent | send any |
| G09 | a folder that changed during the check sends nothing | send it |
| G10 | an ignored file in the extension folder counts (web-ext packs it) | only tracked ones |
| G11 | web-ext's own upload id in the folder is allowed | refuse it |
| G12 | web-ext gets only the allowed environment | everything |
| G13 | the check gets no keys and no test redirect | everything |
| G14 | no web-ext config file is read | let it look |
| G15 | web-ext output is passed on as it comes | all at the end |
| G16 | web-ext saying yes with no new file is not a success | call it one |
| G17 | only the new signed file is named | name any |
| G18 | a key twice in .env is refused | take the first |
| G19 | a UTF-16 .env is refused with what to do | read it as nothing |
| G20 | an issuer of the wrong shape is refused before the check | send it |
| G21 | versions compare as numbers | as text |
| G22 | .env with a quoted value and a comment is read right | keep the quotes |
| G23 | an invisible character in a key is dropped | keep it |
| G24 | any case of ".env" is a key file | lower case only |

Not broken here: the one call in the mutation pass that leaves key files out of its copies
(the rule it calls is G24 and its own test); `.env.example` holding a value is refused
(`check-repo` test, seen red before its fix).
