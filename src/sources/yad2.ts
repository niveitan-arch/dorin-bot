import type { Page } from 'playwright';
import type { DealType, Listing, Search, Source } from './types';
import { withYad2Context, pageIsBlocked, Yad2BlockedError } from './yad2-session';
import { config } from '../config';

// Set YAD2_HEADLESS=false to run with a visible window (via WSLg) if headless
// ever gets re-challenged despite a valid saved session.
const HEADLESS = process.env.YAD2_HEADLESS !== 'false';

function baseSegmentFor(dealType: DealType): string {
  return dealType === 'sale' ? 'forsale' : 'rent';
}

// Build the Yad2 results URL(s). Yad2 has no working multi-neighborhood param,
// so when several neighborhoods are selected we produce one URL per neighborhood
// (each reliably returns its own listings) and merge the results.
function buildSearchUrls(search: Search): string[] {
  const base = search.location?.base ?? {};
  const hoods = search.location?.neighborhoods ?? [];

  const buildOne = (neighborhood?: string): string => {
    const url = new URL(`https://www.yad2.co.il/realestate/${baseSegmentFor(search.dealType)}`);
    const p = url.searchParams;
    p.set('property', '1'); // apartments
    for (const [k, v] of Object.entries(base)) {
      if (v !== undefined && v !== null && String(v).length > 0) p.set(k, String(v));
    }
    if (neighborhood) p.set('neighborhood', neighborhood);
    if (search.minPrice != null) p.set('minPrice', String(search.minPrice));
    if (search.maxPrice != null) p.set('maxPrice', String(search.maxPrice));
    if (search.minRooms != null) p.set('minRooms', String(search.minRooms));
    if (search.maxRooms != null) p.set('maxRooms', String(search.maxRooms));
    if (search.minSizeSqm != null) p.set('minSquaremeter', String(search.minSizeSqm));
    if (search.minFloor != null) p.set('minFloor', String(search.minFloor));
    if (search.maxFloor != null) p.set('maxFloor', String(search.maxFloor));
    if (search.parking) p.set('parking', '1');
    if (search.elevator) p.set('elevator', '1');
    if (search.shelter) p.set('shelter', '1');
    if (search.balcony) p.set('balcony', '1');
    return url.toString();
  };

  if (hoods.length > 0) return hoods.map((h) => buildOne(h.id));
  return [buildOne()];
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  return null;
}

