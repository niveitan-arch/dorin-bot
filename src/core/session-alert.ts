import type { Telegram } from 'telegraf';

// Proactive owner alert when the Yad2 anti-bot session goes down. State is held
// in-memory (module-level): a process restart simply re-alerts once on the next
// block, which is acceptable. The poller drives this — it runs every cycle and
// holds bot.telegram — calling reportYad2Blocked() when a fetch hits the wall and
// reportYad2Ok() after any successful fetch.

let blocked = false;
let lastAlertAt = 0;
const REMIND_MS = 6 * 60 * 60 * 1000; // while still down, re-remind at most every 6h

const BLOCKED_MESSAGE =
  '⚠️ <b>הסשן של יד2 פג</b>\n' +
  'הבוט לא מצליח לשלוף דירות כרגע (חומת אנטי-בוט).\n\n' +
  'לריענון על ה-Mac:\n' +
  '<code>cd ~/dorin-bot &amp;&amp; pm2 stop dorin-bot &amp;&amp; npm run yad2:login</code>\n' +
  'לפתור קאפצ׳ה עד שרואים דירות, לסגור את החלון, ואז:\n' +
  '<code>pm2 start dorin-bot</code>';

const RECOVERED_MESSAGE = '✅ הסשן של יד2 חזר לפעול — החיפושים ממשיכים כרגיל.';

/** Yad2 fetch hit the anti-bot wall. Alert the owner once per episode (6h re-reminder). */
export async function reportYad2Blocked(telegram: Telegram, ownerChatId?: number): Promise<void> {
  if (!ownerChatId) return;
  const now = Date.now();
  if (blocked && now - lastAlertAt < REMIND_MS) return; // already told them recently
  blocked = true;
  lastAlertAt = now;
  try {
    await telegram.sendMessage(ownerChatId, BLOCKED_MESSAGE, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[session-alert] failed to send blocked alert:', err instanceof Error ? err.message : err);
  }
}

/** A fetch succeeded. If we had alerted about a block, send the all-clear once. */
export async function reportYad2Ok(telegram: Telegram, ownerChatId?: number): Promise<void> {
  if (!blocked || !ownerChatId) return;
  blocked = false;
  lastAlertAt = 0;
  try {
    await telegram.sendMessage(ownerChatId, RECOVERED_MESSAGE);
  } catch (err) {
    console.error('[session-alert] failed to send recovery alert:', err instanceof Error ? err.message : err);
  }
}
