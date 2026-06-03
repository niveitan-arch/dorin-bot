import { Telegraf } from 'telegraf';
import { config } from './config';
import { yad2 } from './sources/yad2';
import { matches } from './core/match';
import { sendListing } from './bot/notify';
import type { Search } from './sources/types';

// Proves the whole pipeline end to end (no DB / no wizard): scrape Yad2 -> parse
// -> match -> deliver formatted cards to the first allowed chat.
async function main() {
  const chatId = config.allowedChatIds[0];
  if (!chatId) throw new Error('No ALLOWED_CHAT_IDS configured.');

  const telegram = new Telegraf(config.telegramBotToken).telegram;
  const me = await telegram.getMe();
  console.log(`[e2e] bot connected: @${me.username}`);

  const search: Search = {
    id: 0,
    chatId,
    label: 'E2E test',
    location: { label: 'תל אביב יפו', base: { topArea: 2, area: 1, city: 5000 }, neighborhoods: [] },
    minRooms: 2,
    maxRooms: 4,
    minPrice: null,
    maxPrice: 8000,
    minSizeSqm: null,
    minFloor: null,
    maxFloor: null,
    parking: false,
    elevator: false,
    shelter: false,
    balcony: false,
    dealType: 'rent',
    brokerOk: true,
    active: true,
  };

  console.log('[e2e] fetching Yad2...');
  const listings = await yad2.fetch(search);
  const hits = listings.filter((l) => matches(l, search));
  console.log(`[e2e] ${listings.length} fetched, ${hits.length} match the filter`);

  await telegram.sendMessage(
    chatId,
    `✅ בדיקת dorin-bot: התחברתי כ-@${me.username} ושלפתי ${hits.length} דירות תואמות מ-yad2. הנה דוגמאות:`
  );

  for (const listing of hits.slice(0, 2)) {
    await sendListing(telegram, chatId, listing);
  }
  console.log('[e2e] sent sample cards. Done.');
}

main().catch((err) => {
  console.error('[e2e] failed:', err);
  process.exit(1);
});
