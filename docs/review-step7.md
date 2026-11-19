# Step 7 review findings, signing (2026-11-19)

Four blind reviews (security; correctness; design and test quality together, for a 300-line
change: told the user; wording) of the first signing command. Every finding was checked against
the code or web-ext 10.8's own source. All real ones are fixed, test first where a test can
reach them.

| # | Finding | From | Fix |
|---|---|---|---|
| 1 | The mutation pass copied the whole project, `.env` included, into %TEMP% for every break (a few hundred copies a run) | S C | one rule for key files (`repo_rules.isSecretFile`); every copy leaves them out |
| 2 | `.env.example`, open in Notepad, read as the place to write the keys; with no `.env` yet the secret would not be found | W S | it says not to, and the repo check fails on any value in it |
| 3 | "Claude checks `.env`" invited reading it | W S | `sign.cmd --keys` checks by names only; Claude never opens `.env` |
| 4 | Masking and the keys' path were proven only against a fake; one plausible edit printed them | D S C | `sign-run` test: the real seams, a throwaway git project, a fake web-ext |
| 5 | The main-guard came back (the junction lesson): through a junction, sign.cmd exited 0 doing nothing | D C S | rules in `sign_rules.mjs`; `sign.mjs` always runs and no test imports it |
| 6 | web-ext's output was held until it ended: minutes of silence, and lost on Ctrl+C | W D C | streamed, masked line by line |
| 7 | web-ext got the whole environment and read config files (another host, extra uploads) | D S C | allow-listed environment, `--no-config-discovery`; the check gets no WEB_EXT_* or GTAB_* |
| 8 | Signing the working copy: unreviewed edits, ignored files packed, changes between check and upload | D S C | only the folder exactly as committed, checked again after the check |
| 9 | Only an equal version was refused, and only while its file was there | D | refused unless higher than any signed; compared as numbers |
| 10 | "No new file" and "only the new file" had no test | D C | tests and breaks G16, G17 |
| 11 | web-ext writes `extension/.amo-upload-uuid`, untracked and unrecorded | D S C | gitignored, allowed by name, in the security pass |
| 12 | A run that fails halfway had no way back; "Nothing was installed" misled | D C W | the message and the runbook say how to recover; a half-written file is named |
| 13 | `.env` read: a quoted value with a comment kept its quotes; a name twice, UTF-16, a swapped pair found only after the check | S D C | `parseEnv` fixed; each refused before the check, with what to do |
| 14 | Keys accepted from the environment (a `setx` variable reaches every shell) | S | `.env` only |
| 15 | Wording: no first-time steps, jargon ("gate"), no full paths, Notepad's `.env.txt`, "unlisted" unexplained, a double-click closed the window | W | the runbook's "First time"; plain messages with full paths; `.env.txt` found and named; `pause` on a double-click |
| 16 | Stale comments (check.mjs, the mutation header, a repeated sentence) | D C W | fixed |

Accepted, with the reason: a process of the same user can read web-ext's environment while it
runs (better than the command line, which is shown and logged); the mutation pass's one call to
`isSecretFile` has no test of its own (the rule has); Mozilla's exact replies (a reused upload, a
version it already has) are not known before the first real run.
