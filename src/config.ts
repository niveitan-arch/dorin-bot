import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface Config {
  telegramBotToken: string;
  allowedChatIds: number[];
  ownerChatId: number | null;
  pollIntervalMin: number;
  initialSendLimit: number;
  yad2NavTimeoutMs: number;
  yad2IdleCloseMs: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" must be a positive number`);
  }
  return Math.floor(n);
}

function parseChatIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isFinite(n)) {
        throw new Error(`Invalid chat id in ALLOWED_CHAT_IDS: "${s}" is not a number`);
      }
      return n;
    });
}

/**
 * Read the git-tracked, non-secret allowlist file (config/allowlist.json).
 * Resolved from __dirname so it works under both tsx (src/) and node (dist/) —
 * both live one level under the repo root, where config/ sits. Never throws:
 * a missing/invalid file just contributes no ids (env-based ids still apply).
 */
function parseAllowlistFile(): { chatIds: number[]; owner: number | null } {
  const path = join(__dirname, '..', 'config', 'allowlist.json');
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const ids = Array.isArray(parsed?.chatIds) ? parsed.chatIds : [];
    const chatIds = ids
      .map((v: unknown) => Number(v))
      .filter((n: number) => Number.isFinite(n));
    const ownerRaw = Number(parsed?.owner);
    const owner = Number.isFinite(ownerRaw) ? ownerRaw : null;
    return { chatIds, owner };
  } catch (err) {
    console.warn(`[config] could not read allowlist file (${path}):`, err instanceof Error ? err.message : err);
    return { chatIds: [], owner: null };
  }
}

function parsePollInterval(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) return 4;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid POLL_INTERVAL_MIN: "${raw}" must be a positive number`);
  }
  return n;
}

function parseInitialLimit(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) return 10;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid INITIAL_MATCHES_LIMIT: "${raw}" must be a non-negative number`);
  }
  return Math.floor(n);
}

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramBotToken || telegramBotToken.trim().length === 0) {
  throw new Error(
    'TELEGRAM_BOT_TOKEN is missing. Copy .env.example to .env and set it (get a token from @BotFather).'
  );
}

const allowlist = parseAllowlistFile();
const allowedChatIds = [...new Set([...allowlist.chatIds, ...parseChatIds(process.env.ALLOWED_CHAT_IDS)])];

export const config: Config = {
  telegramBotToken: telegramBotToken.trim(),
  // Union of the git-tracked allowlist file and any ids in .env (deduped).
  allowedChatIds,
  // Who gets operational alerts (e.g. Yad2 session expired). Explicit "owner" in
  // the allowlist file wins; otherwise the first allowed id.
  ownerChatId: allowlist.owner ?? allowedChatIds[0] ?? null,
  pollIntervalMin: parsePollInterval(process.env.POLL_INTERVAL_MIN),
  initialSendLimit: parseInitialLimit(process.env.INITIAL_MATCHES_LIMIT),
  yad2NavTimeoutMs: parsePositiveInt(process.env.YAD2_NAV_TIMEOUT_MS, 20000, 'YAD2_NAV_TIMEOUT_MS'),
  yad2IdleCloseMs: parsePositiveInt(process.env.YAD2_IDLE_CLOSE_MS, 90000, 'YAD2_IDLE_CLOSE_MS'),
};
