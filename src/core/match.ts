import type { Listing, Search } from '../sources/types';

// Location + amenities are filtered server-side by Yad2 (via the search URL),
// so match() is a numeric safety net + broker/private gate over what came back.
export function matches(listing: Listing, search: Search): boolean {
  if (listing.dealType !== search.dealType) return false;

  if (search.minPrice !== null || search.maxPrice !== null) {
    if (listing.price === null) return false;
    if (search.minPrice !== null && listing.price < search.minPrice) return false;
    if (search.maxPrice !== null && listing.price > search.maxPrice) return false;
  }

  if (search.minRooms !== null || search.maxRooms !== null) {
    if (listing.rooms === null) return false;
    if (search.minRooms !== null && listing.rooms < search.minRooms) return false;
    if (search.maxRooms !== null && listing.rooms > search.maxRooms) return false;
  }

  if (search.minSizeSqm !== null) {
    if (listing.sizeSqm === null) return false;
    if (listing.sizeSqm < search.minSizeSqm) return false;
  }

  if (search.minFloor !== null || search.maxFloor !== null) {
    if (listing.floor === null) return false;
    if (search.minFloor !== null && listing.floor < search.minFloor) return false;
    if (search.maxFloor !== null && listing.floor > search.maxFloor) return false;
  }

  // Broker gate: if brokerOk is false, drop broker listings.
  if (search.brokerOk === false && listing.isBroker === true) return false;

  return true;
}
