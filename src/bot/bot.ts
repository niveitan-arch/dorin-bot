import { Telegraf } from 'telegraf';
import { config } from '../config';
import { isAllowed } from '../core/db';
import { registerCommands } from './commands';

/**
 * Create and configure the Telegraf bot:
 *  - whitelist middleware via isAllowed()
 *  - command/wizard handlers from commands.ts
 *  - graceful shutdown on SIGINT/SIGTERM
 */
export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  // Whitelist middleware: stop anything from non-allowed chats.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || !isAllowed(chatId)) {
      try {
        await ctx.reply('אין לך הרשאה');
      } catch {
        // Ignore reply failures (e.g. blocked bot).
      }
      return; // stop: do not call next()
    }
    return next();
  });

  registerCommands(bot);

  // Graceful stop.
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}
