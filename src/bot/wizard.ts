import type { Context, Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import type { DealType, YadLocation } from '../sources/types';
import { createSearch } from '../core/db';
import { resolveLocations, type LocSuggestion } from '../sources/yad2-location';
import { catalogForCity, type CatalogCity } from '../sources/hood-catalog';

const PAGE_SIZE = 8;
const MAX_HOODS = 10; // cap selected neighborhoods (each = one Yad2 fetch per poll)

type Step =
  | 'dealType'
  | 'location'
  | 'hoodPicker'
  | 'hoods'
  | 'minRooms'
  | 'maxRooms'
  | 'minPrice'
  | 'maxPrice'
  | 'minSize'
  | 'minFloor'
  | 'maxFloor'
  | 'amenities'
  | 'brokerOk'
  | 'label';

interface WizardState {
  step: Step;
  dealType?: DealType;
  locBase?: Record<string, string | number>;
  locCityName?: string;
  locNeighborhoods: { id: string; name: string }[];
  locCandidates?: LocSuggestion[];
  catalog?: CatalogCity;
  hoodPage: number;
  location?: YadLocation | null;
  minRooms?: number | null;
  maxRooms?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minSize?: number | null;
  minFloor?: number | null;
  maxFloor?: number | null;
  parking: boolean;
  elevator: boolean;
  shelter: boolean;
  balcony: boolean;
  brokerOk?: boolean;
  label?: string;
}

const wizards = new Map<number, WizardState>();

function chatIdOf(ctx: Context): number | undefined {
  return ctx.chat?.id;
}

function parseOptionalNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (t.length === 0) return undefined;
  if (['-', 'דלג', 'skip', 'ללא', 'אין'].includes(t.toLowerCase())) return null;
  const n = Number(t.replace(/[, ₪]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function dealTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔑 שכירות', 'wiz:deal:rent'),
      Markup.button.callback('🏠 מכירה', 'wiz:deal:sale'),
    ],
  ]);
}

function brokerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('כן', 'wiz:broker:yes'), Markup.button.callback('לא', 'wiz:broker:no')],
  ]);
}

// Rank for the first location screen: catalog cities first, then plain cities,
// then neighborhoods, then areas — so the city (the path to the hood picker) leads.
function locRank(c: LocSuggestion): number {
  if (c.kind === 'city') return catalogForCity(c.base.city) ? 0 : 1;
  if (c.kind === 'neighborhood') return 2;
  return 3; // area
}

// Clear, kind-specific button label. A catalog city advertises that picking it
// leads to neighborhood selection; a plain city = whole-city search.
function locDisplayLabel(c: LocSuggestion): string {
  if (c.kind === 'city') {
    return catalogForCity(c.base.city)
      ? `🏙️ ${c.cityName} — בחרו שכונות »`
      : `🏙️ ${c.cityName} — כל העיר`;
  }
  if (c.kind === 'neighborhood') {
    return `📍 ${c.hoodName ?? c.cityName} · ${c.cityName}`;
  }
  return `🗺️ ${c.cityName}`;
}

function suggestionKeyboard(cands: LocSuggestion[], withDone: boolean) {
  // withDone === true is the "add another hood" screen (type-to-add cities) —
  // keep its plain labels. Otherwise it's the first location screen — use the
  // clearer city-vs-neighborhood labels.
  const rows = cands.map((c, i) => [
    Markup.button.callback(withDone ? c.label : locDisplayLabel(c), `wiz:loc:${i}`),
  ]);
  if (withDone) rows.push([Markup.button.callback('✅ סיום אזורים', 'wiz:hoods:done')]);
  return Markup.inlineKeyboard(rows);
}

function doneHoodsKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('✅ סיום אזורים', 'wiz:hoods:done')]]);
}

