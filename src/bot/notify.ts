import type { Telegram } from 'telegraf';
import type { Listing } from '../sources/types';
import { cacheListing } from '../core/db';
import { fingerprint } from '../core/dedup';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return 'לא צויין';
  }
  return '₪' + price.toLocaleString('he-IL');
}

function joinLocation(listing: Listing): string {
  const parts = [listing.city, listing.neighborhood, listing.street]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => escapeHtml(p.trim()));
  return parts.join(', ');
}

/**
 * Format and send a listing as a Hebrew-friendly card.
 * Uses sendPhoto when an image is available, otherwise sendMessage.
 * Never throws — send errors are logged.
 */
export async function sendListing(
  telegram: Telegram,
  chatId: number,
  listing: Listing,
  search?: { id: number; label: string },
  opts?: { fav?: 'add' | 'remove' | 'none' }
): Promise<void> {
  // Snapshot every card we send so /favorites and /active can re-render it
  // without re-scraping (and a starred ad survives even if it later delists).
  try {
    cacheListing(listing);
  } catch {
    /* cache is best-effort */
  }

  const lines: string[] = [];

  // #4 — which saved search this result belongs to.
  if (search) {
    const name = search.label && search.label.trim().length > 0 ? search.label.trim() : 'חיפוש';
    lines.push(`🔎 <b>חיפוש #${search.id} · ${escapeHtml(name)}</b>`);
  }

  lines.push(`💰 <b>${escapeHtml(formatPrice(listing.price))}</b>`);

  const facts: string[] = [];
  if (listing.rooms !== null && listing.rooms !== undefined) {
    facts.push(`🛏 ${escapeHtml(String(listing.rooms))} חדרים`);
  }
  if (listing.sizeSqm !== null && listing.sizeSqm !== undefined) {
    facts.push(`📐 ${escapeHtml(String(listing.sizeSqm))} מ"ר`);
  }
  if (listing.floor !== null && listing.floor !== undefined) {
    facts.push(`🏢 קומה ${escapeHtml(String(listing.floor))}`);
  }
  if (facts.length > 0) {
    lines.push(facts.join('  •  '));
  }

  const location = joinLocation(listing);
  if (location.length > 0) {
    lines.push(`📍 ${location}`);
  }

  if (listing.isBroker !== null && listing.isBroker !== undefined) {
    lines.push(listing.isBroker ? '🤝 תיווך' : '🙋 פרטי');
  }

  // Always show all four amenities. ✅ = listed in the ad, ◻️ = not listed
  // (Yad2 ads often omit amenities they actually have, so ◻️ ≠ definitely none).
  const amenMark = (on: boolean | null) => (on ? '✅' : '◻️');
  lines.push(
    [
      `🅿️ חניה ${amenMark(listing.hasParking)}`,
      `🛗 מעלית ${amenMark(listing.hasElevator)}`,
      `🛡 ממ"ד ${amenMark(listing.hasShelter)}`,
      `🌿 מרפסת ${amenMark(listing.hasBalcony)}`,
    ].join('  ')
  );

  if (listing.entryDate && listing.entryDate.trim().length > 0) {
    lines.push(`🗓 כניסה: ${escapeHtml(listing.entryDate.trim())}`);
  }

  if (listing.url && listing.url.trim().length > 0) {
    lines.push(`🔗 <a href="${escapeHtml(listing.url.trim())}">צפייה במודעה</a>`);
  }

  const caption = lines.join('\n');

  // ⭐ favorite toggle button (default: offer to add).
  const fav = opts?.fav ?? 'add';
  const fp = fingerprint(listing);
  const favRow =
    fav === 'add'
      ? [{ text: '⭐ הוסף למועדפים', callback_data: `fav:add:${fp}` }]
      : fav === 'remove'
        ? [{ text: '🗑️ הסר ממועדפים', callback_data: `fav:rm:${fp}` }]
        : null;
  const reply_markup = favRow ? { inline_keyboard: [favRow] } : undefined;

  try {
    const image = Array.isArray(listing.images) ? listing.images[0] : undefined;
    if (image && image.trim().length > 0) {
      await telegram.sendPhoto(chatId, image, {
        caption,
        parse_mode: 'HTML',
        ...(reply_markup ? { reply_markup } : {}),
      });
    } else {
      await telegram.sendMessage(chatId, caption, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false },
        ...(reply_markup ? { reply_markup } : {}),
      });
    }
  } catch (err) {
    console.error(`sendListing failed for chat ${chatId} (${listing.url}):`, err);
  }
}
