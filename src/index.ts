import { initDb } from './core/db';
import { startPolling } from './core/poller';
import { createBot } from './bot/bot';

async function main(): Promise<void> {
  initDb();

  const bot = createBot();

  // bot.launch() resolves only once the bot stops, so it must not block
  // startPolling. We start polling from the launch-ready callback and then
  // await launch (which keeps the process alive until shutdown).
  await bot.launch(() => {
    startPolling(bot.telegram);
    console.log('dorin-bot started ✅ (auto-deploy test)');
  });
}

main().catch((err) => {
  console.error('Fatal error starting dorin-bot:', err);
  process.exit(1);
});
