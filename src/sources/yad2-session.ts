import path from 'path';
import { chromium, BrowserContext, Page } from 'playwright';
import { config } from '../config';

// Persistent profile dir: cookies/localStorage from the one-time manual captcha
// solve are stored here and reused by every headless fetch. Solve once with
// `npm run yad2:login`, then the bot reuses this profile.
export const PROFILE_DIR = path.join(process.cwd(), 'data', 'yad2-profile');

// A normal (non-"Headless") Chrome UA matching Playwright's bundled Chromium
// major version, on Linux to stay consistent with the actual WSL environment.
export const YAD2_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

// Minimal stealth: hide the most obvious automation tells before any page script runs.
const STEALTH_INIT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'languages', { get: () => ['he-IL','he','en-US','en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
  window.chrome = window.chrome || { runtime: {} };
  const _q = window.navigator.permissions && window.navigator.permissions.query;
  if (_q) {
    window.navigator.permissions.query = (p) =>
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _q(p);
  }
`;

// The persistent profile can only be opened by ONE browser at a time, so all
// Yad2 browser work (poller fetches + amenity enrichment) is serialized through
// this queue to avoid profile-lock crashes. To avoid the ~1-3s cost of launching
// and closing Chromium on every call (the poller does fetch+enrich per search),
// the context is opened lazily, REUSED across serialized calls, and only closed
// after an idle period.
let queue: Promise<unknown> = Promise.resolve();
let sharedCtx: BrowserContext | null = null;
let sharedHeadless: boolean | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const ctx = sharedCtx;
    sharedCtx = null; // detach synchronously so no in-flight call uses a closing ctx
    sharedHeadless = null;
    idleTimer = null;
    if (ctx) ctx.close().catch(() => undefined);
  }, config.yad2IdleCloseMs);
  idleTimer.unref?.();
}

async function discardSharedCtx(): Promise<void> {
  const ctx = sharedCtx;
  sharedCtx = null;
  sharedHeadless = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (ctx) {
    try {
      await ctx.close();
    } catch {
      /* ignore close errors */
    }
  }
}

export function withYad2Context<T>(
  headless: boolean,
  fn: (ctx: BrowserContext) => Promise<T>
): Promise<T> {
  const run = async (): Promise<T> => {
    // Cancel any pending idle close before reusing/launching.
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    // Relaunch if absent or if the requested mode differs from the warm context.
    if (sharedCtx && sharedHeadless !== headless) {
      await discardSharedCtx();
    }
    if (!sharedCtx) {
      sharedCtx = await launchYad2Context(headless);
      sharedHeadless = headless;
    }
    try {
      return await fn(sharedCtx);
    } catch (err) {
      // A failed call may have left the context wedged/crashed — start fresh next time.
      await discardSharedCtx();
      throw err;
    } finally {
      // If the context survived, keep it warm for the next call, then idle-close.
      if (sharedCtx) scheduleIdleClose();
    }
  };
  const result = queue.then(run, run);
  // Keep the chain alive regardless of success/failure, without leaking results.
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function launchYad2Context(headless: boolean): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1366, height: 900 },
    locale: 'he-IL',
    userAgent: YAD2_UA,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' },
  });
  await ctx.addInitScript(STEALTH_INIT);
  return ctx;
}

// Has Yad2 bounced us to the ShieldSquare / Radware bot-manager captcha?
export async function pageIsBlocked(page: Page): Promise<boolean> {
  const url = page.url();
  if (/perfdrive\.com|shieldsquare|validate\.perfdrive/i.test(url)) return true;
  try {
    const title = (await page.title()).toLowerCase();
    if (/shieldsquare|captcha|attention required|are you for real/.test(title)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

// Thrown by yad2.fetch when the session is missing/expired and we hit the wall.
export class Yad2BlockedError extends Error {
  constructor() {
    super('Yad2 is showing the anti-bot captcha. Run `npm run yad2:login` and solve it once to refresh the session.');
    this.name = 'Yad2BlockedError';
  }
}
