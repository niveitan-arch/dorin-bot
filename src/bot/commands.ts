import type { Telegraf, Context } from 'telegraf';
import type { Search } from '../sources/types';
import {
  upsertUser,
  listSearches,
  deleteSearch,
  setSearchActive,
} from '../core/db';
import {
  startWizard,
  cancelWizard,
  isWizardActive,
  handleWizardText,
  handleWizardCallback,
} from './wizard';
import { sendFavorites, handleFavoriteCallback } from './favorites';
import { sendActiveMenu, handleActiveCallback } from './active';

const HELP_TEXT = [
  'הפקודות שלי: 🤖',
  '',
  '/newsearch – יצירת חיפוש חדש',
  '/mysearches – הצגת החיפושים שלי',
  '/active – הצגת כל הדירות הפעילות בחיפוש',
  '/favorites – הדירות שסימנתי ⭐',
  '/pause <מס׳> – השהיית חיפוש',
  '/resume <מס׳> – חידוש חיפוש',
  '/delete <מס׳> – מחיקת חיפוש',
  '/cancel – ביטול אשף פעיל',
  '/help – עזרה',
].join('\n');

function senderName(ctx: Context): string {
  const from = ctx.from;
  if (!from) return 'משתמש';
  const parts = [from.first_name, from.last_name].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );
  if (parts.length > 0) return parts.join(' ');
  return from.username || 'משתמש';
}

function dealTypeHe(d: Search['dealType']): string {
  return d === 'sale' ? 'מכירה' : 'שכירות';
}

function summarizeSearch(s: Search): string {
  const bits: string[] = [];
  bits.push(`#${s.id}`);
  bits.push(s.active ? '🟢 פעיל' : '⏸️ מושהה');
  const label = s.label && s.label.length > 0 ? s.label : '(ללא שם)';
  const parts: string[] = [];
  parts.push(dealTypeHe(s.dealType));
  if (s.location?.label) parts.push(s.location.label);
  if (s.minRooms !== null || s.maxRooms !== null) {
    parts.push(`חדרים ${s.minRooms ?? '?'}–${s.maxRooms ?? '?'}`);
  }
  if (s.minPrice !== null || s.maxPrice !== null) {
    parts.push(`מחיר ${s.minPrice ?? '?'}–${s.maxPrice ?? '?'} ₪`);
  }
  if (s.minSizeSqm !== null) parts.push(`מ-${s.minSizeSqm} מ"ר`);
  if (s.minFloor !== null || s.maxFloor !== null) {
    parts.push(`קומה ${s.minFloor ?? '?'}–${s.maxFloor ?? '?'}`);
  }
  const amen: string[] = [];
  if (s.parking) amen.push('חניה');
  if (s.elevator) amen.push('מעלית');
  if (s.shelter) amen.push('ממ"ד');
  if (s.balcony) amen.push('מרפסת');
  if (amen.length > 0) parts.push(amen.join('+'));
  parts.push(s.brokerOk ? 'כולל תיווך' : 'פרטי בלבד');
  return `${bits.join('  ')}\n${label}\n${parts.join(' · ')}`;
}

function parseIdArg(ctx: Context): number | null {
  const message = ctx.message;
  const text =
    message && 'text' in message && typeof message.text === 'string'
      ? message.text
      : '';
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const n = Number(parts[1]);
  if (!Number.isInteger(n)) return null;
  return n;
}

export function registerCommands(bot: Telegraf): void {
  bot.start(async (ctx) => {
    if (ctx.chat) {
      upsertUser(ctx.chat.id, senderName(ctx));
    }
    await ctx.reply(`שלום ${senderName(ctx)}! 👋\nאני דורין-בוט ואעזור לכם למצוא דירות.\n\n${HELP_TEXT}`);
  });

  bot.help(async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });

  bot.command('cancel', async (ctx) => {
    const cancelled = await cancelWizard(ctx);
    if (!cancelled) {
      await ctx.reply('אין אשף פעיל לביטול.');
    }
  });

  bot.command('newsearch', async (ctx) => {
    await startWizard(ctx);
  });

  bot.command('mysearches', async (ctx) => {
    if (!ctx.chat) return;
    const searches = listSearches(ctx.chat.id);
    if (searches.length === 0) {
      await ctx.reply('אין לכם חיפושים עדיין. צרו אחד עם /newsearch');
      return;
    }
    const body = searches.map(summarizeSearch).join('\n\n');
    await ctx.reply(`החיפושים שלכם: 📋\n\n${body}`);
  });

  bot.command('favorites', async (ctx) => {
    await sendFavorites(ctx);
  });

  bot.command('active', async (ctx) => {
    await sendActiveMenu(ctx);
  });

  bot.command('delete', async (ctx) => {
    if (!ctx.chat) return;
    const id = parseIdArg(ctx);
    if (id === null) {
      await ctx.reply('שימוש: /delete <מספר חיפוש>');
      return;
    }
    deleteSearch(id, ctx.chat.id);
    await ctx.reply(`חיפוש #${id} נמחק. 🗑️`);
  });

  bot.command('pause', async (ctx) => {
    if (!ctx.chat) return;
    const id = parseIdArg(ctx);
    if (id === null) {
      await ctx.reply('שימוש: /pause <מספר חיפוש>');
      return;
    }
    setSearchActive(id, ctx.chat.id, false);
    await ctx.reply(`חיפוש #${id} הושהה. ⏸️`);
  });

  bot.command('resume', async (ctx) => {
    if (!ctx.chat) return;
    const id = parseIdArg(ctx);
    if (id === null) {
      await ctx.reply('שימוש: /resume <מספר חיפוש>');
      return;
    }
    setSearchActive(id, ctx.chat.id, true);
    await ctx.reply(`חיפוש #${id} חודש. ▶️`);
  });

  // Callback routing: wizard first, then favorites (⭐), then /active menu.
  bot.on('callback_query', async (ctx) => {
    if (await handleWizardCallback(ctx)) return;
    if (await handleFavoriteCallback(ctx)) return;
    if (await handleActiveCallback(ctx)) return;
    await ctx.answerCbQuery();
  });

  bot.on('text', async (ctx) => {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    // Let command handlers above deal with slash commands.
    if (typeof text === 'string' && text.startsWith('/')) return;
    if (ctx.chat && isWizardActive(ctx.chat.id)) {
      await handleWizardText(ctx);
    }
  });
}
