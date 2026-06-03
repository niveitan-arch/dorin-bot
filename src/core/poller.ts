import type { Telegram } from 'telegraf';
import { config } from '../config';
import { fetchAllForSearch, enrichForSend } from '../sources';
import { sendListing } from '../bot/notify';
import {
  getAllActiveSearches,
  hasSeen,
  markSeen,
  isSearchBaselined,
  markSearchBaselined,
} from './db';
import { fingerprint } from './dedup';
import { matches } from './match';

async function runCycle(telegram: Telegram): Promise<void> {
  try {
    const searches = getAllActiveSearches();
    for (const search of searches) {
      try {
        const listings = await fetchAllForSearch(search);
        const hits = listings.filter((l) => matches(l, search));
        const firstRun = !isSearchBaselined(search.id);

        if (firstRun) {
          // On a brand-new search, send the current matches once (capped), so the
          // user immediately sees what's available, then mark ALL of them seen so
          // only genuinely new listings are sent afterwards.
          const limit = config.initialSendLimit;
          const unseen = hits.filter((l) => !hasSeen(search.id, fingerprint(l)));
          const toSend = unseen.slice(0, limit);
          await enrichForSend(toSend); // accurate amenities only for what we send
          for (const listing of toSend) {
            await sendListing(telegram, search.chatId, listing, { id: search.id, label: search.label });
          }
          // Mark ALL current matches seen (including the suppressed overflow) so
          // they're never re-sent later.
          for (const listing of hits) {
            markSeen(search.id, fingerprint(listing), listing.source, listing.sourceId);
          }
          markSearchBaselined(search.id);
          console.log(
            `[poller] search ${search.id} first run: sent ${toSend.length}, suppressed ${hits.length - toSend.length} (cap ${limit})`
          );
        } else {
          const unseen = hits.filter((l) => !hasSeen(search.id, fingerprint(l)));
          await enrichForSend(unseen);
          for (const listing of unseen) {
            const fp = fingerprint(listing);
            markSeen(search.id, fp, listing.source, listing.sourceId);
            await sendListing(telegram, search.chatId, listing, { id: search.id, label: search.label });
          }
        }
      } catch (err) {
        console.error(`[poller] error processing search ${search.id} (${search.label}):`, err);
      }
    }
  } catch (err) {
    console.error('[poller] cycle error:', err);
  }
}

let cycleRunning = false;

async function runCycleGuarded(telegram: Telegram): Promise<void> {
  // The Yad2 persistent browser profile can only be opened once at a time, so
  // never let a slow cycle overlap the next interval tick.
  if (cycleRunning) {
    console.warn('[poller] previous cycle still running — skipping this tick');
    return;
  }
  cycleRunning = true;
  try {
    await runCycle(telegram);
  } finally {
    cycleRunning = false;
  }
}

export function startPolling(telegram: Telegram): void {
  // Run one cycle immediately, then on the configured interval.
  void runCycleGuarded(telegram);
  const intervalMs = config.pollIntervalMin * 60 * 1000;
  setInterval(() => {
    void runCycleGuarded(telegram);
  }, intervalMs);
}