function pickerKeyboard(state: WizardState) {
  const cat = state.catalog!;
  const selected = new Set(state.locNeighborhoods.map((h) => h.id));
  const pages = Math.max(1, Math.ceil(cat.neighborhoods.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, state.hoodPage), pages - 1);
  const slice = cat.neighborhoods.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((h) => [
    Markup.button.callback((selected.has(h.id) ? '✅ ' : '') + h.name, `wiz:hp:t:${h.id}`),
  ]);
  rows.push([
    Markup.button.callback('◀️', `wiz:hp:p:${(page - 1 + pages) % pages}`),
    Markup.button.callback(`עמ' ${page + 1}/${pages}`, 'wiz:hp:nop'),
    Markup.button.callback('▶️', `wiz:hp:p:${(page + 1) % pages}`),
  ]);
  rows.push([Markup.button.callback(`✅ סיום בחירה (${selected.size})`, 'wiz:hp:done')]);
  return Markup.inlineKeyboard(rows);
}

function amenitiesKeyboard(state: WizardState) {
  const mark = (on: boolean, text: string) => (on ? `✅ ${text}` : text);
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(mark(state.parking, '🅿️ חניה'), 'wiz:amen:parking'),
      Markup.button.callback(mark(state.elevator, '🛗 מעלית'), 'wiz:amen:elevator'),
    ],
    [
      Markup.button.callback(mark(state.shelter, '🛡 ממ"ד/מקלט'), 'wiz:amen:shelter'),
      Markup.button.callback(mark(state.balcony, '🌿 מרפסת'), 'wiz:amen:balcony'),
    ],
    [Markup.button.callback('➡️ המשך', 'wiz:amen:done')],
  ]);
}

function hoodsSummary(state: WizardState): string {
  if (state.locNeighborhoods.length === 0) return `📍 ${state.locCityName} (כל העיר)`;
  return `📍 ${state.locCityName}\nשכונות: ${state.locNeighborhoods.map((h) => h.name).join(', ')}`;
}

export function isWizardActive(chatId: number): boolean {
  return wizards.has(chatId);
}

export async function startWizard(ctx: Context): Promise<void> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return;
  wizards.set(chatId, {
    step: 'dealType',
    locNeighborhoods: [],
    hoodPage: 0,
    parking: false,
    elevator: false,
    shelter: false,
    balcony: false,
  });
  await ctx.reply(
    'בואו ניצור חיפוש חדש. 🔍\nבכל שלב אפשר לשלוח /cancel כדי לבטל.\n\nאיזה סוג עסקה?',
    dealTypeKeyboard()
  );
}

export async function cancelWizard(ctx: Context): Promise<boolean> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return false;
  if (!wizards.has(chatId)) return false;
  wizards.delete(chatId);
  await ctx.reply('בוטל. ✖️');
  return true;
}

async function finish(ctx: Context, chatId: number, state: WizardState): Promise<void> {
  const fallbackLabel = state.location?.label || 'חיפוש';
  const id = createSearch({
    chatId,
    label: state.label && state.label.length > 0 ? state.label : fallbackLabel,
    location: state.location ?? null,
    minRooms: state.minRooms ?? null,
    maxRooms: state.maxRooms ?? null,
    minPrice: state.minPrice ?? null,
    maxPrice: state.maxPrice ?? null,
    minSizeSqm: state.minSize ?? null,
    minFloor: state.minFloor ?? null,
    maxFloor: state.maxFloor ?? null,
    parking: state.parking,
    elevator: state.elevator,
    shelter: state.shelter,
    balcony: state.balcony,
    dealType: state.dealType as DealType,
    brokerOk: state.brokerOk ?? true,
    active: true,
  });
  wizards.delete(chatId);
  await ctx.reply(
    `נוצר חיפוש חדש! ✅\nמספר חיפוש: <b>${id}</b>\nתוך כדקות תקבלו מודעות תואמות, ואז התראות על חדשות.`,
    { parse_mode: 'HTML' }
  );
}