function mapItem(item: any, dealType: DealType): Listing | null {
  if (!item || typeof item !== 'object') return null;
  const sourceId = str(item.token ?? item.orderId);
  if (!sourceId) return null;

  const addr = item.address ?? {};
  const det = item.additionalDetails ?? {};
  const meta = item.metaData ?? {};

  const city = str(addr?.city?.text);
  const neighborhood = str(addr?.neighborhood?.text);
  const streetText = str(addr?.street?.text);
  const houseNum = num(addr?.house?.number);
  const street = streetText && houseNum != null ? `${streetText} ${houseNum}` : streetText;
  const floor = num(addr?.house?.floor);

  const rooms = num(det?.roomsCount);
  const sizeSqm = num(det?.squareMeter ?? meta?.squareMeterBuild);
  const propertyText = str(det?.property?.text);

  const images: string[] = [];
  if (typeof meta?.coverImage === 'string') images.push(meta.coverImage);
  if (Array.isArray(meta?.images)) for (const im of meta.images) if (typeof im === 'string') images.push(im);
  const uniqueImages = Array.from(new Set(images)).filter((u) => /^https?:\/\//.test(u));

  const adType = str(item.adType);
  const isBroker = item.customer != null || adType === 'commercial';

  const tagNames: string[] = Array.isArray(item.tags)
    ? item.tags.map((t: any) => str(t?.name)).filter((s: string | null): s is string => !!s)
    : [];
  const tagText = tagNames.join(' ');
  // Feed tags are sparse marketing highlights, NOT a real amenities list (no
  // elevator tag exists at all, balcony only shows as "2 מרפסות", many items
  // have no tags). So treat a tag match only as a positive hint (true) and
  // leave everything else null/unknown — the authoritative true/false comes
  // from the detail page in enrich() below.
  const hasTag = (re: RegExp): boolean | null => (re.test(tagText) ? true : null);
  const hasParking = hasTag(/חני/);
  const hasElevator = hasTag(/מעלית/);
  const hasShelter = hasTag(/ממ"?ד|ממ״ד|מקלט|ממ"ק/);
  const hasBalcony = hasTag(/מרפס/);

  const agency = str(item?.customer?.agencyName);
  const rawText = [
    propertyText,
    [neighborhood, city].filter(Boolean).join(', '),
    street,
    agency ? `תיווך: ${agency}` : null,
    tagNames.length ? tagNames.join(' · ') : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    source: 'yad2',
    sourceId,
    url: `https://www.yad2.co.il/realestate/item/${sourceId}`,
    dealType,
    price: num(item.price),
    rooms,
    sizeSqm,
    floor,
    city,
    neighborhood,
    street,
    isBroker,
    entryDate: null,
    images: uniqueImages,
    rawText,
    postedAt: null,
    hasParking,
    hasElevator,
    hasShelter,
    hasBalcony,
  };
}

async function readFeedItems(page: Page): Promise<any[]> {
  const text = (await page.evaluate(
    "(document.getElementById('__NEXT_DATA__')||{}).textContent || ''"
  )) as string;
  if (!text) return [];
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const feed = json?.props?.pageProps?.feed;
  if (!feed) return []; // landed on the lobby, not a results page
  return [
    ...(Array.isArray(feed.private) ? feed.private : []),
    ...(Array.isArray(feed.agency) ? feed.agency : []),
    ...(Array.isArray(feed.platinum) ? feed.platinum : []),
  ];
}

// --- Detail-page enrichment -------------------------------------------------
// The search feed does NOT carry real amenity data. Each listing's detail page
// (/realestate/item/<token>) embeds an authoritative `inProperty` object inside
// __NEXT_DATA__.props.pageProps.dehydratedState.queries[].state.data. We read it
// only for the bounded set of listings we're about to send.

async function readDetailData(page: Page): Promise<any | null> {
  const text = (await page.evaluate(
    "(document.getElementById('__NEXT_DATA__')||{}).textContent || ''"
  )) as string;
  if (!text) return null;
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const queries = json?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return null;
  for (const q of queries) {
    const d = q?.state?.data;
    if (d && (d.inProperty || d.token)) return d; // the item query
  }
  return null;
}

function applyDetail(listing: Listing, data: any): void {
  const inProp = data?.inProperty ?? {};
  // Authoritative booleans (key present & true = has it; false/omitted = not).
  listing.hasParking = inProp.includeParking === true;
  listing.hasElevator = inProp.includeElevator === true;
  listing.hasShelter = inProp.includeSecurityRoom === true; // ממ"ד
  listing.hasBalcony = inProp.includeBalcony === true;

  // Opportunistic extras the feed lacks.
  if (inProp.isImmediateEntrance === true) {
    listing.entryDate = 'מיידי';
  } else {
    const entrance = str(data?.additionalDetails?.entranceDate);
    if (entrance) listing.entryDate = entrance.slice(0, 10).split('-').reverse().join('/');
  }
  const created = str(data?.dates?.createdAt);
  if (created) listing.postedAt = created;
  const floor = num(data?.address?.house?.floor);
  if (floor != null) listing.floor = floor;
}

export const yad2: Source = {
  name: 'yad2',
  // Fill authoritative amenity flags (+ entry/posted date) from each listing's
  // detail page. Bounded by the caller to the cards about to be sent. Never throws.
  async enrich(listings: Listing[]): Promise<void> {
    const targets = listings.filter((l) => l.source === 'yad2' && l.sourceId);
    if (targets.length === 0) return;
    await withYad2Context(HEADLESS, async (context) => {
      const page: Page = context.pages()[0] ?? (await context.newPage());
      for (let i = 0; i < targets.length; i++) {
        const l = targets[i];
        try {
          await page.goto(`https://www.yad2.co.il/realestate/item/${l.sourceId}`, {
            waitUntil: 'domcontentloaded',
            timeout: config.yad2NavTimeoutMs,
          });
          await page.waitForTimeout(1000 + Math.floor(Math.random() * 1200));
          if (await pageIsBlocked(page)) {
            console.error('[yad2] enrich blocked at item ' + l.sourceId + ' — keeping tag hints');
            break; // stop hammering the wall; leave remaining as-is
          }
          const data = await readDetailData(page);
          if (data) applyDetail(l, data);
        } catch (err) {
          console.error(
            '[yad2] enrich failed for ' + l.sourceId + ':',
            err instanceof Error ? err.message : err
          );
        }
      }
    });
  },
  async fetch(search: Search): Promise<Listing[]> {
    const urls = buildSearchUrls(search);
    return withYad2Context(HEADLESS, async (context) => {
      try {
        const page: Page = context.pages()[0] ?? (await context.newPage());
        const listings: Listing[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < urls.length; i++) {
          // One retry per URL: a single stuck navigation shouldn't drop the
          // whole search (each neighborhood is a separate URL).
          let loaded = false;
          for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
            try {
              await page.goto(urls[i], {
                waitUntil: 'domcontentloaded',
                timeout: config.yad2NavTimeoutMs,
              });
              loaded = true;
            } catch (navErr) {
              const blocked = await pageIsBlocked(page).catch(() => false);
              console.error(
                `[yad2] nav ${attempt}/2 failed (blocked=${blocked}, at=${page.url()}): ` +
                  (navErr instanceof Error ? navErr.message : navErr)
              );
              if (blocked) throw new Yad2BlockedError();
            }
          }
          if (!loaded) continue; // give up on this URL, try the next neighborhood
          await page.waitForTimeout(i === 0 ? 2000 : 1200);
          if (await pageIsBlocked(page)) throw new Yad2BlockedError();
          for (const raw of await readFeedItems(page)) {
            const mapped = mapItem(raw, search.dealType);
            if (mapped && !seen.has(mapped.sourceId)) {
              seen.add(mapped.sourceId);
              listings.push(mapped);
            }
          }
        }
        return listings;
      } catch (err) {
        if (err instanceof Yad2BlockedError) {
          console.error('[yad2] ' + err.message);
          throw err;
        }
        console.error('[yad2] fetch failed:', err instanceof Error ? err.message : err);
        return [];
      }
    });
  },
};

export default yad2;
