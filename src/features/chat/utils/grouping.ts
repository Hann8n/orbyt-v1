import i18n from '@/i18n';
import type { MessageView } from '@/services/api/types';

export type MessageItem = MessageView & { sender?: { did: string } };

export const MESSAGE_GROUP_WINDOW_MINUTES = 5;

/** List item: message or date separator. */
export type ChatListItem =
  | { type: 'message'; message: MessageItem; showTime: boolean; groupedWithPrevious: boolean }
  | { type: 'date'; dateKey: string; label: string };

export function getMessagePreview(msg: MessageItem): string {
  if (msg.text != null && msg.text !== '') return msg.text;
  return i18n.t('chat.messageDeleted');
}
