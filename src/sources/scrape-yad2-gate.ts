/**
 * Manual test gate for the Yad2 source.
 *
 * Run with: npm run scrape:yad2   (i.e. tsx src/sources/scrape-yad2-gate.ts)
 *
 * Constructs a broad Tel Aviv rental search and prints how many normalized
 * listings came back plus the first 3 as pretty JSON. If zero results come
 * back it almost always means Yad2 served a block / captcha page instead of
 * the feed XHR.
 */
import { yad2 } from './yad2';
import type { Search } from './types';

const search: Search = {
  id: 0,
  chatId: 0,
  label: 'GATE: Tel Aviv rent 2-4 rooms up to 8000',
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

async function main(): Promise<void> {
  console.log('[gate] fetching Yad2 for:', search.label);
  const listings = await yad2.fetch(search);

  console.log(`[gate] got ${listings.length} normalized listing(s)`);

  if (listings.length === 0) {
    console.log(
      '[gate] HINT: zero results usually means Yad2 blocked the request ' +
        '(captcha / anti-bot page) or changed its feed path. Try re-running, ' +
        'check that the feed XHR matcher still hits gw.yad2.co.il, or inspect ' +
        'a live search in DevTools to confirm the current feed URL + shape.'
    );
    return;
  }

  console.log('[gate] first 3 listings:');
  console.log(JSON.stringify(listings.slice(0, 3), null, 2));
}

main().catch((err) => {
  console.error('[gate] unexpected failure:', err);
  process.exitCode = 1;
});
