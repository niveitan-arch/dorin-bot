# CLAUDE.md — operational context for dorin-bot

Personal Telegram bot that watches **Yad2** for new apartment listings matching saved searches and
pushes them to the owner + a few whitelisted friends. Node/TypeScript, Playwright (scraping), Telegraf
(bot), better-sqlite3 (storage). Rules/regex parsing, no LLM. For a small private group — no billing,
no web frontend.

## Two-machine model (READ FIRST)

This is developed on one machine and **run on another**. They never talk directly — **GitHub is the only
transport**.

- **Dev box (Windows + WSL/Ubuntu):** code + git only. **NEVER run the live bot here.**
- **Always-on Mac:** the **sole runtime**, under `pm2`. Has its own live `data/dorin.db` and
  `data/yad2-profile/`.

**Single-instance rule:** only ONE process may long-poll the Telegram token. Two ⇒ Telegram 409 +
double-sends. So the live bot runs *only* on the Mac.

**DB + profile are per-machine** (gitignored). Only **code** moves between machines. The committed
`data/dorin.db.seed` is how saved searches migrate to a fresh host (`cp data/dorin.db.seed data/dorin.db`).

## Running commands in WSL

WSL has **no system Node** — it's under `nvm` (Node 24). Non-interactive shells don't auto-load it, so
prefix commands with the PATH:

```bash
wsl -d Ubuntu -- bash -lc 'export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"; cd $HOME/dorin-bot && <cmd>'
```

Gotchas: nested `$(…)` command-substitutions sometimes lose the cwd over the WSL mount → prefer flat
commands. Typecheck gate: `./node_modules/.bin/tsc --noEmit`.

## Deploy flow (edit on WSL → live on Mac)

```bash
./ship.sh "commit message"     # commit + git pull --rebase + push   (WSL)
```

The Mac's `auto-deploy.sh` (a `sleep 180` poll loop under pm2, NOT pm2 cron — that leaked and caused a
crash loop once) fetches every ~3 min and, on a new commit, runs `deploy.sh`: `git pull` → `npm install`
→ `tsc --noEmit` gate → `pm2 restart dorin-bot --update-env` → `pm2 save`. So: ship from WSL, live on the
Mac within ~3 min, from any network. **Before pushing, `git fetch` + read incoming diffs** — the Mac also
pushes fixes; never ship blind over a divergent remote.

## Yad2 scraping + anti-bot session (the hard part)

- Listings are SSR'd into `__NEXT_DATA__.props.pageProps.feed.{private,agency,platinum}` (~43/page).
  Accurate amenities come from each item's **detail page** `__NEXT_DATA__ …dehydratedState.queries[]
  .state.data.inProperty` (`includeParking/Elevator/SecurityRoom/Balcony`) — the feed `tags[]` are sparse
  and unreliable. Enrichment runs only on the bounded set of cards actually being sent.
- **Anti-bot:** Yad2 sits behind ShieldSquare/Radware (redirects to `validate.perfdrive.com`). Solved
  **once** by hand via `npm run yad2:login` (headed window, solve captcha), which writes the persistent
  `data/yad2-profile/`; headless fetches reuse those cookies. All browser work is serialized through
  `withYad2Context` (src/sources/yad2-session.ts) — the profile can only be opened by one process at a time.
- **Location autocomplete** (`gw.yad2.co.il/address-autocomplete/realestate?text=`) is now also behind the
  wall. `src/sources/yad2-location.ts` uses a **hybrid**: fast cookie-less `fetch` first, and on a 302/HTML
  block, falls back to the same URL **inside the logged-in browser context** (carries the cookies). If BOTH
  fail → session expired → re-run `yad2:login` on the Mac.
- **Session-down alert:** when a fetch hits the wall the poller DMs the **owner** once
  (src/core/session-alert.ts) with the re-login steps, and an all-clear when it recovers.

Re-login (on the Mac) when the bot logs the captcha / the owner gets the alert:
```bash
cd ~/dorin-bot && pm2 stop dorin-bot && npm run yad2:login   # solve captcha → close
pm2 start dorin-bot
```

## Whitelist

Union of **`config/allowlist.json`** (git-tracked, non-secret — `chatIds` + an `owner` id) and `.env`
`ALLOWED_CHAT_IDS`. **Add a user via the file + `./ship.sh`** (no per-machine `.env` edit). `owner` gets
operational alerts; falls back to the first allowed id. Read in `src/config.ts` (`parseAllowlistFile`).

## Layout

- `src/sources/` — `yad2.ts` (fetch + enrich), `yad2-location.ts` (autocomplete), `yad2-session.ts`
  (`withYad2Context`, `pageIsBlocked`, `Yad2BlockedError`), `hood-catalog.ts` (per-city neighborhood
  catalogs: TLV 5000, Ramat Gan 8600, Givatayim 6300, Beer Sheva 9000), `index.ts` (`fetchAllForSearch`,
  `enrichForSend`), `madlan.ts` (stub).
- `src/core/` — `db.ts` (better-sqlite3; `seen_listings` PK=(search_id,fingerprint); `favorites` +
  `listing_cache`), `poller.ts`, `match.ts`, `dedup.ts`, `session-alert.ts`.
- `src/bot/` — `bot.ts`, `commands.ts`, `wizard.ts` (dealType→location→rooms→price→size→floor→amenities→
  broker→label; catalog cities show a multi-select neighborhood picker), `notify.ts` (cards + ⭐ favorite
  button), `favorites.ts`, `active.ts`.
- Root scripts: `ship.sh` (WSL), `deploy.sh` + `auto-deploy.sh` (Mac).

## Commands

`/newsearch` `/mysearches` `/active` (re-show a search's current listings) `/favorites` (⭐)
`/pause <id>` `/resume <id>` `/delete <id>` `/cancel` `/help`. Multi-neighborhood searches fetch ONE
Yad2 URL per neighborhood id (comma-multi is broken) and merge/dedup.

## Conventions

- New DB tables are additive (`CREATE TABLE IF NOT EXISTS`) — never reset live data. A *schema change to
  an existing table* would need a `data/dorin.db` reset (throwaway) + restart.
- Amenity filters on Yad2 are sparse — requiring them can yield few/0 results (data quality, not a bug).
- See **HANDOFF.md** for standing the bot up on a brand-new machine.
