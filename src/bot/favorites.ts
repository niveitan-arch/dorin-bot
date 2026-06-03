import type { Context } from 'telegraf';
import { addFavorite, removeFavorite, getFavorites } from '../core/db';
import { sendListing } from './notify';

const FAVORITES_LIMIT = 30;

function chatIdOf(ctx: Context): number | undefined {
  return ctx.chat?.id ?? ctx.from?.id;
}

/** Handle the ⭐ add / 🗑️ remove buttons on listing cards. Returns true if handled. */
export async function handleFavoriteCallback(ctx: Context): Promise<boolean> {
  const cq = ctx.callbackQuery;
  const data = cq && 'data' in cq && typeof cq.data === 'string' ? cq.data : '';
  if (!data.startsWith('fav:')) return false;

  const chatId = chatIdOf(ctx);
  if (chatId === undefined) {
    await ctx.answerCbQuery();
    return true;
  }

  if (data.startsWith('fav:add:')) {
    const fp = data.slice('fav:add:'.length);
    addFavorite(chatId, fp);
    await ctx.answerCbQuery('נוסף למועדפים ⭐');
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '🗑️ הסר ממועדפים', callback_data: `fav:rm:${fp}` }]],
      });
    } catch {
      /* message too old to edit — ignore */
    }
    return true;
  }

  if (data.startsWith('fav:rm:')) {
    const fp = data.slice('fav:rm:'.length);
    removeFavorite(chatId, fp);
    await ctx.answerCbQuery('הוסר ממועדפים');
    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [[{ text: '⭐ הוסף למועדפים', callback_data: `fav:add:${fp}` }]],
      });
    } catch {
      /* ignore */
    }
    return true;
  }

  await ctx.answerCbQuery();
  return true;
}

/** /favorites — show the user's starred listings, each with a remove button. */
export async function sendFavorites(ctx: Context): Promise<void> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return;
  const favs = getFavorites(chatId);
  if (favs.length === 0) {
    await ctx.reply('אין לך מועדפים עדיין ⭐\nסמנו דירות עם הכפתור "⭐ הוסף למועדפים" שמופיע מתחת לכל כרטיס.');
    return;
  }
  await ctx.reply(`⭐ המועדפים שלך (${favs.length}):`);
  for (const listing of favs.slice(0, FAVORITES_LIMIT)) {
    await sendListing(ctx.telegram, chatId, listing, undefined, { fav: 'remove' });
  }
  if (favs.length > FAVORITES_LIMIT) {
    await ctx.reply(`…ועוד ${favs.length - FAVORITES_LIMIT} מועדפים (מציג ${FAVORITES_LIMIT} ראשונים).`);
  }
}
