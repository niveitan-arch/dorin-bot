# dorin-bot

A personal Telegram bot that watches **Yad2** for new apartment listings matching your
saved searches and pushes them to you (and a few friends) the moment they appear.

Each user registers one or more searches (region, optional city, rooms, price, rent/sale,
broker-or-private). A poller checks every few minutes, deduplicates listings, matches them
against each active search, and sends new hits straight to the right Telegram chat.

> Built to run inside **WSL (Ubuntu)** with Node installed via `nvm`. Yad2 is protected by
> the ShieldSquare anti-bot, so the bot reuses a browser session you solve **once** by hand.

## Setup

```bash
# (Node via nvm, inside WSL)
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `.env`:

- **`TELEGRAM_BOT_TOKEN`** — message [@BotFather](https://t.me/BotFather), send `/newbot`, copy the token.
- **`ALLOWED_CHAT_IDS`** — comma-separated numeric chat ids allowed to use the bot (you + friends).
  Get yours from [@userinfobot](https://t.me/userinfobot).
- **`POLL_INTERVAL_MIN`** — minutes between checks (default `4`).

## One-time Yad2 login (important)

Yad2 blocks bots with a captcha. Solve it **once** in a real browser window; the session is
saved to `data/yad2-profile/` and reused by the headless bot afterwards.

```bash
npm run yad2:login     # opens a visible Chromium window (via WSLg)
```

Solve the captcha until you see real apartment listings, then it saves and closes.
Redo this if the bot later logs `Yad2 is showing the anti-bot captcha` (session expired).

### Confirm scraping works

```bash
npm run scrape:yad2    # prints listings for a sample Tel-Aviv search, no Telegram needed
```

## Run the bot

```bash
npm run dev            # run from source via tsx
# or: npm run build && npm start
```

> Stop the bot before running `yad2:login` — both use the same browser profile, which only
> one process can open at a time.

## Keeping it running 24/7 (always-on hosting)

The bot is a **single Node process**: it handles Telegram replies *and* the Yad2 polling in
one program. While it runs on this PC, **if the computer sleeps/shuts down or WSL stops, the bot
is fully offline** — no replies, no alerts. To run it around the clock, move it to an always-on
host and add auto-restart:

- **Mini-PC / spare always-on laptop (recommended, easiest).** Same WSL/Ubuntu + Node setup as
  here. Wrap it with `pm2` (`pm2 start "npm run dev" --name dorin && pm2 save && pm2 startup`) or a
  systemd service so it auto-restarts on boot/crash. Keeps the residential IP (low anti-bot risk)
  and the headed `yad2:login` captcha-solve workflow.
- **Raspberry Pi 4/5.** Cheap and low-power; Playwright/Chromium runs on ARM64 but setup is a bit
  more involved.
- **Cheap VPS (e.g. Hetzner).** Truly always-on, but a datacenter IP raises Yad2's anti-bot risk
  vs. a home connection, and the one-time captcha solve needs a headed/VNC session.

Tuning knobs in `.env` for reliability: `YAD2_NAV_TIMEOUT_MS` (per-page load timeout, default
`20000`) and `YAD2_IDLE_CLOSE_MS` (how long to keep the browser warm between operations, default
`90000`).

## Telegram commands

- `/start` — register your chat and show help.
- `/newsearch` — guided wizard: deal type → region → (optional) city → rooms → price → broker.
- `/mysearches` — list your saved searches and on/off status.
- `/pause <id>` / `/resume <id>` — toggle a search without deleting it.
- `/delete <id>` — delete a search.
- `/cancel` — abort the active wizard.
- `/help` — command list.

## Supported regions

Confirmed Yad2 area slugs: `tel-aviv-area`, `center-and-sharon`, `jerusalem-area`, `south`
(see `YAD2_REGIONS` in `src/sources/yad2.ts`). Haifa/North/Judea-Samaria slugs differ and are
a TODO. The optional **city** field narrows results within the chosen region.

## Debugging Yad2 changes

If Yad2 changes its page structure and listings stop coming through:

```bash
npm run debug:yad2     # logs page/block status + JSON responses
npm run debug:next     # dumps __NEXT_DATA__ structure to data/yad2-next.json and maps arrays
```

The listings live in `__NEXT_DATA__.props.pageProps.feed.{private,agency,platinum}`; the
parser is in `src/sources/yad2.ts`.
