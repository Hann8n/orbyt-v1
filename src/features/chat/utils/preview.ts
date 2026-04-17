/**
 * Preview + member selectors for ConvoView. Extracted from ChatsTab so the
 * conversation row component stays small and the logic is reusable from
 * notifications, search results, etc.
 */

import i18n from '../../../i18n';
import { ChatBskyConvoDefs } from '@atproto/api';
import { formatHandle } from '../../../utils/formatting/handles';
import type { ProfileViewBasic, RecordValue } from '../../../services/api/types';

type ConvoView = ChatBskyConvoDefs.ConvoView;

interface EmbedRecordViewRecord {
  $type?: string;
  author?: ProfileViewBasic;
  value?: RecordValue;
  notFound?: boolean;
  blocked?: boolean;
  detached?: boolean;
}

/** Preview from listConvos lastMessage (API may omit $type; accept object with text). */
export function getLastMessagePreview(
  lastMessage: ConvoView['lastMessage'],
  currentUserDid: string | undefined
): string {
  if (!lastMessage || typeof lastMessage !== 'object') return '';
  if (ChatBskyConvoDefs.isMessageView(lastMessage)) {
    const msg = lastMessage as ChatBskyConvoDefs.MessageView;
    const senderDid = (msg as { sender?: { did?: string } }).sender?.did;
    const isFromMe = !!currentUserDid && !!senderDid && senderDid === currentUserDid;
    const embed = (msg as { embed?: unknown }).embed;
    if (embed && typeof embed === 'object') {
      const embedType = (embed as { $type?: string }).$type;
      if (
        (embedType === 'app.bsky.embed.record#view' || embedType === 'app.bsky.embed.record') &&
        'record' in embed
      ) {
        const record = (embed as { record?: EmbedRecordViewRecord }).record;
        if (record && typeof record === 'object') {
          const recordType = record.$type;
          if (recordType === 'app.bsky.embed.record#viewRecord' && record.author && record.value) {
            const authorHandleRaw = (record as { author?: { handle?: string } }).author?.handle;
            const authorHandle = authorHandleRaw ? formatHandle(authorHandleRaw) : '';
            const base = isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
            return authorHandle ? `${base} by @${authorHandle}` : base;
          }
          if (
            recordType === 'app.bsky.embed.record#viewNotFound' ||
            recordType === 'app.bsky.embed.record#viewBlocked' ||
            recordType === 'app.bsky.embed.record#viewDetached' ||
            record.notFound === true ||
            record.blocked === true ||
            record.detached === true
          ) {
            return isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
          }
        }
        return isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
      }
    }
    return msg.text ?? '';
  }
  if ('text' in lastMessage && typeof (lastMessage as { text?: string }).text === 'string') {
    return (lastMessage as { text: string }).text;
  }
  return i18n.t('chat.messageDeleted');
}

export function getOtherMember(
  convo: ConvoView,
  currentDid: string | undefined
): ConvoView['members'][number] | undefined {
  const others = convo.members?.filter(m => m.did !== currentDid) ?? [];
  return others[0];
}