function finalizeLocation(state: WizardState): void {
  const names = state.locNeighborhoods.map((h) => h.name);
  const hoodLabel =
    names.length === 0 ? '' : names.length <= 3 ? ' · ' + names.join(', ') : ` · ${names.length} שכונות`;
  state.location = {
    label: (state.locCityName ?? 'חיפוש') + hoodLabel,
    base: state.locBase ?? {},
    neighborhoods: state.locNeighborhoods,
  };
}

async function ask(ctx: Context, prompt: string): Promise<boolean> {
  await ctx.reply(prompt);
  return true;
}

async function safeResolve(text: string): Promise<LocSuggestion[]> {
  try {
    return await resolveLocations(text);
  } catch {
    return [];
  }
}

export async function handleWizardText(ctx: Context): Promise<boolean> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return false;
  const state = wizards.get(chatId);
  if (!state) return false;

  const message = ctx.message;
  const text =
    message && 'text' in message && typeof message.text === 'string' ? message.text.trim() : '';

  switch (state.step) {
    case 'dealType':
      await ctx.reply('בחרו סוג עסקה מהכפתורים למעלה.', dealTypeKeyboard());
      return true;

    case 'location': {
      if (text.length === 0) {
        await ctx.reply('הקלידו שם של עיר או שכונה (למשל: תל אביב, או: פלורנטין).');
        return true;
      }
      await ctx.reply('🔎 מחפש מיקומים...');
      const cands = await safeResolve(text);
      if (cands.length === 0) {
        await ctx.reply('לא מצאתי מיקום מתאים. נסו שם אחר, למשל "תל אביב".');
        return true;
      }
      // Cities first (the path to the neighborhood picker), then neighborhoods, then areas.
      cands.sort((a, b) => locRank(a) - locRank(b));
      state.locCandidates = cands;
      await ctx.reply(
        'בחרו מהרשימה 👇\n🏙️ עיר — בשלב הבא תבחרו שכונות (או כל העיר)\n📍 שכונה — חיפוש בשכונה אחת בלבד',
        suggestionKeyboard(cands, false)
      );
      return true;
    }

    case 'hoodPicker':
      await ctx.reply('בחרו שכונות מהכפתורים, ואז "סיום בחירה".', pickerKeyboard(state));
      return true;

    case 'hoods': {
      if (text.length === 0) {
        await ctx.reply('הקלידו שם שכונה להוספה, או לחצו "סיום אזורים".', doneHoodsKeyboard());
        return true;
      }
      await ctx.reply('🔎 מחפש שכונות...');
      const all = await safeResolve(text);
      const cityId = state.locBase?.city;
      const cands = all.filter(
        (c) => c.kind === 'neighborhood' && c.hoodId && (cityId == null || c.base.city == cityId)
      );
      if (cands.length === 0) {
        await ctx.reply('לא נמצאה שכונה מתאימה באותה עיר. נסו שם אחר, או "סיום אזורים".', doneHoodsKeyboard());
        return true;
      }
      state.locCandidates = cands;
      await ctx.reply('בחרו שכונה להוספה:', suggestionKeyboard(cands, true));
      return true;
    }

    case 'minRooms': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'מספר חדרים מינימלי? (מספר, או "-" לדלג)');
      state.minRooms = v;
      state.step = 'maxRooms';
      return ask(ctx, 'מספר חדרים מקסימלי? (מספר, או "-" לדלג)');
    }
    case 'maxRooms': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'מספר חדרים מקסימלי? (מספר, או "-" לדלג)');
      state.maxRooms = v;
      state.step = 'minPrice';
      return ask(ctx, 'מחיר מינימלי (₪)? (מספר, או "-" לדלג)');
    }
    case 'minPrice': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'מחיר מינימלי (₪)? (מספר, או "-" לדלג)');
      state.minPrice = v;
      state.step = 'maxPrice';
      return ask(ctx, 'מחיר מקסימלי (₪)? (מספר, או "-" לדלג)');
    }
    case 'maxPrice': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'מחיר מקסימלי (₪)? (מספר, או "-" לדלג)');
      state.maxPrice = v;
      state.step = 'minSize';
      return ask(ctx, 'גודל מינימלי במ"ר? (מספר, או "-" לדלג)');
    }
    case 'minSize': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'גודל מינימלי במ"ר? (מספר, או "-" לדלג)');
      state.minSize = v;
      state.step = 'minFloor';
      return ask(ctx, 'קומה מינימלית? (מספר, או "-" לדלג)');
    }
    case 'minFloor': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'קומה מינימלית? (מספר, או "-" לדלג)');
      state.minFloor = v;
      state.step = 'maxFloor';
      return ask(ctx, 'קומה מקסימלית? (מספר, או "-" לדלג)');
    }
    case 'maxFloor': {
      const v = parseOptionalNumber(text);
      if (v === undefined) return ask(ctx, 'קומה מקסימלית? (מספר, או "-" לדלג)');
      state.maxFloor = v;
      state.step = 'amenities';
      await ctx.reply('בחרו מאפיינים נדרשים (לחיצה מסמנת/מבטלת), ואז "המשך":', amenitiesKeyboard(state));
      return true;
    }

    case 'amenities':
      await ctx.reply('בחרו מאפיינים מהכפתורים, ואז "המשך".', amenitiesKeyboard(state));
      return true;

    case 'brokerOk':
      await ctx.reply('בחרו "כן" או "לא" מהכפתורים.', brokerKeyboard());
      return true;

    case 'label': {
      if (text.length > 0 && !['-', 'דלג', 'skip'].includes(text.toLowerCase())) {
        state.label = text;
      }
      await finish(ctx, chatId, state);
      return true;
    }

    default:
      return true;
  }
}

