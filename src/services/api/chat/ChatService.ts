/**
 * Chat service – wraps chat.bsky.convo API endpoints directly.
 * All methods use the atproto-proxy header for bsky_chat.
 */

import { AtprotoService } from '../AtprotoService';
import type { ConvoView, MessageView } from '../types';

const CHAT_SERVICE_DID = 'did:web:api.bsky.chat';

const chatOpts = () => ({
  headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` as const },
});

export interface ConversationsResponse {
  conversations: ConvoView[];
  cursor: string | null;
}

export interface MessagesResponse {
  messages: (MessageView | { id: string; rev: string; sender: { did: string }; sentAt: string })[];
  cursor: string | null;
}

export const ChatService = {
  /** chat.bsky.convo.listConvos */
  async listConvos(cursor: string | null = null): Promise<ConversationsResponse> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.listConvos(
      { limit: 50, ...(cursor && { cursor }) },
      chatOpts()
    );
    return {
      conversations: res.data?.convos ?? [],
      cursor: res.data?.cursor ?? null,
    };
  },

  /** chat.bsky.convo.getConvo */
  async getConvo(convoId: string): Promise<ConvoView | null> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.getConvo({ convoId }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getConvoForMembers */
  async getConvoForMembers(members: string[]): Promise<ConvoView | null> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.getConvoForMembers({ members }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getConvoAvailability */
  async getConvoAvailability(userDid: string): Promise<ConvoView | null> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.getConvoAvailability({ userDid }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getMessages */
  async getMessages(convoId: string, cursor: string | null = null): Promise<MessagesResponse> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.getMessages(
      { convoId, limit: 50, ...(cursor && { cursor }) },
      chatOpts()
    );
    const data = res.data as { messages?: unknown[]; logs?: unknown[]; cursor?: string | null };
    return {
      messages: data?.messages ?? data?.logs ?? [],
      cursor: data?.cursor ?? null,
    };
  },

  /** chat.bsky.convo.getLog */
  async getLog(cursor: string | null = null): Promise<{ cursor?: string; log: unknown[] }> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.getLog(cursor ? { cursor } : undefined, chatOpts());
    return { cursor: res.data?.cursor, log: res.data?.log ?? [] };
  },

  /** chat.bsky.convo.sendMessage */
  async sendMessage(convoId: string, message: { text: string }): Promise<MessageView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.sendMessage(
      { convoId, message: { text: message.text } },
      chatOpts()
    );
    return res.data as MessageView;
  },

  /** chat.bsky.convo.sendMessageBatch */
  async sendMessageBatch(
    convoId: string,
    items: { message: { text: string } }[]
  ): Promise<MessageView[]> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.sendMessageBatch(
      { convoId, items: items.map(i => ({ message: i.message })) },
      chatOpts()
    );
    return (res.data?.items ?? []).map((x: { message: MessageView }) => x.message);
  },

  /** chat.bsky.convo.updateRead */
  async updateRead(convoId: string, messageId?: string): Promise<ConvoView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.updateRead(
      { convoId, ...(messageId && { messageId }) },
      chatOpts()
    );
    return res.data!.convo;
  },

  /** chat.bsky.convo.updateAllRead */
  async updateAllRead(): Promise<void> {
    const { api } = await AtprotoService.getApiClient();
    await api.chat.bsky.convo.updateAllRead(undefined, chatOpts());
  },

  /** chat.bsky.convo.addReaction */
  async addReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.addReaction({ convoId, messageId, value }, chatOpts());
    return res.data!.message;
  },

  /** chat.bsky.convo.removeReaction */
  async removeReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.removeReaction({ convoId, messageId, value }, chatOpts());
    return res.data!.message;
  },

  /** chat.bsky.convo.deleteMessageForSelf */
  async deleteMessageForSelf(convoId: string, messageId: string): Promise<void> {
    const { api } = await AtprotoService.getApiClient();
    await api.chat.bsky.convo.deleteMessageForSelf({ convoId, messageId }, chatOpts());
  },

  /** chat.bsky.convo.acceptConvo */
  async acceptConvo(convoId: string): Promise<ConvoView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.acceptConvo({ convoId }, chatOpts());
    return res.data!.convo;
  },

  /** chat.bsky.convo.leaveConvo */
  async leaveConvo(convoId: string): Promise<{ convoId: string; rev: string }> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.leaveConvo({ convoId }, chatOpts());
    return res.data!;
  },

  /** chat.bsky.convo.muteConvo */
  async muteConvo(convoId: string): Promise<ConvoView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.muteConvo({ convoId }, chatOpts());
    return res.data!.convo;
  },

  /** chat.bsky.convo.unmuteConvo */
  async unmuteConvo(convoId: string): Promise<ConvoView> {
    const { api } = await AtprotoService.getApiClient();
    const res = await api.chat.bsky.convo.unmuteConvo({ convoId }, chatOpts());
    return res.data!.convo;
  },
};
