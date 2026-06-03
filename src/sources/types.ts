export type DealType = 'rent' | 'sale';

export interface Listing {
  source: string;           // 'yad2' | 'madlan'
  sourceId: string;         // stable id from the source
  url: string;
  dealType: DealType;
  price: number | null;     // ILS
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  isBroker: boolean | null;
  entryDate: string | null; // ISO date or free text
  images: string[];
  rawText: string;
  postedAt: string | null;  // ISO
  // Amenities (parsed from listing tags; null = unknown)
  hasParking: boolean | null;
  hasElevator: boolean | null;
  hasShelter: boolean | null;
  hasBalcony: boolean | null;
}

// Where to search: a city/area (shared base params) plus zero or more
// neighborhoods inside it. Empty neighborhoods = the whole city/area.
// (Yad2 has no working multi-neighborhood param, so we fetch one per hood.)
export interface YadLocation {
  label: string;                                  // display, e.g. "תל אביב יפו · הצפון החדש, פלורנטין"
  base: Record<string, string | number>;          // { topArea, area, city? }
  neighborhoods: { id: string; name: string }[];  // [] = whole city/area
}

export interface Search {
  id: number;
  chatId: number;
  label: string;
  location: YadLocation | null; // where to search (drives the Yad2 URL)
  minRooms: number | null;
  maxRooms: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minSizeSqm: number | null;
  minFloor: number | null;
  maxFloor: number | null;
  parking: boolean;
  elevator: boolean;
  shelter: boolean;  // ממ"ד / מקלט
  balcony: boolean;
  dealType: DealType;
  brokerOk: boolean; // false = private listings only
  active: boolean;
}

export interface Source {
  name: string;
  fetch(search: Search): Promise<Listing[]>;
  // Optional: fill detail-only fields (e.g. authoritative amenities) in place.
  // Called only for the bounded set of listings about to be sent. Never throws.
  enrich?(listings: Listing[]): Promise<void>;
}
