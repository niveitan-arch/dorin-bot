import { YAD2_UA, withYad2Context, pageIsBlocked } from './yad2-session';

export interface LocSuggestion {
  kind: 'city' | 'neighborhood' | 'area';
  label: string; // button display
  cityName: string;
  hoodId?: string;
  hoodName?: string;
  base: Record<string, string | number>; // topArea/area/city
}

interface RawSuggestion {
  text?: string;
  info?: string;
  value?: Record<string, string | number>;
}

function classify(info: string): LocSuggestion['kind'] | null {
  if (info === 'עיר') return 'city';
  if (info === 'שכונה') return 'neighborhood';
  if (info === 'איזור' || info === 'אזור') return 'area';
  return null; // skip streets / regions
}

const AUTOCOMPLETE_TIMEOUT_MS = 5000;
const cache = new Map<string, LocSuggestion[]>();

function autocompleteUrl(q: string): string {
  return 'https://gw.yad2.co.il/address-autocomplete/realestate?text=' + encodeURIComponent(q);
}

/**
 * Fast path: a plain cookie-less HTTP request to the public autocomplete API.
 * Returns the raw suggestions, or null if Yad2 bounced us to the anti-bot wall
 * (the endpoint 302-redirects cookie-less requests to validate.perfdrive.com and
 * serves HTML instead of JSON). null → caller falls back to the browser path.
 */
async function fetchViaHttp(q: string): Promise<RawSuggestion[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTOCOMPLETE_TIMEOUT_MS);
  try {
    const res = await fetch(autocompleteUrl(q), {
      headers: {
        accept: 'application/json',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'User-Agent': YAD2_UA,
      },
      redirect: 'manual', // a 3xx here means the anti-bot wall, not real data
      signal: controller.signal,
    });
    if (res.status !== 200) return null; // 302 → blocked; anything non-200 → fall back
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return null; // HTML challenge page
    const body = await res.json();
    return Array.isArray(body) ? (body as RawSuggestion[]) : [];
  } catch {
    return null; // network error / abort → try the browser path
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback path: hit the same endpoint from inside the logged-in persistent
 * browser context, so the request carries the anti-bot cookies from the manual
 * captcha solve and passes the wall. Slower (serialized behind poll work), used
 * only when the cheap HTTP path is blocked.
 */
async function fetchViaBrowser(q: string): Promise<RawSuggestion[] | null> {
  try {
    return await withYad2Context(true, async (ctx) => {
      const page = await ctx.newPage();
      try {
        await page.goto(autocompleteUrl(q), { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (await pageIsBlocked(page)) return null; // session expired → needs yad2:login
        const text = await page.evaluate(() => document.body?.innerText || '');
        const body = JSON.parse(text);
        return Array.isArray(body) ? (body as RawSuggestion[]) : [];
      } finally {
        await page.close().catch(() => undefined);
      }
    });
  } catch (err) {
    console.error('[yad2-location] browser fallback failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function parseRaw(raw: RawSuggestion[]): LocSuggestion[] {
  const out: LocSuggestion[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object' || !s.value || typeof s.value !== 'object') continue;
    const kind = classify(s.info || '');
    if (!kind) continue;
    const text = (s.text || '').trim();
    // "hood, city" or "hood, sub, city" → city is the last segment.
    const segs = text.split(',').map((x) => x.trim()).filter(Boolean);
    const cityName = segs.length > 1 ? segs[segs.length - 1] : text;
    const hoodName = segs.length > 1 ? segs.slice(0, -1).join(', ') : undefined;

    const base: Record<string, string | number> = {};
    if (s.value.topArea != null) base.topArea = s.value.topArea;
    if (s.value.area != null) base.area = s.value.area;
    if (s.value.city != null) base.city = s.value.city;

    out.push({
      kind,
      label: s.info ? `${text} (${s.info})` : text,
      cityName,
      hoodId: s.value.neighborhood != null ? String(s.value.neighborhood) : undefined,
      hoodName: kind === 'neighborhood' ? hoodName ?? text : undefined,
      base,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/** Resolve a free-text place query to Yad2 location suggestions. */
export async function resolveLocations(query: string): Promise<LocSuggestion[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  // Fast cookie-less API first; on the anti-bot wall, retry through the
  // logged-in browser (carries the solved-captcha cookies).
  let raw = await fetchViaHttp(q);
  if (raw === null) raw = await fetchViaBrowser(q);
  if (raw === null) return []; // both paths blocked — don't cache a transient failure

  const out = parseRaw(raw);
  if (out.length > 0) cache.set(key, out); // only cache real hits
  return out;
}
