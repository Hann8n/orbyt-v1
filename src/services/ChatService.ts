import { Agent } from '@atproto/api';
import type { ConvoView, MessageView as APIMessageView } from './api/types';
import { logger } from '../utils/logger';

const CHAT_SERVICE_DID = 'did:web:api.bsky.chat';

// Core data structures based on official lexicons
export interface Conversation {
  id: string;
  rev: string;
  members: ProfileViewBasic[];
  lastMessage?: MessageView | DeletedMessageView;
  lastReaction?: MessageAndReactionView;
  muted: boolean;
  status: string;
  unreadCount: number;
  createdAt: string;
  // Additional properties for UI compatibility
  lastMessageText?: string;
  lastMessageCreatedAt?: string;
}

export interface Message {
  id: string;
  rev: string;
  text: string;
  facets?: Facet[];
  embed?: RecordEmbed;
  reactions?: ReactionView[];
  sender: MessageViewSender;
  sentAt: string;
  conversationId: string;
  sent: boolean;
  received: boolean;
  // Additional properties for UI compatibility
  createdAt: string;
  senderDid: string;
}

export interface ProfileViewBasic {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  chatDisabled?: boolean;
}

export interface MessageView {
  id: string;
  rev: string;
  text: string;
  facets?: Facet[];
  embed?: RecordEmbed;
  reactions?: ReactionView[];
  sender: MessageViewSender;
  sentAt: string;
}

export interface DeletedMessageView {
  id: string;
  rev: string;
  deleted: true;
  sender: MessageViewSender;
  sentAt: string;
}

export interface MessageViewSender {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface ReactionView {
  value: string;
  sender: ReactionViewSender;
  createdAt: string;
}

export interface ReactionViewSender {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface MessageAndReactionView {
  message: MessageView | DeletedMessageView;
  reaction: ReactionView;
}

export interface Facet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: (Mention | Link | Tag)[];
}

export interface Mention {
  $type: 'app.bsky.richtext.facet#mention';
  did: string;
}

export interface Link {
  $type: 'app.bsky.richtext.facet#link';
  uri: string;
}

export interface Tag {
  $type: 'app.bsky.richtext.facet#tag';
  tag: string;
}

export interface RecordEmbed {
  $type: 'app.bsky.embed.record';
  record: {
    uri: string;
    cid: string;
  };
}

// API parameter interfaces
export interface SendMessageParams {
  conversationId: string;
  text: string;
  facets?: Facet[];
  embed?: RecordEmbed;
}

export interface CreateConversationParams {
  recipientDid: string;
}

export interface AddReactionParams {
  conversationId: string;
  messageId: string;
  reactionValue: string;
}

export interface RemoveReactionParams {
  conversationId: string;
  messageId: string;
  reactionValue: string;
}

export interface UpdateReadParams {
  conversationId: string;
  messageId: string; // The message ID to mark as read up to
}

export interface MuteConversationParams {
  conversationId: string;
  muted: boolean;
}

class ChatService {
  private async getAgent(): Promise<Agent> {
    const { useUserStore } = await import('../stores/userStore');
    const userStore = useUserStore.getState();

    if (!userStore.agent) {
      throw new Error('No OAuth agent available');
    }

    return userStore.agent;
  }

  // Core Conversation APIs

  /**
   * Get a specific conversation by ID
   * API: chat.bsky.convo.getConvo
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.getConvo(
        {
          convoId: conversationId,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to get conversation');
      }

      return await this.mapConversationFromAPI(response.data.convo || response.data);
    } catch (error: unknown) {
      logger.error('Failed to get conversation', error, {
        component: 'ChatService',
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Find or create a conversation for specific members
   * API: chat.bsky.convo.getConvoForMembers
   */
  async getConversationForMembers(members: string[]): Promise<Conversation | null> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.getConvoForMembers(
        {
          members: members,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data || !response.data.convo) {
        logger.debug('No conversation found for members', {
          component: 'ChatService',
          memberCount: members.length,
        });
        return null;
      }

      return await this.mapConversationFromAPI(response.data.convo);
    } catch (error: unknown) {
      logger.error('Failed to get conversation for members', error, {
        component: 'ChatService',
        memberCount: members.length,
      });
      throw error;
    }
  }

