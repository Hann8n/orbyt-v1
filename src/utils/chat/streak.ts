/**
 * Chat streak: consecutive calendar days with both participants sending at least one message.
 * Pure function over message timestamps; no API calls.
 * Only consider "active" streak when last message was within the last 24h.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

type StreakMessage = { sentAt?: string; sender?: { did?: string } } | null | undefined;

/** True if the last message was sent within the last 24 hours (streak still active). */
export function isStreakActive(lastMessageSentAt: string | undefined): boolean {
  if (!lastMessageSentAt || typeof lastMessageSentAt !== 'string') return false;
  const sent = new Date(lastMessageSentAt).getTime();
  return Number.isFinite(sent) && Date.now() - sent < TWENTY_FOUR_HOURS_MS;
}

/**
 * Consecutive days where BOTH participants sent at least one message, ending at the most recent day.
 * Returns 0 if < 2 such days. Requires currentUserDid to identify participants.
 */
export function getChatStreak(
  messages: Array<StreakMessage>,
  currentUserDid: string | undefined
): number {
  if (!currentUserDid) return 0;

  // Map: date -> Set of sender DIDs who sent on that day
  const dayToSenders = new Map<string, Set<string>>();
  for (const m of messages) {
    const at = m?.sentAt;
    const senderDid = m?.sender?.did;
    if (typeof at !== 'string' || typeof senderDid !== 'string') continue;
    const d = at.slice(0, 10); // YYYY-MM-DD (ISO)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    let senders = dayToSenders.get(d);
    if (!senders) {
      senders = new Set<string>();
      dayToSenders.set(d, senders);
    }
    senders.add(senderDid);
  }

  // Only count days where both participants (current user + at least one other) sent
  const daysWithBoth = [...dayToSenders.entries()]
    .filter(([, senders]) => senders.has(currentUserDid) && senders.size >= 2)
    .map(([d]) => d);

  if (daysWithBoth.length < 2) return daysWithBoth.length;

  const sorted = [...daysWithBoth].sort((a, b) => b.localeCompare(a)); // newest first
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

/** Only show streak when last message was within 24h and count >= 2. Both participants must send each day. */
export function getActiveStreak(
  lastMessageSentAt: string | undefined,
  messages: Array<StreakMessage>,
  currentUserDid?: string
): { show: boolean; count: number } {
  if (!isStreakActive(lastMessageSentAt)) return { show: false, count: 0 };
  const count = getChatStreak(messages, currentUserDid);
  return { show: count >= 2, count: count >= 2 ? count : 0 };
}
