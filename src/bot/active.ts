import type { Context } from 'telegraf';
import type { Search } from '../sources/types';
import { listSearches, getSearchById } from '../core/db';
import { fetchAllForSearch, enrichForSend } from '../sources';
import { matches } from '../core/match';
import { sendListing } from './notify';

const ACTIVE_LIMIT = 15;

function chatIdOf(ctx: Context): number | undefined {
  return ctx.chat?.id ?? ctx.from?.id;
}

function searchLabel(s: Search): string {
  const base = s.location?.label || s.label || 'חיפוש';
  return `#${s.id} · ${base}`.slice(0, 60);
}

/** /active — ask which search's current listings to show (or all). */
export async function sendActiveMenu(ctx: Context): Promise<void> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return;
  const searches = listSearches(chatId);
  if (searches.length === 0) {
    await ctx.reply('אין לך חיפושים עדיין. צרו אחד עם /newsearch');
    return;
  }
  const rows = searches.map((s) => [{ text: searchLabel(s), callback_data: `active:one:${s.id}` }]);
  if (searches.length > 1) {
    rows.push([{ text: '📋 כל החיפושים', callback_data: 'active:all' }]);
  }
  await ctx.reply('איזה חיפוש להציג? 🔎\n(התוצאות הפעילות כרגע, לא רק החדשות)', {
    reply_markup: { inline_keyboard: rows },
  });
}

async function showActiveForSearch(ctx: Context, chatId: number, search: Search): Promise<void> {
  const listings = await fetchAllForSearch(search);
  const hits = listings.filter((l) => matches(l, search));

  await ctx.reply(`🔎 חיפוש #${search.id} · ${search.location?.label || search.label} — ${hits.length} תוצאות פעילות`);
  if (hits.length === 0) return;

  const toShow = hits.slice(0, ACTIVE_LIMIT);
  await enrichForSend(toShow);
  for (const listing of toShow) {
    await sendListing(ctx.telegram, chatId, listing, { id: search.id, label: search.label }, { fav: 'add' });
  }
  if (hits.length > ACTIVE_LIMIT) {
    await ctx.reply(`…ועוד ${hits.length - ACTIVE_LIMIT} תוצאות. צמצמו את החיפוש כדי לראות פחות.`);
  }
}

/** Handle the /active menu buttons. Returns true if handled. */
export async function handleActiveCallback(ctx: Context): Promise<boolean> {
  const cq = ctx.callbackQuery;
  const data = cq && 'data' in cq && typeof cq.data === 'string' ? cq.data : '';
  if (!data.startsWith('active:')) return false;

  const chatId = chatIdOf(ctx);
  if (chatId === undefined) {
    await ctx.answerCbQuery();
    return true;
  }
  await ctx.answerCbQuery();

  let targets: Search[] = [];
  if (data === 'active:all') {
    targets = listSearches(chatId);
  } else if (data.startsWith('active:one:')) {
    const id = Number(data.slice('active:one:'.length));
    const s = Number.isInteger(id) ? getSearchById(id, chatId) : null;
    if (s) targets = [s];
  }

  if (targets.length === 0) {
    await ctx.reply('החיפוש לא נמצא. נסו שוב עם /active');
    return true;
  }

  await ctx.reply('🔎 שולף תוצאות פעילות… זה עלול לקחת כמה שניות.');
  for (const search of targets) {
    try {
      await showActiveForSearch(ctx, chatId, search);
    } catch (err) {
      console.error(`[active] failed for search ${search.id}:`, err instanceof Error ? err.message : err);
      await ctx.reply(`חיפוש #${search.id}: שגיאה בשליפת תוצאות.`);
    }
  }
  return true;
}
