import { YAD2_UA } from './yad2-session';

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

// The autocomplete endpoint is a lightweight public API — it answers in ~0.3s
// with no cookies and no anti-bot challenge — so we hit it with a plain HTTP
// request instead of going through the (serialized, slow) browser context.
// That keeps the /newsearch location step instant even while a poll cycle runs.
const AUTOCOMPLETE_TIMEOUT_MS = 5000;
const cache = new Map<string, LocSuggestion[]>();

/** Resolve a free-text place query to Yad2 location suggestions. */
export async function resolveLocations(query: string): Promise<LocSuggestion[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const url =
    'https://gw.yad2.co.il/address-autocomplete/realestate?text=' + encodeURIComponent(q);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTOCOMPLETE_TIMEOUT_MS);
  let raw: RawSuggestion[];
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'User-Agent': YAD2_UA,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[yad2-location] autocomplete HTTP ${res.status} for "${q}"`);
      return [];
    }
    const body = await res.json();
    if (!Array.isArray(body)) return [];
    raw = body as RawSuggestion[];
  } catch (err) {
    console.error('[yad2-location] autocomplete failed:', err instanceof Error ? err.message : err);
    return [];
  } finally {
    clearTimeout(timer);
  }

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

  cache.set(key, out);
  return out;
}
