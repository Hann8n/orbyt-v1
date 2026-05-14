import { format, parseISO, isValid, isToday, isYesterday, isSameDay, differenceInMinutes } from 'date-fns';
import i18n from '@/i18n';
import type { MessageView } from '@/services/api/types';

export type MessageItem = MessageView & { sender?: { did: string } };

export type ChatListItem =
  | { type: 'message'; message: MessageItem; showTime: boolean; groupedWithPrevious: boolean }
  | { type: 'date'; dateKey: string; label: string };

/** Window in minutes for grouping consecutive messages from same sender */
const MESSAGE_GROUP_WINDOW_MINUTES = 5;

function dayLabel(date: Date): string {
  if (isToday(date)) return i18n.t('chat.today');
  if (isYesterday(date)) return i18n.t('chat.yesterday');
  return format(date, 'EEEE, MMM d');
}

function isWithinWindow(sentAtA: string, sentAtB: string): boolean {
  const d1 = parseISO(sentAtA);
  const d2 = parseISO(sentAtB);
  return (
    isValid(d1) &&
    isValid(d2) &&
    Math.abs(differenceInMinutes(d1, d2)) <= MESSAGE_GROUP_WINDOW_MINUTES
  );
}

/**
 * Transforms a newest-first message array into a ChatListItem[] in newest-first
 * order, suitable for FlashList with `inverted={true}`.
 *
 * In an inverted list index 0 is at the visual bottom and higher indices are
 * above it. Date separators are inserted AFTER the last message of each day so
 * they sit between day groups (e.g. today's messages → "Today" → yesterday's).
 */
export function buildChatListData(messages: MessageItem[]): ChatListItem[] {
  if (!messages.length) return [];

  const items: ChatListItem[] = [];
  let currentDay: Date | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const sentAt = msg.sentAt ?? '';
    const date = sentAt ? parseISO(sentAt) : null;
    const hasValidDate = date && isValid(date);

    // When the day changes, emit a separator for the previous day
    if (hasValidDate) {
      if (!currentDay || !isSameDay(date, currentDay)) {
        if (currentDay) {
          items.push({
            type: 'date',
            dateKey: format(currentDay, 'yyyy-MM-dd'),
            label: dayLabel(currentDay),
          });
        }
        currentDay = date;
      }
    }

    const prevMsg = messages[i - 1]; // newer (visually below)
    const nextMsg = messages[i + 1]; // older (visually above)

    const sameSenderAsPrev =
      prevMsg && prevMsg.sender?.did && msg.sender?.did === prevMsg.sender.did;
    const withinWindowPrev =
      sentAt && prevMsg?.sentAt ? isWithinWindow(sentAt, prevMsg.sentAt) : false;

    const sameSenderAsNext =
      nextMsg && nextMsg.sender?.did && msg.sender?.did === nextMsg.sender.did;
    const withinWindowNext =
      sentAt && nextMsg?.sentAt ? isWithinWindow(sentAt, nextMsg.sentAt) : false;

    const hasReactions = (msg.reactions ?? []).length > 0;

    // In inverted list the message visually ABOVE is nextMsg (older)
    const groupedWithPrevious = !!sameSenderAsNext && withinWindowNext;
    // In inverted list the message visually BELOW is prevMsg (newer)
    const showTime = !sameSenderAsPrev || !withinWindowPrev || hasReactions;

    items.push({ type: 'message', message: msg, showTime, groupedWithPrevious });
  }

  // Separator for the last (oldest) day
  if (currentDay) {
    items.push({
      type: 'date',
      dateKey: format(currentDay, 'yyyy-MM-dd'),
      label: dayLabel(currentDay),
    });
  }

  return items;
}
