# HANDOFF.md — stand up dorin-bot on a new machine

Everything durable lives in this repo. A fresh `git clone` + this runbook reconstitutes the bot. Only
**two things are carried by hand** (never in git): the **bot token** and the **one-time captcha solve**.

## What travels how

| Thing | Where it lives | How it moves |
|---|---|---|
| Code, scripts, catalogs, allowlist | this repo | `git clone` |
| Saved searches + favorites | `data/dorin.db.seed` (committed) | `cp data/dorin.db.seed data/dorin.db` |
| Bot token + config | `.env` (gitignored) | **copy by hand** from the old machine / @BotFather |
| Yad2 login cookie | `data/yad2-profile/` (gitignored, per-OS) | **not portable** — recreate via `yad2:login` |
| Project context for Claude | `CLAUDE.md` (committed) | auto-loaded on clone |

## Prerequisites (per OS)

- **Node 24** via `nvm`: `nvm install 24 && nvm use 24`.
- **macOS:** `xcode-select --install` (compiler for the native `better-sqlite3`). **Linux/WSL:** build
  tools usually present; WSLg gives the headed captcha window.
- `npm i -g pm2`.

## Stand-up steps

```bash
git clone git@github.com:niveitan-arch/dorin-bot.git
cd dorin-bot

npm install                       # rebuilds native better-sqlite3 for this OS — never copy node_modules
npx playwright install chromium   # per-OS browser download

cp .env.example .env              # then fill it in (see below)
cp data/dorin.db.seed data/dorin.db   # restore saved searches + favorites

npm run yad2:login                # headed window — solve the captcha until real listings show
npm run scrape:yad2               # smoke test: prints listings, no Telegram needed
```

### `.env` values (copy from the old machine — the token is NOT in git)

- `TELEGRAM_BOT_TOKEN` — from the old `.env`, or @BotFather.
- `ALLOWED_CHAT_IDS` — optional; the whitelist mainly lives in `config/allowlist.json` now. Safe to leave
  as the old value (it's unioned with the file).
- `POLL_INTERVAL_MIN` (default 4), `INITIAL_MATCHES_LIMIT` (10), `YAD2_NAV_TIMEOUT_MS` (20000),
  `YAD2_IDLE_CLOSE_MS` (90000) — optional tuning; defaults are fine.

## Run always-on (pm2)

```bash
pm2 start npm --name dorin-bot -- run dev
pm2 save
pm2 startup                       # run the printed sudo … line so it survives reboot
```

macOS: keep it awake on power — `sudo pmset -c sleep 0 disablesleep 1` (or a `caffeinate -ims` under pm2).

### Auto-deploy (optional, for the dev→git→runtime flow)

If this machine is the runtime and you'll keep editing from elsewhere, run the pull loop so pushes deploy
themselves (~3 min):

```bash
pm2 start ./auto-deploy.sh --name auto-deploy --no-autorestart
pm2 save
```

`auto-deploy.sh` is a self-contained `sleep 180` loop that fetches and runs `deploy.sh` on a new commit.
(Do NOT use pm2 `--cron-restart` — it once leaked onto sibling processes and caused a crash loop.)

## Cutover (CRITICAL — single instance)

Only ONE process may poll the token. **Before** starting the new machine's bot, **stop the old one**
(`pm2 delete dorin-bot auto-deploy` on the old host), or you'll get Telegram 409 conflicts + double-sends.

## Before you migrate: refresh the seed on the CURRENT runtime (Mac)

The committed seed can lag behind live data. On the machine currently running the bot, fold the live DB
into the committed seed so a new clone gets the latest searches/favorites:

```bash
cd ~/dorin-bot
pm2 stop dorin-bot
sqlite3 data/dorin.db 'PRAGMA wal_checkpoint(TRUNCATE);'   # or a node better-sqlite3 one-liner
cp data/dorin.db data/dorin.db.seed
pm2 start dorin-bot
./ship.sh "refresh db seed"
```

## Verify

- `npm run scrape:yad2` returns listings (native build + Playwright + session all OK).
- `pm2 logs dorin-bot` shows `dorin-bot started`, no 409 loop, no captcha errors.
- In Telegram: `/mysearches` lists the migrated searches; `/newsearch` location step responds.
