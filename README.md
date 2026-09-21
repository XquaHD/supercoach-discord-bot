# SuperCoach EPL → Discord rollover watcher

Watches your SuperCoach EPL "My Team" data and posts to a Discord channel
the moment the gameweek rolls over — when LIVE/FINAL tags clear and prices,
projected price changes, and breakevens (BEs) update for the new week.

It runs for free on a schedule using GitHub Actions, so your computer
doesn't need to stay on.

## How it works

- SuperCoach's API tells the site's own frontend the round state
  (`competition.current_round` / `next_round` / `is_lockout`). This script
  polls that same API directly and fires a Discord message when
  `next_round` increments — exactly the moment the site clears LIVE/FINAL
  tags and recalculates prices for the new week.
- No browser automation, no password automation. SuperCoach's login goes
  through a third-party SSO with bot protection that blocks automated
  browsers, so instead you copy your own already-logged-in session out of
  your own real Chrome, once, by hand. The scheduled script then just makes
  plain API calls with that captured token — it never touches your
  password and never drives a browser.

## One-time setup

### 1. Get the code into a GitHub repo

```
git init
git add .
git commit -m "Initial commit"
```

Create a repository on GitHub (public or private both work — see note
below) and push this to it.

**Public vs private:** nothing sensitive ever lives in the repo files or
commit history; your session and webhook URL are only ever stored as
encrypted GitHub Secrets. If public, anyone can view your **Actions run
logs** (just plain lines like "No rollover yet", never your secrets), but
you get **unlimited free Actions minutes** — useful since private repos
only get 2,000 free minutes/month and this script checks every 5 minutes.

### 2. Capture your session (in your own real Chrome — no automation)

1. Open **www.supercoach.com.au** in your normal Chrome and make sure
   you're logged in and can see your "My Team" page.
2. Open DevTools: press **Cmd+Option+J** (Mac) or **Ctrl+Shift+J**
   (Windows), which opens straight to the **Console** tab.
3. Paste this snippet in and press Enter:

   ```js
   (function(){
     const ls = {};
     for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); ls[k]=localStorage.getItem(k); }
     const data = JSON.stringify({localStorage: ls}, null, 2);
     const blob = new Blob([data], {type:'application/json'});
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url; a.download = 'raw_session.json';
     document.body.appendChild(a); a.click(); a.remove();
     console.log('Downloaded raw_session.json — move it into your project folder.');
   })();
   ```

   (Chrome may ask to confirm the download — allow it.) This downloads
   `raw_session.json` to your Downloads folder.

4. Move that file into this project folder (next to `package.json`), then run:

   ```
   node convert_session.js
   ```

   This produces `auth_state.json`. **Treat it like a password** — don't
   commit it (already excluded by `.gitignore`).

### 3. Turn that session into a GitHub secret

```
# macOS
base64 -i auth_state.json | pbcopy

# Linux
base64 -w0 auth_state.json | xclip -selection clipboard

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("auth_state.json")) | Set-Clipboard
```

In your GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**

- Name: `SUPERCOACH_AUTH_STATE_B64`
- Value: paste the base64 text

You can now delete `raw_session.json` and `auth_state.json` locally.

### 4. Create a Discord webhook and add it as a secret

In Discord: the channel you want alerts in → **Edit Channel → Integrations
→ Webhooks → New Webhook** → copy its URL.

Add another repository secret:

- Name: `DISCORD_WEBHOOK_URL`
- Value: the webhook URL

### 5. Push, and you're done

```
git add .
git commit -m "Add SuperCoach watcher"
git push
```

The workflow in `.github/workflows/check.yml` runs automatically every 5
minutes. You can also trigger it manually from the repo's **Actions** tab
("Run workflow") to test it immediately — the very first run just saves a
baseline snapshot and won't post to Discord; the run *after* a real
rollover will.

## Session expired?

SuperCoach's token isn't forever-lived. If a run's log shows a "Session
expired or rejected (401)" error, just redo steps 2–3 above (capture a
fresh session, update the `SUPERCOACH_AUTH_STATE_B64` secret) — everything
else stays the same.

## Customizing

- **Check frequency**: edit the `cron` line in
  `.github/workflows/check.yml` (currently `*/5 * * * *` = every 5
  minutes; `*/10 * * * *` = every 10).
- **What's in the Discord message**: edit `check_and_notify.js` — the
  `squad` mapping controls which fields are shown per player, and the
  `content` block controls the message text/formatting.

## Files

- `convert_session.js` — turns a manually captured `raw_session.json` into
  `auth_state.json`.
- `check_and_notify.js` — the scheduled check; reads round state + your
  squad, diffs against the last run, and posts to Discord on rollover.
- `.github/workflows/check.yml` — the schedule that runs it in GitHub's
  cloud, for free.
