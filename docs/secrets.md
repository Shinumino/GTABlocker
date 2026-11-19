# The signing keys: what they are, where they live, how to change them

## What they are

Two values from your Mozilla account (the one you log in with on addons.mozilla.org):

| Name in `.env` | Mozilla calls it | What it does |
|---|---|---|
| `WEB_EXT_API_KEY` | JWT issuer (looks like `user:<number>:<number>`) | names the account |
| `WEB_EXT_API_SECRET` | JWT secret (a long random string) | proves it is the account |

Together they let a program act on addons.mozilla.org as you: upload and sign add-ons. Anyone
holding both can do the same, so they never go into a commit, a chat, a screenshot or a log.

"Unlisted" (what `sign.cmd` asks for) means Mozilla signs the add-on but does not publish it: it
never appears on addons.mozilla.org, and only you have the file. Mozilla keeps a copy of what
was sent. Mozilla's own pages call this "self-distribution", or "On your own".

## First time

1. In Firefox, open https://addons.mozilla.org/en-US/developers/addon/api/key/ and log in with
   your Mozilla account (or create one there). If the page says it is not found, open
   https://addons.mozilla.org/en-US/developers/ first, log in, and accept the Firefox Add-on
   Distribution Agreement when Mozilla shows it (it may come when you click "Submit a New
   Add-on": accept it, then leave without uploading anything). Then open the key page again.
2. Click "Generate new credentials". Mozilla shows the JWT issuer and the JWT secret. Keep the
   page open.
3. Open a new, empty Notepad and type two lines, each value pasted right after its `=`, with no
   spaces and no quotes:
   ```
   WEB_EXT_API_KEY=<the JWT issuer>
   WEB_EXT_API_SECRET=<the JWT secret>
   ```
4. File, Save as: the project folder (`D:\Users\Shinumino\VS_CODE Projects\GTABlocker`), "Save
   as type" **All files (\*.\*)** (else Notepad saves `.env.txt`), name `.env`, Save. Never write
   the keys in `.env.example`: it is part of the project, and `check.cmd` fails if it ever holds
   a value.
5. Windows keeps what you copied (Win+V shows it): clear it there if you like.
6. In the project folder, right-click, "Open in Terminal", and type `sign.cmd --keys`. It says
   whether both keys are there and look right, never their values.
7. When you want to sign: `sign.cmd`. It runs the full check first (a few minutes), then sends
   the add-on to Mozilla, which can take several more minutes: keep the window open.
8. To install the signed file it names: in Firefox open `about:addons`, click the gear icon,
   choose "Install Add-on From File...", pick the file, and click Add.

## Where they live, and who reads them

- In `.env` in the project folder, which you write. Never in the environment: a variable there
  reaches every program and shell you start.
- `.env` is left out of git, and `check.cmd` fails if it is ever added, or if a file that would
  be committed or uploaded holds a key-shaped value or the keys' values.
- Read by `sign.cmd` (to sign: the keys go to web-ext through its environment only, never its
  command line, and are masked in everything it prints) and by the repo check (to make sure no
  other file holds them). Neither prints them.
- Claude never opens `.env`. To check it: `sign.cmd --keys`.
- Copies of the project (the mutation pass, review snapshots) leave `.env` out.

## What breaks when they change

Nothing in the add-on: an installed, signed add-on keeps working with no keys at all. Only
signing a new version needs them.

## To change them (rotation)

1. On the key page, click "Revoke and regenerate credentials". The old pair stops at once.
2. Replace both lines in `.env` with the new values (replace, do not add: `sign.cmd` refuses a
   name written twice).
3. Run `sign.cmd --keys`, then `check.cmd`: both must pass.

Nothing else holds them: there is no CI and no other copy.

## If they leak (pasted somewhere, committed, shown on screen)

1. Revoke them at once (step 1 above), then steps 2 and 3.
2. Open your add-ons list in Mozilla's Developer Hub and look for any add-on or version you did
   not send. The add-on already installed in your Firefox is not affected.

## If a signing run stops halfway

If `sign.cmd` stops after "Sending the add-on to Mozilla" (an error, the window closed), Mozilla
may already have that version: Mozilla signs each version only once. If a link was printed, the
signed file can be downloaded there once it is ready. Otherwise set a higher "version" in
`extension\manifest.json`, commit it, and run `sign.cmd` again.
