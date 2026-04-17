/**
 * Chat service – wraps chat.bsky.convo API endpoints directly.
 * All methods use the atproto-proxy header for bsky_chat.
 */

import { AtprotoCore } from '../core';
import { chatOpts, withRetry429 } from '../../../features/chat/api/chatClient';
import { detectFacets } from '../../../features/chat/api/facets';
import type { ConvoView, MessageView } from '../types';
import type { OutputSchema as GetLogOutputSchema } from '@atproto/api/dist/client/types/chat/bsky/convo/getLog';

/** Re-export getLog output shape from SDK for consumers (e.g. useChatLog). */
export type { GetLogOutputSchema };

export interface ConversationsResponse {
  conversations: ConvoView[];
  cursor: string | null;
}

export interface MessagesResponse {
  messages: (MessageView | { id: string; rev: string; sender: { did: string }; sentAt: string })[];
  cursor: string | null;
}

/** Filter params for listConvos (chat.bsky.convo.listConvos query params). */
export interface ListConvosFilter {
  readState?: 'unread';
  status?: 'request' | 'accepted';
}

export const ChatService = {
  /** chat.bsky.convo.listConvos */
  async listConvos(
    cursor: string | null = null,
    filter?: ListConvosFilter
  ): Promise<ConversationsResponse> {
    return withRetry429(async () => {
      const { api } = await AtprotoCore.getApiClient();
      const params: {
        limit: number;
        cursor?: string;
        readState?: 'unread';
        status?: 'request' | 'accepted';
      } = {
        limit: 50,
        ...(cursor && { cursor }),
        ...(filter?.readState && { readState: filter.readState }),
        ...(filter?.status && { status: filter.status }),
      };
      const res = await api.chat.bsky.convo.listConvos(params, chatOpts());
      return {
        conversations: res.data?.convos ?? [],
        cursor: res.data?.cursor ?? null,
      };
    });
  },

  /**
   * Get chat declaration (allowIncoming) for the current user.
   * Uses chat.bsky.actor.declaration record; requires atproto-proxy for bsky_chat.
   */
  async getChatDeclaration(did: string): Promise<'all' | 'none' | 'following' | null> {
    if (!did) return null;
    try {
      const { api } = await AtprotoCore.getApiClient();
      const res = await api.chat.bsky.actor.declaration.get({ repo: did, rkey: 'self' });
      const incoming = res?.value?.allowIncoming;
      if (incoming === 'all' || incoming === 'none' || incoming === 'following') {
        return incoming as 'all' | 'none' | 'following';
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Update chat declaration (who can message you).
   * Uses chat.bsky.actor.declaration record; requires atproto-proxy for bsky_chat.
   */
  async updateChatDeclaration(
    did: string,
    allowIncoming: 'all' | 'none' | 'following'
  ): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    await api.chat.bsky.actor.declaration.put(
      { repo: did, rkey: 'self' },
      { allowIncoming },
      chatOpts().headers
    );
  },

  /** chat.bsky.convo.getConvo */
  async getConvo(convoId: string): Promise<ConvoView | null> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.getConvo({ convoId }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getConvoForMembers */
  async getConvoForMembers(members: string[]): Promise<ConvoView | null> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.getConvoForMembers({ members }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getConvoAvailability */
  async getConvoAvailability(members: string[]): Promise<ConvoView | null> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.getConvoAvailability({ members }, chatOpts());
    return res.data?.convo ?? null;
  },

  /** chat.bsky.convo.getMessages */
  async getMessages(convoId: string, cursor: string | null = null): Promise<MessagesResponse> {
    return withRetry429(async () => {
      const { api } = await AtprotoCore.getApiClient();
      const res = await api.chat.bsky.convo.getMessages(
        { convoId, limit: 50, ...(cursor && { cursor }) },
        chatOpts()
      );
      return {
        messages: (res.data?.messages ?? []) as MessagesResponse['messages'],
        cursor: res.data?.cursor ?? null,
      };
    });
  },

  /**
   * chat.bsky.convo.getLog (lexicon type: query).
   * Per AT Protocol: this is an XRPC query (GET), not a subscription. There is no
   * chat subscription in the lexicon (unlike com.atproto.sync.subscribeRepos).
   * To get new events: omit cursor on first call; then pass the returned cursor for
   * follow-on requests (XRPC cursor pagination). Clients poll getLog(cursor) to
   * receive new messages, reactions, and convo events.
   * @see https://github.com/bluesky-social/atproto/blob/main/lexicons/chat/bsky/convo/getLog.json
   */
  async getLog(cursor: string | null = null): Promise<GetLogOutputSchema> {
    return withRetry429(async () => {
      const { api } = await AtprotoCore.getApiClient();
      const res = await api.chat.bsky.convo.getLog(cursor ? { cursor } : undefined, chatOpts());
      return {
        cursor: res.data?.cursor ?? undefined,
        logs: res.data?.logs ?? [],
      };
    });
  },

  /** chat.bsky.convo.sendMessage */
  async sendMessage(
    convoId: string,
    message: {
      text: string;
      facets?: MessageView['facets'];
      embed?: { $type: string; record: { uri: string; cid: string } };
    }
  ): Promise<MessageView> {
    const { api } = await AtprotoCore.getApiClient();
    const msg: {
      text: string;
      facets?: MessageView['facets'];
      embed?: { $type: string; record: { uri: string; cid: string } };
    } = { text: message.text };

    // Prefer caller-supplied facets; otherwise try to detect via RichText API.
    if (message.facets && message.facets.length > 0) {
      msg.facets = message.facets;
    } else {
      const detected = await detectFacets(message.text);
      if (detected) msg.facets = detected;
    }

    if (message.embed) {
      msg.embed = {
        $type: 'app.bsky.embed.record',
        record: message.embed.record,
      };
    }
    const res = await api.chat.bsky.convo.sendMessage({ convoId, message: msg }, chatOpts());
    return res.data as MessageView;
  },

  /** chat.bsky.convo.sendMessageBatch */
  async sendMessageBatch(
    convoId: string,
    items: { message: { text: string } }[]
  ): Promise<MessageView[]> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.sendMessageBatch(
      {
        items: items.map(i => ({ convoId, message: i.message })),
      },
      chatOpts()
    );
    return res.data?.items ?? [];
  },

  /** chat.bsky.convo.updateRead */
  async updateRead(convoId: string, messageId?: string): Promise<ConvoView> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.updateRead(
      { convoId, ...(messageId && { messageId }) },
      chatOpts()
    );
    return res.data!.convo;
  },

  /** chat.bsky.convo.updateAllRead */
  async updateAllRead(): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    await api.chat.bsky.convo.updateAllRead(undefined, chatOpts());
  },

  /** chat.bsky.convo.addReaction */
  async addReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.addReaction({ convoId, messageId, value }, chatOpts());
    return res.data!.message;
  },

  /** chat.bsky.convo.removeReaction */
  async removeReaction(convoId: string, messageId: string, value: string): Promise<MessageView> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.removeReaction({ convoId, messageId, value }, chatOpts());
    return res.data!.message;
  },

  /** chat.bsky.convo.deleteMessageForSelf */
  async deleteMessageForSelf(convoId: string, messageId: string): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    await api.chat.bsky.convo.deleteMessageForSelf({ convoId, messageId }, chatOpts());
  },

  /** chat.bsky.convo.acceptConvo – accepts a conversation request. API returns { rev?: string } only. */
  async acceptConvo(convoId: string): Promise<void> {
    const { api } = await AtprotoCore.getApiClient();
    await api.chat.bsky.convo.acceptConvo({ convoId }, chatOpts());
  },

  /** chat.bsky.convo.leaveConvo */
  async leaveConvo(convoId: string): Promise<{ convoId: string; rev: string }> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.leaveConvo({ convoId }, chatOpts());
    return res.data!;
  },

  /** chat.bsky.convo.muteConvo */
  async muteConvo(convoId: string): Promise<ConvoView> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.muteConvo({ convoId }, chatOpts());
    return res.data!.convo;
  },

  /** chat.bsky.convo.unmuteConvo */
  async unmuteConvo(convoId: string): Promise<ConvoView> {
    const { api } = await AtprotoCore.getApiClient();
    const res = await api.chat.bsky.convo.unmuteConvo({ convoId }, chatOpts());
    return res.data!.convo;
  },
};
