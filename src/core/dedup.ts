import type { Listing } from '../sources/types';

export function fingerprint(l: Listing): string {
  return `${l.source}:${l.sourceId}`;
}

function norm(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().toLowerCase();
}

export function fuzzyKey(l: Listing): string {
  return [norm(l.price), norm(l.rooms), norm(l.sizeSqm), norm(l.street)].join('|');
}
