import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config';
import type { Search, DealType } from '../sources/types';

const DB_PATH = path.join('data', 'dorin.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chat_id INTEGER PRIMARY KEY,
      name TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      label TEXT,
      location_label TEXT,
      location_params TEXT,
      min_rooms REAL,
      max_rooms REAL,
      min_price REAL,
      max_price REAL,
      min_size_sqm REAL,
      min_floor REAL,
      max_floor REAL,
      parking INTEGER,
      elevator INTEGER,
      shelter INTEGER,
      balcony INTEGER,
      deal_type TEXT,
      broker_ok INTEGER,
      active INTEGER,
      baselined INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS seen_listings (
      search_id INTEGER,
      fingerprint TEXT,
      source TEXT,
      source_id TEXT,
      first_seen TEXT,
      PRIMARY KEY (search_id, fingerprint)
    );
  `);
}

export function upsertUser(chatId: number, name: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO users (chat_id, name, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name`
  ).run(chatId, name, new Date().toISOString());
}

export function isAllowed(chatId: number): boolean {
  return config.allowedChatIds.includes(chatId);
}

interface SearchRow {
  id: number;
  chat_id: number;
  label: string;
  location_label: string | null;
  location_params: string | null;
  min_rooms: number | null;
  max_rooms: number | null;
  min_price: number | null;
  max_price: number | null;
  min_size_sqm: number | null;
  min_floor: number | null;
  max_floor: number | null;
  parking: number;
  elevator: number;
  shelter: number;
  balcony: number;
  deal_type: string;
  broker_ok: number;
  active: number;
}

function rowToSearch(row: SearchRow): Search {
  let location: Search['location'] = null;
  if (row.location_params) {
    try {
      const loc = JSON.parse(row.location_params);
      if (loc && typeof loc === 'object' && loc.base) {
        location = {
          label: loc.label ?? row.location_label ?? '',
          base: loc.base ?? {},
          neighborhoods: Array.isArray(loc.neighborhoods) ? loc.neighborhoods : [],
        };
      }
    } catch {
      location = null;
    }
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    label: row.label,
    location,
    minRooms: row.min_rooms,
    maxRooms: row.max_rooms,
    minPrice: row.min_price,
    maxPrice: row.max_price,
    minSizeSqm: row.min_size_sqm,
    minFloor: row.min_floor,
    maxFloor: row.max_floor,
    parking: !!row.parking,
    elevator: !!row.elevator,
    shelter: !!row.shelter,
    balcony: !!row.balcony,
    dealType: row.deal_type as DealType,
    brokerOk: !!row.broker_ok,
    active: !!row.active,
  };
}

export function createSearch(s: Omit<Search, 'id'>): number {
  const d = getDb();
  const info = d
    .prepare(
      `INSERT INTO searches
       (chat_id, label, location_label, location_params, min_rooms, max_rooms, min_price, max_price,
        min_size_sqm, min_floor, max_floor, parking, elevator, shelter, balcony, deal_type, broker_ok, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      s.chatId,
      s.label,
      s.location?.label ?? null,
      s.location ? JSON.stringify(s.location) : null,
      s.minRooms,
      s.maxRooms,
      s.minPrice,
      s.maxPrice,
      s.minSizeSqm,
      s.minFloor,
      s.maxFloor,
      s.parking ? 1 : 0,
      s.elevator ? 1 : 0,
      s.shelter ? 1 : 0,
      s.balcony ? 1 : 0,
      s.dealType,
      s.brokerOk ? 1 : 0,
      s.active ? 1 : 0,
      new Date().toISOString()
    );
  return Number(info.lastInsertRowid);
}

export function listSearches(chatId: number): Search[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM searches WHERE chat_id = ? ORDER BY id`)
    .all(chatId) as SearchRow[];
  return rows.map(rowToSearch);
}

export function getAllActiveSearches(): Search[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM searches WHERE active = 1 ORDER BY id`)
    .all() as SearchRow[];
  return rows.map(rowToSearch);
}

export function deleteSearch(id: number, chatId: number): void {
  const d = getDb();
  d.prepare(`DELETE FROM searches WHERE id = ? AND chat_id = ?`).run(id, chatId);
}

export function setSearchActive(id: number, chatId: number, active: boolean): void {
  const d = getDb();
  d.prepare(`UPDATE searches SET active = ? WHERE id = ? AND chat_id = ?`).run(
    active ? 1 : 0,
    id,
    chatId
  );
}

export function isSearchBaselined(id: number): boolean {
  const d = getDb();
  const row = d.prepare(`SELECT baselined FROM searches WHERE id = ?`).get(id) as
    | { baselined: number }
    | undefined;
  return !!row && !!row.baselined;
}

export function markSearchBaselined(id: number): void {
  const d = getDb();
  d.prepare(`UPDATE searches SET baselined = 1 WHERE id = ?`).run(id);
}

// "Seen" is tracked PER SEARCH so overlapping searches (e.g. different friends)
// each get their own listings instead of one stealing them from the others.
export function hasSeen(searchId: number, fingerprint: string): boolean {
  const d = getDb();
  const row = d
    .prepare(`SELECT 1 FROM seen_listings WHERE search_id = ? AND fingerprint = ? LIMIT 1`)
    .get(searchId, fingerprint);
  return !!row;
}

export function markSeen(
  searchId: number,
  fingerprint: string,
  source: string,
  sourceId: string
): void {
  const d = getDb();
  d.prepare(
    `INSERT OR IGNORE INTO seen_listings
     (search_id, fingerprint, source, source_id, first_seen)
     VALUES (?, ?, ?, ?, ?)`
  ).run(searchId, fingerprint, source, sourceId, new Date().toISOString());
}