export async function handleWizardCallback(ctx: Context): Promise<boolean> {
  const chatId = chatIdOf(ctx);
  if (chatId === undefined) return false;
  const state = wizards.get(chatId);
  if (!state) return false;

  const cq = ctx.callbackQuery;
  const data = cq && 'data' in cq && typeof cq.data === 'string' ? cq.data : '';
  if (!data.startsWith('wiz:')) return false;

  if (data.startsWith('wiz:deal:') && state.step === 'dealType') {
    state.dealType = data.endsWith(':sale') ? 'sale' : 'rent';
    state.step = 'location';
    await ctx.answerCbQuery();
    await ctx.reply('הקלידו עיר או שכונה לחיפוש (למשל: תל אביב, או: רמת אביב):');
    return true;
  }

  // First location pick (city / neighborhood / area).
  if (data.startsWith('wiz:loc:') && state.step === 'location') {
    const pick = state.locCandidates?.[Number(data.slice('wiz:loc:'.length))];
    await ctx.answerCbQuery();
    if (!pick) {
      await ctx.reply('הבחירה לא זמינה יותר, הקלידו שוב את שם המיקום.');
      return true;
    }
    state.locBase = pick.base;
    state.locCityName = pick.cityName;
    state.locNeighborhoods = [];
    if (pick.kind === 'neighborhood' && pick.hoodId) {
      state.locNeighborhoods.push({ id: pick.hoodId, name: pick.hoodName ?? pick.cityName });
    }
    const cat = catalogForCity(pick.base.city);
    if (cat) {
      state.catalog = cat;
      state.hoodPage = 0;
      state.step = 'hoodPicker';
      await ctx.reply(
        `📍 ${state.locCityName}\nבחרו שכונות (אפשר כמה). בלי בחירה = כל העיר:`,
        pickerKeyboard(state)
      );
    } else {
      state.step = 'hoods';
      await ctx.reply(
        `${hoodsSummary(state)}\n\nאפשר להוסיף עוד שכונות (הקלידו שם שכונה), או "סיום אזורים" לסיום.`,
        doneHoodsKeyboard()
      );
    }
    return true;
  }

  // Multi-select picker (catalog cities).
  if (data.startsWith('wiz:hp:') && state.step === 'hoodPicker') {
    const rest = data.slice('wiz:hp:'.length);
    if (rest === 'nop') {
      await ctx.answerCbQuery();
      return true;
    }
    if (rest === 'done') {
      finalizeLocation(state);
      state.step = 'minRooms';
      await ctx.answerCbQuery();
      await ctx.reply(`${hoodsSummary(state)}\n\nמספר חדרים מינימלי? (מספר, או "-" לדלג)`);
      return true;
    }
    if (rest.startsWith('p:')) {
      state.hoodPage = Number(rest.slice(2)) || 0;
      await ctx.answerCbQuery();
      try {
        await ctx.editMessageReplyMarkup(pickerKeyboard(state).reply_markup);
      } catch {
        /* ignore */
      }
      return true;
    }
    if (rest.startsWith('t:')) {
      const id = rest.slice(2);
      const idx = state.locNeighborhoods.findIndex((h) => h.id === id);
      if (idx >= 0) {
        state.locNeighborhoods.splice(idx, 1);
      } else if (state.locNeighborhoods.length >= MAX_HOODS) {
        await ctx.answerCbQuery(`אפשר עד ${MAX_HOODS} שכונות`);
        return true;
      } else {
        const h = state.catalog?.neighborhoods.find((n) => n.id === id);
        if (h) state.locNeighborhoods.push({ id: h.id, name: h.name });
      }
      await ctx.answerCbQuery();
      try {
        await ctx.editMessageReplyMarkup(pickerKeyboard(state).reply_markup);
      } catch {
        /* ignore */
      }
      return true;
    }
    await ctx.answerCbQuery();
    return true;
  }

  // Type-to-add neighborhoods (non-catalog cities).
  if (data.startsWith('wiz:loc:') && state.step === 'hoods') {
    const pick = state.locCandidates?.[Number(data.slice('wiz:loc:'.length))];
    await ctx.answerCbQuery();
    if (pick && pick.hoodId && !state.locNeighborhoods.some((h) => h.id === pick.hoodId)) {
      if (state.locNeighborhoods.length >= MAX_HOODS) {
        await ctx.reply(`אפשר עד ${MAX_HOODS} שכונות.`);
      } else {
        state.locNeighborhoods.push({ id: pick.hoodId, name: pick.hoodName ?? pick.label });
      }
    }
    await ctx.reply(`${hoodsSummary(state)}\n\nעוד שכונה? הקלידו שם, או "סיום אזורים".`, doneHoodsKeyboard());
    return true;
  }

  if (data === 'wiz:hoods:done' && state.step === 'hoods') {
    finalizeLocation(state);
    state.step = 'minRooms';
    await ctx.answerCbQuery();
    await ctx.reply(`${hoodsSummary(state)}\n\nמספר חדרים מינימלי? (מספר, או "-" לדלג)`);
    return true;
  }

  if (data.startsWith('wiz:amen:') && state.step === 'amenities') {
    const which = data.slice('wiz:amen:'.length);
    if (which === 'done') {
      state.step = 'brokerOk';
      await ctx.answerCbQuery();
      await ctx.reply('לקבל גם מודעות מתיווך?', brokerKeyboard());
      return true;
    }
    if (which === 'parking') state.parking = !state.parking;
    else if (which === 'elevator') state.elevator = !state.elevator;
    else if (which === 'shelter') state.shelter = !state.shelter;
    else if (which === 'balcony') state.balcony = !state.balcony;
    await ctx.answerCbQuery('עודכן');
    try {
      await ctx.editMessageReplyMarkup(amenitiesKeyboard(state).reply_markup);
    } catch {
      /* ignore */
    }
    return true;
  }

  if (data.startsWith('wiz:broker:') && state.step === 'brokerOk') {
    state.brokerOk = data.endsWith(':yes');
    state.step = 'label';
    await ctx.answerCbQuery();
    await ctx.reply('רוצים לתת שם לחיפוש? (כתבו שם, או "-" לדלג)');
    return true;
  }

  await ctx.answerCbQuery();
  return true;
}

export const _wizards = wizards;
export type { Telegraf };