  /**
   * Get conversation activity log
   * API: chat.bsky.convo.getLog
   */
  async getConversationLog(cursor?: string): Promise<{ logs: unknown[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.getLog(
        {
          ...(cursor && { cursor }),
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        return { logs: [], cursor: null };
      }

      const data = response.data as { logs?: unknown[]; cursor?: string | null };
      return {
        logs: data.logs || [],
        cursor: data.cursor || null,
      };
    } catch (error: unknown) {
      logger.error('Failed to get conversation log', error, {
        component: 'ChatService',
      });
      throw error;
    }
  }

  // Message APIs

  /**
   * Send a message to a conversation
   * API: chat.bsky.convo.sendMessage
   */
  async sendMessage(params: SendMessageParams): Promise<Message> {
    try {
      const agent = await this.getAgent();

      const messageData: {
        text: string;
        facets?: Facet[];
        embed?: RecordEmbed;
      } = {
        text: params.text,
      };

      if (params.facets) {
        messageData.facets = params.facets;
      }

      if (params.embed) {
        messageData.embed = params.embed;
      }

      const response = await agent.api.chat.bsky.convo.sendMessage(
        {
          convoId: params.conversationId,
          message: messageData,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to send message');
      }

      return await this.mapMessageFromAPI(response.data as APIMessageView);
    } catch (error: unknown) {
      logger.error('Failed to send message', error, {
        component: 'ChatService',
        conversationId: params.conversationId,
      });
      throw error;
    }
  }

  /**
   * Delete a message from a conversation (for self only)
   * API: chat.bsky.convo.deleteMessageForSelf
   */
  async deleteMessageForSelf(conversationId: string, messageId: string): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.deleteMessageForSelf(
        {
          convoId: conversationId,
          messageId: messageId,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to delete message');
      }
    } catch (error: unknown) {
      logger.error('Failed to delete message', error, {
        component: 'ChatService',
        conversationId,
        messageId,
      });
      throw error;
    }
  }

  // Reaction APIs

  /**
   * Add a reaction to a message
   * API: chat.bsky.convo.addReaction
   */
  async addReaction(params: AddReactionParams): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.addReaction(
        {
          convoId: params.conversationId,
          messageId: params.messageId,
          value: params.reactionValue,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to add reaction');
      }
    } catch (error: unknown) {
      logger.error('Failed to add reaction', error, {
        component: 'ChatService',
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
      throw error;
    }
  }

  /**
   * Remove a reaction from a message
   * API: chat.bsky.convo.removeReaction
   */
  async removeReaction(params: RemoveReactionParams): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.removeReaction(
        {
          convoId: params.conversationId,
          messageId: params.messageId,
          value: params.reactionValue,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to remove reaction');
      }
    } catch (error: unknown) {
      logger.error('Failed to remove reaction', error, {
        component: 'ChatService',
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
      throw error;
    }
  }

  // Conversation Management APIs

  /**
   * Begin a new conversation
   * Uses getConversationForMembers which can create conversations
   */
  async beginConversation(members: string[]): Promise<Conversation> {
    await this.getAgent();
    const { useUserStore } = await import('../stores/userStore');
    const userStore = useUserStore.getState();
    const currentUserDid = userStore.currentUser?.did;

    if (!currentUserDid) {
      throw new Error('No authenticated user');
    }

    // Include current user in members if not already present
    const allMembers = members.includes(currentUserDid) ? members : [currentUserDid, ...members];

    const conversation = await this.getConversationForMembers(allMembers);

    if (!conversation) {
      throw new Error('Failed to create conversation');
    }

    return conversation;
  }

  /**
   * Accept a conversation request
   * API: chat.bsky.convo.acceptConvo
   */
  async acceptConversation(conversationId: string): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.acceptConvo(
        {
          convoId: conversationId,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to accept conversation');
      }
    } catch (error: unknown) {
      logger.error('Failed to accept conversation', error, {
        component: 'ChatService',
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Leave a conversation
   * API: chat.bsky.convo.leaveConvo
   */
  async leaveConversation(conversationId: string): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.leaveConvo(
        {
          convoId: conversationId,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to leave conversation');
      }
    } catch (error: unknown) {
      logger.error('Failed to leave conversation', error, {
        component: 'ChatService',
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Mute or unmute a conversation
   * API: chat.bsky.convo.muteConvo / chat.bsky.convo.unmuteConvo
   */
  async muteConversation(params: MuteConversationParams): Promise<void> {
    try {
      const agent = await this.getAgent();

      if (params.muted) {
        const response = await agent.api.chat.bsky.convo.muteConvo(
          {
            convoId: params.conversationId,
          },
          {
            headers: {
              'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
            },
          }
        );

        if (!response.data) {
          throw new Error('Failed to mute conversation');
        }
      } else {
        const response = await agent.api.chat.bsky.convo.unmuteConvo(
          {
            convoId: params.conversationId,
          },
          {
            headers: {
              'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
            },
          }
        );

        if (!response.data) {
          throw new Error('Failed to unmute conversation');
        }
      }
    } catch (error: unknown) {
      logger.error('Failed to mute/unmute conversation', error, {
        component: 'ChatService',
        conversationId: params.conversationId,
        muted: params.muted,
      });
      throw error;
    }
  }

  /**
   * Update read status of a conversation
   * API: chat.bsky.convo.updateRead
   */
  async updateReadStatus(params: UpdateReadParams): Promise<void> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.updateRead(
        {
          convoId: params.conversationId,
          messageId: params.messageId,
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        throw new Error('Failed to update read status');
      }
    } catch (error: unknown) {
      logger.error('Failed to update read status', error, {
        component: 'ChatService',
        conversationId: params.conversationId,
        messageId: params.messageId,
      });
      throw error;
    }
  }

  // Convenience methods for common operations

  /**
   * Get all conversations (for conversation list)
   * API: chat.bsky.convo.listConvos
   */
  async getConversations(
    cursor?: string
  ): Promise<{ conversations: Conversation[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.listConvos(
        {
          limit: 50,
          ...(cursor && { cursor }),
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        return { conversations: [], cursor: null };
      }

      const json = response.data as { convos?: ConvoView[]; cursor?: string | null };
      const conversations = await Promise.all((json.convos || []).map(this.mapConversationFromAPI));

      return {
        conversations,
        cursor: json.cursor || null,
      };
    } catch (error: unknown) {
      logger.error('Failed to get conversations', error, {
        component: 'ChatService',
      });
      throw error;
    }
  }

  /**
   * Get messages for a conversation (for chat screen)
   * API: chat.bsky.convo.getMessages
   */
  async getMessages(
    conversationId: string,
    cursor?: string
  ): Promise<{ messages: Message[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.getMessages(
        {
          convoId: conversationId,
          limit: 50,
          ...(cursor && { cursor }),
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        return { messages: [], cursor: null };
      }

      const json = response.data as {
        logs?: APIMessageView[];
        messages?: APIMessageView[];
        cursor?: string | null;
      };
      // Handle different possible response structures
      const logs = json.logs || json.messages || [];
      const messages = await Promise.all(logs.map(this.mapMessageFromAPI));

      return {
        messages,
        cursor: json.cursor || null,
      };
    } catch (error: unknown) {
      logger.error('Failed to get messages', error, {
        component: 'ChatService',
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Create a conversation with a single recipient
   */
  async createConversation(params: CreateConversationParams): Promise<Conversation> {
    // First try to find existing conversation
    const existingConvo = await this.getConversationForMembers([params.recipientDid]);

    if (existingConvo) {
      return existingConvo;
    }

    // If no existing conversation, create one using getConvoForMembers
    // This endpoint can create a conversation if it doesn't exist
    const newConvo = await this.getConversationForMembers([params.recipientDid]);

    if (!newConvo) {
      throw new Error('Failed to create conversation');
    }

    return newConvo;
  }

  /**
   * Check if chat service is available
   */
  async isChatServiceAvailable(): Promise<boolean> {
    try {
      const agent = await this.getAgent();

      const response = await agent.api.chat.bsky.convo.getLog(
        {},
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      // If we get any response (even empty), the service is available
      return !!response.data;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check conversation availability for a user
   * API: chat.bsky.convo.getConvoAvailability
   */
  async getConversationAvailability(userDid: string): Promise<boolean> {
    try {
      const agent = await this.getAgent();
      const { useUserStore } = await import('../stores/userStore');
      const userStore = useUserStore.getState();
      const currentUserDid = userStore.currentUser?.did;

      const response = await agent.api.chat.bsky.convo.getConvoAvailability(
        {
          members: currentUserDid ? [currentUserDid, userDid] : [userDid],
        },
        {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        }
      );

      if (!response.data) {
        return false;
      }

      const json = response.data as { canChat?: boolean };
      return json.canChat === true;
    } catch (error: unknown) {
      logger.debug('Failed to check conversation availability', {
        component: 'ChatService',
        userDid,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Mark all messages in a conversation as read
   * Uses the latest message ID to mark everything as read
   */
  async markConversationAsRead(conversationId: string): Promise<void> {
    try {
      // Get the latest message ID from the conversation
      const messages = await this.getMessages(conversationId);

      if (messages.messages.length > 0) {
        // Get the latest message ID (first message in the array since they're sorted by date desc)
        const latestMessageId = messages.messages[0].id;

        await this.updateReadStatus({
          conversationId,
          messageId: latestMessageId,
        });
      }
    } catch (error: unknown) {
      // Don't throw - this is a non-critical operation
      logger.debug('Failed to mark conversation as read', {
        component: 'ChatService',
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Data mapping methods

  private mapConversationFromAPI = async (
    apiConv: ConvoView & { createdAt?: string }
  ): Promise<Conversation> => {
    // Properly map members - they should be an array of objects with did, handle, displayName, etc.
    const members = Array.isArray(apiConv.members)
      ? apiConv.members.map(member => {
          if (!member) return member as ProfileViewBasic;
          // Normalize deleted accounts coming through as missing.invalid
          if (member.handle === 'missing.invalid') {
            return {
              ...member,
              displayName: 'Account Deleted',
              avatar: undefined,
            } as ProfileViewBasic;
          }
          return member as ProfileViewBasic;
        })
      : [];

    return {
      id: apiConv.id,
      rev: apiConv.rev,
      members: members,
      lastMessage: apiConv.lastMessage as MessageView | DeletedMessageView | undefined,
      lastReaction: apiConv.lastReaction as MessageAndReactionView | undefined,
      muted: apiConv.muted || false,
      status: apiConv.status || 'active',
      unreadCount: apiConv.unreadCount || 0,
      createdAt: apiConv.createdAt || new Date().toISOString(),
      // Additional properties for UI compatibility
      lastMessageText: (() => {
        const msg = apiConv.lastMessage;
        if (!msg) return undefined;
        if ('deleted' in msg && msg.deleted) return undefined;
        if ('text' in msg) return msg.text as string;
        return undefined;
      })(),
      lastMessageCreatedAt: (() => {
        const msg = apiConv.lastMessage;
        if (!msg) return undefined;
        if ('sentAt' in msg) return msg.sentAt as string;
        if ('createdAt' in msg) return msg.createdAt as string;
        return undefined;
      })(),
    };
  };

  private mapMessageFromAPI = async (apiMsg: APIMessageView): Promise<Message> => {
    const { useUserStore } = await import('../stores/userStore');
    const userStore = useUserStore.getState();
    const currentUserDid = userStore.currentUser?.did || '';

    // Check if it's a MessageView (has text) or DeletedMessageView
    const isMessageView = 'text' in apiMsg && typeof (apiMsg as any).text === 'string';
    const msg = apiMsg as any;
    const sender = msg.sender || {};
    const senderDid = sender.did || '';
    const sentAt = msg.sentAt || '';

    return {
      id: apiMsg.id,
      rev: apiMsg.rev,
      text: isMessageView ? msg.text || '' : '',
      facets: isMessageView ? (msg.facets as Facet[] | undefined) : undefined,
      embed:
        isMessageView && msg.embed && msg.embed.$type === 'app.bsky.embed.record'
          ? (msg.embed as RecordEmbed)
          : undefined,
      reactions:
        isMessageView && Array.isArray(msg.reactions)
          ? msg.reactions.map((r: any) => ({
              value: r.value || '',
              sender: {
                did: r.sender?.did || '',
                handle: r.sender?.handle || '',
                displayName: r.sender?.displayName,
                avatar: r.sender?.avatar,
              },
              createdAt: r.createdAt || '',
            }))
          : undefined,
      sender: {
        did: senderDid,
        handle: sender.handle || '',
        displayName: sender.displayName,
        avatar: sender.avatar,
      },
      sentAt,
      conversationId: msg.convoId || msg.conversationId || '',
      sent: senderDid === currentUserDid,
      received: senderDid !== currentUserDid,
      createdAt: sentAt,
      senderDid,
    };
  };
}

export default new ChatService();
