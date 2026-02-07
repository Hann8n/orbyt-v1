import { differenceInCalendarDays, isToday, isYesterday, isValid, parseISO } from 'date-fns';

/**
 * Chat streaks work on calendar days and require both participants
 * to send at least one message per day.
 */

/** Set to true to re-enable streak badges in chat header and ChatsTab. */
const STREAKS_ENABLED = false;

type StreakMessage = { sentAt?: string; sender?: { did?: string } } | null | undefined;

export const isStreakActive = (lastMessageSentAt?: string): boolean => {
  if (!STREAKS_ENABLED) return false;
  if (!lastMessageSentAt) return false;
  const d = parseISO(lastMessageSentAt);
  return isValid(d) && (isToday(d) || isYesterday(d));
};

export function getChatStreak(
  messages: Array<StreakMessage>,
  currentUserDid: string | undefined,
  lastMessageSentAt?: string
): number {
  if (!currentUserDid) return 0;

  const dayToSenders = new Map<string, Set<string>>();
  for (const m of messages) {
    const at = m?.sentAt;
    const did = m?.sender?.did;
    if (!at || !did) continue;
    const d = parseISO(at);
    if (!isValid(d)) continue;
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    let senders = dayToSenders.get(key);
    if (!senders) dayToSenders.set(key, (senders = new Set<string>()));
    senders.add(did);
  }

  const daysWithBoth = [...dayToSenders.entries()]
    .filter(([, senders]) => senders.has(currentUserDid) && senders.size >= 2)
    .map(([key]) => key)
    .sort();
  if (!daysWithBoth.length) return 0;

  // Streak must end on the same calendar day as the last message,
  // otherwise it's an old streak that should no longer show.
  if (lastMessageSentAt) {
    const d = parseISO(lastMessageSentAt);
    if (!isValid(d)) return 0;
    const lastDayKey = d.toISOString().slice(0, 10);
    const mostRecentBothDay = daysWithBoth[daysWithBoth.length - 1];
    if (mostRecentBothDay !== lastDayKey) return 0;
  }

  let streak = 1;
  for (let i = daysWithBoth.length - 1; i > 0; i--) {
    const cur = parseISO(daysWithBoth[i]);
    const prev = parseISO(daysWithBoth[i - 1]);
    if (!isValid(cur) || !isValid(prev)) break;
    if (differenceInCalendarDays(cur, prev) !== 1) break;
    streak++;
  }
  return streak;
}

/** Only show streak when last message was within 24h and count >= 2. Both participants must send each day. */
export function getActiveStreak(
  lastMessageSentAt: string | undefined,
  messages: Array<StreakMessage>,
  currentUserDid?: string
): { show: boolean; count: number } {
  if (!STREAKS_ENABLED) return { show: false, count: 0 };
  if (!isStreakActive(lastMessageSentAt)) return { show: false, count: 0 };
  const count = getChatStreak(messages, currentUserDid, lastMessageSentAt);
  return { show: count >= 2, count: count >= 2 ? count : 0 };
}
