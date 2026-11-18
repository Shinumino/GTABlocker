# Mutation pass, step 1 (2026-11-18)

Each rule of the harness was broken on purpose, one at a time, in a throwaway copy of the
project, and the tests that should catch it were run with plain `node --test` (never through
the copy's own `tools/test.mjs`, so a broken runner cannot judge itself). Rerun with
`node tools/mutation-pass.mjs`.

**Result: 60 breaks, 59 turned a test red, 1 stayed green by design (M58, explained below).**
An unbroken copy was green first, so every red here comes from the break.

| # | Rule | Break | Turned red | Why that test is enough |
|---|---|---|---|---|
| M01 | Marionette's length prefix counts UTF-8 bytes | count characters | a message is its UTF-8 byte length... | it encodes "é" (2 bytes, 1 character) |
| M02 | a message split anywhere comes out whole | drop the start of the next message | three messages split at any byte... | it cuts at every byte, with a message after the cut |
| M03 | bodies are decoded as UTF-8 | decode as latin1 | a message split at any byte... | the test text has accents and an emoji |
| M04 | a stream that is not Marionette fails at once | drop the no-prefix check | a stream that is not Marionette fails at once... | it feeds an HTTP line, which has no colon |
| M05 | a frame that is not a reply does not crash | drop the reply-shape check | a frame that is not a reply fails the pending command... | the fake server sends an object, not [1, id, error, result] |
| M06 | a close before the hello fails at once | drop that reject | a connection that closes before the hello... | it also times the failure (under 2 s of a 5 s limit) |
| M07 | replies reach the command they answer | answer the oldest waiter | replies reach the command they answer, even out of order | the fake server answers the second command first |
| M08 | an error reply rejects | ignore errors | an error reply rejects with the command and the error | it checks the command name and the message |
| M09 | a request stays inside its own site folder | prefix check without the separator | a request can never reach a file outside its own site folder | it asks for the sibling folder www.youtube.com.br |
| M10 | the hostname ".." is refused | drop the leading-dot check | the hostname ".." alone is refused... | the test root is deep, so an escape lands on a real path |
| M11 | hostnames are matched without case | drop toLowerCase | a hostname picks its own folder... | it asks for WWW.Reddit.com |
| M12 | no request reaches a file outside the fixtures | drop the containment check | a request can never reach a file outside... | `%5c` (a backslash) is not cleaned up by the URL parser |
| M13 | secret values are found in UTF-16 | drop the UTF-16 search | the real secret values are refused in UTF-8 and UTF-16... | one file holds the secret only in UTF-16 |
| M14 | every .env file is refused | refuse only ".env" | any .env file is refused, except .env.example | it tries .env.local and .env.production |
| M15 | no piece of a secret is printed | print 8 characters of it | the real secret values are refused... and no piece... | it looks for every 8-character run of the secret |
| M16 | a too-short secret is ignored | minimum length 0 | a secret too short to be real is ignored... | an empty value would match every file |
| M17 | the .env file is searched too | read the environment only | both the environment and .env are searched... | the two hold different values |
| M18 | `export KEY=` lines are read | drop export support | .env lines are read the way people write them | one line starts with export |
| M19 | a trailing # comment is not part of the value | keep the comment | .env lines are read the way people write them | one unquoted value has a comment, one quoted value has a # inside |
| M20 | staged copies are checked | skip them | what is staged is checked too... | the key exists only in git's index |
| M21 | every file under extension/ is checked | skip the folder walk | every file under extension/ is checked... | the file is in .gitignore |
| M22 | new files are listed | drop `--others` | the file list is what git would pick up... | one file is new and unstaged |
| M23 | a git failure fails the check | swallow git errors | outside a git repository the check fails... | it runs in a folder with no repository |
| M24 | an API key shape is found in UTF-16 | latin1 only | something shaped like a Mozilla add-ons API key is refused... | one copy is UTF-16 |
| M25 | the command exits 1 on a problem | exit 0 | the command fails on a staged .env... | it runs the real command on a real repository |
| M26 | a git failure says what to do | rethrow (stack trace) | the command says what to do when the folder is not a git repository | it checks for "git init" and for no stack trace |
| M27 | a run where no test ran is red | drop the zero-tests check | a narrow run whose file pattern matches no file is red | a glob that matches nothing runs 0 tests (added after the first pass found this rule untested) |
| M28 | a file with no test in it is red | drop the empty-file check | test files that hold no test are red too | Node reports such a file as 1 passing test |
| M29 | a suite with no files is red | empty suite passes | a suite with no test files is red... | the micro folder is empty |
| M30 | macro runs only after a green micro | always run both | a red micro suite fails the run and the macro suite never starts | the macro test leaves a mark file if it runs |
| M31 | a red suite fails the run | ignore the exit status | a red micro suite fails the run... | the micro test throws on purpose |
| M32 | a run started inside a test still runs | keep NODE_TEST_CONTEXT | a run started from inside another test still runs its tests | it runs with that variable set, and checks the mark file |
| M33 | a hanging test is stopped | no time limit | a test that never ends is stopped and counted red | the limit is 3 s there; without it the run hangs |
| M34 | test.cmd passes the exit code on | the old if-block layout | test.cmd passes the exit code on... | it runs the real test.cmd through cmd.exe |
| M35 | cheap gate steps run first | lint before micro | the cheap steps run first... | stubs log the order |
| M36 | the first red step stops the gate | carry on | a red first step stops the gate... | the log must hold only "repo" |
| M37 | a missing tool is red before any step | drop the web-ext check | a missing tool is red before any step runs... | no step may have run |
| M38 | a hanging gate step is stopped | no time limit | a step that hangs is stopped and counted red | the limit is 2 s there |
| M39 | a child older than its parent is not ours | any child of ours is ours | a child is never picked when it is older than its parent | the made-up table has exactly that case |
| M40 | a lock holder must be firefox.exe | any lock holder | whoever holds the profile lock is picked only when it is a firefox.exe | an antivirus holds the lock too |
| M41 | a reused process id is not ours | match by id only | a reused process id is not ours... | same id, newer start time |
| M42 | a restarted browser is found through its dead parent | drop that link | after a restart, the new browser is found through its parent... | bare command line, no lock, parent gone |
| M43 | a child born after its parent was seen gone is not ours | drop that bound | a process born after our parent was seen gone is not its child | start time after goneSince |
| M44 | a child of a reused parent id must be older than the holder | drop that bound | a child of a dead parent whose id is now held by someone else... | one child is older than the holder, one newer |
| M45 | stopping fails loudly when a process will not die | never throw | stopping fails loudly and keeps the profile... | the fake process never dies |
| M46 | a browser caught mid-restart is stopped | drop the settle look | a browser that appears during the final check is stopped too | the fake shows it only on the second look |
| M47 | a profile that cannot be deleted fails loudly | swallow the error | deleting a profile that something still holds fails loudly | a real process holds the folder as its working folder |
| M48 | only harness profiles are ever deleted | drop the name guard | deleting refuses a folder that is not a harness profile | a real temp folder with another name |
| M49 | kill only the exact process (id and start time) | kill by id only | killing touches only the exact process... | one id now has a newer start time |
| M50 | a profile still in use is not swept | sweep regardless of owner | profiles left by a test run that died are swept; one still in use is not | one owner is alive, one is not |
| M51 | a harness profile name is exact | loosen the pattern | a profile folder that is not a harness profile is refused... | it tries a short name and the user's real profile path |
| M52 | a failed start leaves no profile | drop the cleanup | a Firefox that cannot be started leaves no profile behind | a missing firefox.exe, real start code |
| M53 | the fixture server closes even when quit throws | no finally | the fixture server is closed even when quitting Firefox throws | plain node --test, so a left-open server hangs it |
| M54 | no extension code reaches the network | add a fetch | no extension code reaches the network | it scans every script in extension/ |
| M55 | no unagreed permission | ask for "tabs" | the manifest asks for no permission beyond the agreed ones | an allow-list, not a deny-list |
| M56 | the content script runs on a page | remove the marker line | the extension runs on a YouTube page | the fixture page sets no marker itself |
| M57 | test pages never come from the internet | drop network.dns.forceResolve | both tests in extension-loads | the real hosts on a random port never answer |
| M58 | a restarted browser is still tracked | drop the lock AND the dead-parent link | **stayed green, by design** | a third path still finds it: while the old browser is alive it is the new one's parent, and the test looks often enough to see that. Each path has its own micro test (M40, M42, M39) |
| M58b | a restarted browser is still tracked | drop the lock AND every child link | quit stops a Firefox that restarted itself... | with all three paths gone, the restarted browser escapes and the test sees it. The escaped browser was then stopped by the real sweep |
| M59 | quit stops what did not stop by itself | never kill | quit stops a Firefox that restarted itself... | nobody asks the restarted browser to quit |

Not covered by a break, and why:
- The WMI and Restart Manager queries themselves (`readProcessTable`): the macro tests run
  them for real on every start and stop, and M58b shows the end-to-end result.
- `network.trr.mode` (DNS over HTTPS off): it is already off on this machine, so removing the
  pref changes nothing a test can see. Kept as a precaution, and said so in `firefox.mjs`.
