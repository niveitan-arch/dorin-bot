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
