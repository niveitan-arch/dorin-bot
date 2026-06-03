import { chromium, Browser, Page } from 'playwright';
import type { DealType, Listing, Search, Source } from './types';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Madlan is a React/Apollo app backed by a GraphQL gateway. The listing feed
// comes back over XHR; we capture JSON responses that look like the search feed.
// TODO: confirm the exact gateway host + GraphQL operation name by inspecting a
// live search in DevTools (Network tab, filter XHR). As of this writing the
// search results arrive via api.madlan.co.il / GraphQL "searchPoiByText" or
// similar. Once confirmed, tighten isFeedResponseUrl + extractItems below.
function isFeedResponseUrl(url: string): boolean {
  if (!/madlan\.co\.il/.test(url)) return false;
  return (
    url.includes('/graphql') ||
    url.includes('/api') ||
    url.includes('search') ||
    url.includes('poi') ||
    url.includes('bulletin')
  );
}

function baseUrlFor(dealType: DealType): string {
  // Madlan paths are Hebrew-slug based; these are the canonical entry points.
  return dealType === 'sale'
    ? 'https://www.madlan.co.il/for-sale'
    : 'https://www.madlan.co.il/for-rent';
}

function buildSearchUrl(search: Search): string {
  // Madlan encodes filters mostly in the path/slug rather than query params, and
  // resolving a free-text city to its slug requires their geo lookup. Best-effort:
  // start from the base for-rent/for-sale page and append the city term + price
  // as a query string; Madlan tolerates unknown params.
  const url = new URL(baseUrlFor(search.dealType));
  const p = url.searchParams;
  if (search.location?.label) p.set('term', search.location.label);
  if (search.minPrice != null) p.set('minPrice', String(search.minPrice));
  if (search.maxPrice != null) p.set('maxPrice', String(search.maxPrice));
  if (search.minRooms != null) p.set('minRooms', String(search.minRooms));
  if (search.maxRooms != null) p.set('maxRooms', String(search.maxRooms));
  return url.toString();
}

// --- Defensive JSON parsing helpers -----------------------------------------

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.]/g, '');
    if (cleaned.length === 0) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

function firstDefined<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v != null) return v as T;
  return null;
}

// Probe several plausible container paths for the list of bulletins/POIs.
function extractItems(json: any): any[] {
  if (!json || typeof json !== 'object') return [];
  const candidates: unknown[] = [
    json?.data?.searchPoiByText?.poiList,
    json?.data?.search?.documents,
    json?.data?.search?.bulletins,
    json?.data?.bulletins,
    json?.data?.poiList,
    json?.data?.results,
    json?.bulletins,
    json?.results,
    json?.documents,
    json?.data,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as any[];
  }
  for (const key of Object.keys(json)) {
    if (Array.isArray((json as any)[key])) return (json as any)[key];
  }
  return [];
}

function mapItem(item: any, search: Search): Listing | null {
  if (!item || typeof item !== 'object') return null;

  const sourceId = asString(
    firstDefined(item?.id, item?.poiId, item?.bulletinId, item?.docId, item?._id)
  );
  if (!sourceId) return null;

  // TODO: confirm the canonical item URL pattern. Madlan listing pages are
  // typically /listings/<id> or /bulletin/<id>. Adjust once verified.
  const url = `https://www.madlan.co.il/listings/${sourceId}`;

  const price = asNumber(firstDefined(item?.price, item?.priceValue, item?.dealPrice));
  const rooms = asNumber(firstDefined(item?.rooms, item?.beds, item?.roomsCount));
  const sizeSqm = asNumber(
    firstDefined(item?.area, item?.size, item?.squareMeters, item?.builtUpArea)
  );
  const floor = asNumber(firstDefined(item?.floor, item?.floorNumber));
  const city = asString(firstDefined(item?.city, item?.cityName, item?.address?.city));
  const neighborhood = asString(
    firstDefined(item?.neighborhood, item?.neighbourhood, item?.address?.neighborhood)
  );
  const street = asString(firstDefined(item?.street, item?.address?.street, item?.streetName));

  const brokerRaw = firstDefined<any>(item?.isAgent, item?.agent, item?.agency, item?.dealerType);
  let isBroker: boolean | null = null;
  if (brokerRaw != null) {
    if (typeof brokerRaw === 'boolean') isBroker = brokerRaw;
    else if (typeof brokerRaw === 'string') isBroker = /agen|broker|תיווך|מתווך/i.test(brokerRaw);
    else if (typeof brokerRaw === 'object') isBroker = true;
    else if (typeof brokerRaw === 'number') isBroker = brokerRaw !== 0;
  }

  const entryDate = asString(firstDefined(item?.entryDate, item?.entranceDate));
  const postedAt = asString(firstDefined(item?.date, item?.createdAt, item?.updatedAt));

  const images: string[] = [];
  const imgArr = firstDefined<any>(item?.images, item?.imageUrls, item?.photos);
  if (Array.isArray(imgArr)) {
    for (const v of imgArr) {
      const s = asString(typeof v === 'object' ? (v?.url ?? v?.src) : v);
      if (s && /^https?:\/\//.test(s)) images.push(s);
    }
  }

  const titleBits = [asString(item?.title), asString(item?.description), asString(item?.address?.text)].filter(
    Boolean
  );
  const rawText = titleBits.length > 0 ? titleBits.join(' | ') : JSON.stringify(item).slice(0, 2000);

  return {
    source: 'madlan',
    sourceId,
    url,
    dealType: search.dealType,
    price,
    rooms,
    sizeSqm,
    floor,
    city,
    neighborhood,
    street,
    isBroker,
    entryDate,
    images,
    rawText,
    postedAt,
    hasParking: null,
    hasElevator: null,
    hasShelter: null,
    hasBalcony: null,
  };
}

export const madlan: Source = {
  name: 'madlan',
  async fetch(search: Search): Promise<Listing[]> {
    let browser: Browser | null = null;
    const captured: any[] = [];

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: DESKTOP_USER_AGENT,
        locale: 'he-IL',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' },
      });
      const page: Page = await context.newPage();

      page.on('response', async (response) => {
        const url = response.url();
        if (!isFeedResponseUrl(url)) return;
        try {
          const ct = response.headers()['content-type'] || '';
          if (!ct.includes('json')) return;
          const json = await response.json();
          captured.push(json);
        } catch {
          // ignore
        }
      });

      const target = buildSearchUrl(search);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });

      try {
        await page.waitForResponse((r) => isFeedResponseUrl(r.url()), { timeout: 15000 });
      } catch {
        // none captured
      }
      await page.waitForTimeout(1500);

      const listings: Listing[] = [];
      const seen = new Set<string>();
      for (const json of captured) {
        for (const item of extractItems(json)) {
          const mapped = mapItem(item, search);
          if (mapped && !seen.has(mapped.sourceId)) {
            seen.add(mapped.sourceId);
            listings.push(mapped);
          }
        }
      }

      // TODO: until the Madlan feed shape + URL filter are confirmed against a
      // live session, this may legitimately return []. The scaffolding above
      // (launch, capture, defensive map) is ready; verify and tighten the
      // isFeedResponseUrl + extractItems probes, then remove this note.
      return listings;
    } catch (err) {
      console.error('[madlan] fetch failed:', err instanceof Error ? err.message : err);
      return [];
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
    }
  },
};

export default madlan;
