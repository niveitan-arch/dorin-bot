import { initDb } from './core/db';
import { startPolling } from './core/poller';
import { createBot } from './bot/bot';
import type { Telegraf } from 'telegraf';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// telegraf treats a Telegram 409 ("Conflict: terminated by other getUpdates
// request") as fatal: its polling loop re-throws it, bot.launch() rejects, and
// the process exits. During a deploy/pm2 restart the previous instance's poll
// can briefly linger, so the fresh instance hits a 409 and dies — which pm2
// restarts, re-overlapping, into a flapping "bot not responding" loop. Instead,
// ride out the transient conflict: wait for the stale poll to expire and relaunch.
async function launchWithRetry(bot: Telegraf): Promise<void> {
  const MAX_ATTEMPTS = 30; // ~2.5 min of 5s retries before giving up
  for (let attempt = 1; ; attempt++) {
    try {
      // dropPendingUpdates: don't replay a backlog accumulated while we were down.
      await bot.launch({ dropPendingUpdates: true });
      return; // resolves only on clean shutdown
    } catch (err) {
      const code =
        (err as { code?: number })?.code ??
        (err as { response?: { error_code?: number } })?.response?.error_code;
      if (code === 409 && attempt < MAX_ATTEMPTS) {
        console.error(
          `[launch] Telegram 409 conflict (another poller still active) — retrying in 5s (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
        await wait(5000);
        continue;
      }
      throw err;
    }
  }
}

async function main(): Promise<void> {
  initDb();

  const bot = createBot();

  // The scraper poller only needs bot.telegram to SEND messages (independent of
  // the Telegram long-poll), so start it once here — NOT inside a launch callback
  // that could re-run on a 409 retry and spawn duplicate intervals.
  startPolling(bot.telegram);
  console.log('dorin-bot started');

  await launchWithRetry(bot); // keeps the process alive until shutdown
}

main().catch((err) => {
  console.error('Fatal error starting dorin-bot:', err);
  process.exit(1);
});
