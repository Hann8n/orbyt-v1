/**
 * Chat streak: consecutive calendar days with at least one message.
 * Pure function over message timestamps; no API calls.
 * Only consider "active" streak when last message was within the last 24h.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** True if the last message was sent within the last 24 hours (streak still active). */
export function isStreakActive(lastMessageSentAt: string | undefined): boolean {
  if (!lastMessageSentAt || typeof lastMessageSentAt !== 'string') return false;
  const sent = new Date(lastMessageSentAt).getTime();
  return Number.isFinite(sent) && Date.now() - sent < TWENTY_FOUR_HOURS_MS;
}

/** Consecutive days ending at the most recent message day. 0 or 1 = no streak. */
export function getChatStreak(messages: Array<{ sentAt?: string } | null | undefined>): number {
  const days = new Set<string>();
  for (const m of messages) {
    const at = m?.sentAt;
    if (typeof at !== 'string') continue;
    const d = at.slice(0, 10); // YYYY-MM-DD (ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
  }
  if (days.size < 2) return days.size; // 0 or 1 day = no "streak" to show

  const sorted = [...days].sort((a, b) => b.localeCompare(a)); // newest first
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00Z');
    prev.setUTCDate(prev.getUTCDate() - 1);
    const want = prev.toISOString().slice(0, 10);
    if (sorted[i] === want) streak++;
    else break;
  }
  return streak;
}

/** Only show streak when last message was within 24h and count >= 2. One place for the rule. */
export function getActiveStreak(
  lastMessageSentAt: string | undefined,
  messages: Array<{ sentAt?: string } | null | undefined>
): { show: boolean; count: number } {
  if (!isStreakActive(lastMessageSentAt)) return { show: false, count: 0 };
  const count = getChatStreak(messages);
  return { show: count >= 2, count: count >= 2 ? count : 0 };
}
