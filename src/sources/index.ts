import type { Listing, Search, Source } from './types';
import { yad2 } from './yad2';
import { madlan } from './madlan';

export const sources: Source[] = [yad2, madlan];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run every source in sequence for a single search, concatenating results.
 * A small randomized jitter delay is inserted between sources to avoid a
 * burst of near-simultaneous requests. Each source is wrapped in try/catch so
 * one failing source never aborts the others.
 */
export async function fetchAllForSearch(search: Search): Promise<Listing[]> {
  const all: Listing[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];

    if (i > 0) {
      // ~500ms..2000ms jitter between sources.
      await sleep(500 + Math.floor(Math.random() * 1500));
    }

    try {
      const results = await source.fetch(search);
      all.push(...results);
    } catch (err) {
      console.error(
        `[sources] source "${source.name}" failed for search ${search.id}:`,
        err instanceof Error ? err.message : err
      );
      // continue with the next source
    }
  }

  return all;
}

/**
 * Fill detail-only fields (authoritative amenities, entry date) for just the
 * listings about to be sent, grouped by source. Bounded + best-effort; never
 * throws. Shared by the poller (steady-state/first-run sends) and /active.
 */
export async function enrichForSend(listings: Listing[]): Promise<void> {
  if (listings.length === 0) return;
  const byName = new Map<string, Listing[]>();
  for (const l of listings) {
    const group = byName.get(l.source) ?? [];
    group.push(l);
    byName.set(l.source, group);
  }
  for (const [name, group] of byName) {
    const src = sources.find((s) => s.name === name);
    if (!src?.enrich) continue;
    try {
      await src.enrich(group);
    } catch (err) {
      console.error(`[sources] enrich via ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
}
