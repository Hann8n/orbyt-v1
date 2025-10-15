import { AtProtoOAuthService } from './auth/OAuthService';
import { Agent } from '@atproto/api';

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
  readAt: string;
}

export interface MuteConversationParams {
  conversationId: string;
  muted: boolean;
}

class ChatService {
  private oauthService: AtProtoOAuthService;

  constructor() {
    this.oauthService = AtProtoOAuthService.getInstance();
  }

  private async getAgent(): Promise<Agent> {
    const agent = await this.oauthService.getCurrentAgent();
    
    if (!agent) {
      throw new Error('No OAuth agent available');
    }

    console.log('[ChatService] Got OAuth agent for chat requests');
    return agent;
  }

  // Core Conversation APIs

  /**
   * Get a specific conversation by ID
   * API: chat.bsky.convo.getConvo
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const agent = await this.getAgent();
      
      console.log('[ChatService] Getting conversation:', conversationId);
      
      const response = await agent.api.chat.bsky.convo.getConvo({
        convoId: conversationId,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        throw new Error('Failed to get conversation');
      }

      return await this.mapConversationFromAPI(response.data.convo || response.data);
    } catch (error: any) {
      console.error('Error getting conversation:', error.message);
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
      
      console.log('[ChatService] Getting conversation for members:', members);
      
      const response = await agent.api.chat.bsky.convo.getConvoForMembers({
        members: members,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data || !response.data.convo) {
        return null;
      }

      return await this.mapConversationFromAPI(response.data.convo);
    } catch (error: any) {
      console.error('Error getting conversation for members:', error.message);
      throw error;
    }
  }

  /**
   * Get conversation activity log
   * API: chat.bsky.convo.getLog
   */
  async getConversationLog(cursor?: string): Promise<{ logs: any[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();
      
      console.log('[ChatService] Getting conversation log with cursor:', cursor);
      
      const response = await agent.api.chat.bsky.convo.getLog({
        ...(cursor && { cursor }),
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        return { logs: [], cursor: null };
      }

      const data = response.data as any;
      return { 
        logs: data.logs || [], 
        cursor: data.cursor || null 
      };
    } catch (error: any) {
      console.error('Error getting conversation log:', error.message);
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
      
      console.log('[ChatService] Sending message to conversation:', params.conversationId);
      
      const messageData: any = {
        text: params.text,
      };

      if (params.facets) {
        messageData.facets = params.facets;
      }

      if (params.embed) {
        messageData.embed = params.embed;
      }

      const response = await agent.api.chat.bsky.convo.sendMessage({
        convoId: params.conversationId,
        message: messageData,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        throw new Error('Failed to send message');
      }

      return await this.mapMessageFromAPI(response.data as any);
    } catch (error: any) {
      console.error('Error sending message:', error.message);
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
      
      console.log('[ChatService] Deleting message:', messageId);
      
      const response = await agent.api.chat.bsky.convo.deleteMessageForSelf({
        convoId: conversationId,
        messageId: messageId,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        throw new Error('Failed to delete message');
      }
    } catch (error: any) {
      console.error('Error deleting message:', error.message);
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
      
      console.log('[ChatService] Adding reaction:', params);
      
      const response = await agent.api.chat.bsky.convo.addReaction({
        convoId: params.conversationId,
        messageId: params.messageId,
        value: params.reactionValue,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      if (!response.data) {
        throw new Error('Failed to add reaction');
      }
    } catch (error: any) {
      console.error('Error adding reaction:', error.message);
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
      
      console.log('[ChatService] Removing reaction:', params);
      
      const response = await agent.api.chat.bsky.convo.removeReaction({
        convoId: params.conversationId,
        messageId: params.messageId,
        value: params.reactionValue,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      if (!response.data) {
        throw new Error('Failed to remove reaction');
      }
    } catch (error: any) {
      console.error('Error removing reaction:', error.message);
      throw error;
    }
  }

  // Conversation Management APIs

  /**
   * Begin a new conversation
   * Uses getConversationForMembers which can create conversations
   */
  async beginConversation(members: string[]): Promise<Conversation> {
    try {
      const agent = await this.getAgent();
      const session = await this.oauthService.getCurrentOAuthSession();
      const currentUserDid = session?.did;
      
      if (!currentUserDid) {
        throw new Error('No authenticated user');
      }
      
      // Include current user in members if not already present
      const allMembers = members.includes(currentUserDid) ? members : [currentUserDid, ...members];
      
      console.log('[ChatService] Beginning conversation with members:', allMembers);
      
      const conversation = await this.getConversationForMembers(allMembers);
      
      if (!conversation) {
        throw new Error('Failed to create conversation');
      }
      
      return conversation;
    } catch (error: any) {
      console.error('Error beginning conversation:', error.message);
      throw error;
    }
  }

  /**
   * Accept a conversation request
   * API: chat.bsky.convo.acceptConvo
   */
  async acceptConversation(conversationId: string): Promise<void> {
    try {
      const agent = await this.getAgent();
      
      console.log('[ChatService] Accepting conversation:', conversationId);
      
      const response = await agent.api.chat.bsky.convo.acceptConvo({
        convoId: conversationId,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        throw new Error('Failed to accept conversation');
      }
    } catch (error: any) {
      console.error('Error accepting conversation:', error.message);
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
      
      console.log('[ChatService] Leaving conversation:', conversationId);
      
      const response = await agent.api.chat.bsky.convo.leaveConvo({
        convoId: conversationId,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        throw new Error('Failed to leave conversation');
      }
    } catch (error: any) {
      console.error('Error leaving conversation:', error.message);
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
      
      console.log('[ChatService] Muting/unmuting conversation:', params);
      
      if (params.muted) {
        const response = await agent.api.chat.bsky.convo.muteConvo({
          convoId: params.conversationId,
        }, {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        });
        
        if (!response.data) {
          throw new Error('Failed to mute conversation');
        }
      } else {
        const response = await agent.api.chat.bsky.convo.unmuteConvo({
          convoId: params.conversationId,
        }, {
          headers: {
            'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
          },
        });
        
        if (!response.data) {
          throw new Error('Failed to unmute conversation');
        }
      }
    } catch (error: any) {
      console.error('Error muting/unmuting conversation:', error.message);
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
      
      console.log('[ChatService] Updating read status for conversation:', params.conversationId);
      
      const response = await agent.api.chat.bsky.convo.updateRead({
        convoId: params.conversationId,
        messageId: params.readAt,
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      if (!response.data) {
        throw new Error('Failed to update read status');
      }
    } catch (error: any) {
      console.error('Error updating read status:', error.message);
      throw error;
    }
  }

  // Convenience methods for common operations

  /**
   * Get all conversations (for conversation list)
   * API: chat.bsky.convo.listConvos
   */
  async getConversations(cursor?: string): Promise<{ conversations: Conversation[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();
      
      console.log('[ChatService] Fetching conversations with cursor:', cursor);
      
      const response = await agent.api.chat.bsky.convo.listConvos({
        limit: 50,
        ...(cursor && { cursor }),
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        console.warn('Chat service not implemented or unavailable. Returning empty conversations.');
        return { conversations: [], cursor: null };
      }

      const json = response.data as any;
      const conversations = await Promise.all((json.convos || []).map(this.mapConversationFromAPI));

      return { 
        conversations, 
        cursor: json.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching conversations:', error.message);
      throw error;
    }
  }

  /**
   * Get messages for a conversation (for chat screen)
   * API: chat.bsky.convo.getMessages
   */
  async getMessages(conversationId: string, cursor?: string): Promise<{ messages: Message[]; cursor: string | null }> {
    try {
      const agent = await this.getAgent();
      
      console.log('[ChatService] Fetching messages for conversation:', conversationId);
      
      const response = await agent.api.chat.bsky.convo.getMessages({
        convoId: conversationId,
        limit: 50,
        ...(cursor && { cursor }),
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      

      if (!response.data) {
        console.warn('Chat service not implemented or unavailable. Returning empty messages.');
        return { messages: [], cursor: null };
      }

      const json = response.data as any;
      // Handle different possible response structures
      const logs = json.logs || json.messages || [];
      const messages = await Promise.all(logs.map(this.mapMessageFromAPI));

      return { 
        messages, 
        cursor: json.cursor || null 
      };
    } catch (error: any) {
      console.error('Error fetching messages:', error.message);
      throw error;
    }
  }

  /**
   * Create a conversation with a single recipient
   */
  async createConversation(params: CreateConversationParams): Promise<Conversation> {
    try {
      // First try to find existing conversation
      const existingConvo = await this.getConversationForMembers([params.recipientDid]);
      
      if (existingConvo) {
        console.log('[ChatService] Found existing conversation');
        return existingConvo;
      }

      // If no existing conversation, create one using getConvoForMembers
      // This endpoint can create a conversation if it doesn't exist
      console.log('[ChatService] Creating new conversation');
      const newConvo = await this.getConversationForMembers([params.recipientDid]);
      
      if (!newConvo) {
        throw new Error('Failed to create conversation');
      }
      
      return newConvo;
    } catch (error: any) {
      console.error('Error creating conversation:', error.message);
      throw error;
    }
  }

  /**
   * Check if chat service is available
   */
  async isChatServiceAvailable(): Promise<boolean> {
    try {
      const agent = await this.getAgent();
      
      const response = await agent.api.chat.bsky.convo.getLog({}, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });
      
      // If we get any response (even empty), the service is available
      return !!response.data;
    } catch (error) {
      console.warn('[ChatService] Chat service availability check failed:', error);
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
      const session = await this.oauthService.getCurrentOAuthSession();
      const currentUserDid = session?.did;
      
      const response = await agent.api.chat.bsky.convo.getConvoAvailability({
        members: currentUserDid ? [currentUserDid, userDid] : [userDid],
      }, {
        headers: {
          'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat`,
        },
      });

      if (!response.data) {
        return false;
      }

      const json = response.data as any;
      return json.canChat === true;
    } catch (error: any) {
      console.error('Error checking conversation availability:', error.message);
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
          readAt: latestMessageId,
        });
      }
    } catch (error: any) {
      console.error('Error marking conversation as read:', error.message);
      // Don't throw - this is a non-critical operation
    }
  }

  // Data mapping methods

  private mapConversationFromAPI = async (apiConv: any): Promise<Conversation> => {
    const oauthSession = await this.oauthService.getCurrentOAuthSession();
    const currentUserDid = oauthSession?.did;
    
    console.log('[ChatService] Debug - Mapping conversation from API:', apiConv);
    console.log('[ChatService] Debug - Members from API:', apiConv.members);
    
    // Properly map members - they should be an array of objects with did, handle, displayName, etc.
    const members = Array.isArray(apiConv.members)
      ? apiConv.members.map((member: any) => {
          if (!member) return member;
          // Normalize deleted accounts coming through as missing.invalid
          if (member.handle === 'missing.invalid') {
            return {
              ...member,
              displayName: 'Account Deleted',
              avatar: undefined,
            };
          }
          return member;
        })
      : [];
    console.log('[ChatService] Debug - Mapped members:', members);
    
    return {
      id: apiConv.id,
      rev: apiConv.rev,
      members: members,
      lastMessage: apiConv.lastMessage,
      lastReaction: apiConv.lastReaction,
      muted: apiConv.muted || false,
      status: apiConv.status || 'active',
      unreadCount: apiConv.unreadCount || 0,
      createdAt: apiConv.createdAt,
      // Additional properties for UI compatibility
      lastMessageText: apiConv.lastMessage?.text || apiConv.lastMessage?.message?.text,
      lastMessageCreatedAt: apiConv.lastMessage?.sentAt || apiConv.lastMessage?.createdAt,
    };
  };

  private mapMessageFromAPI = async (apiMsg: any): Promise<Message> => {
    const oauthSession = await this.oauthService.getCurrentOAuthSession();
    const currentUserDid = oauthSession?.did;
    
    return {
      id: apiMsg.id,
      rev: apiMsg.rev,
      text: apiMsg.text || apiMsg.message?.text || '',
      facets: apiMsg.facets || apiMsg.message?.facets,
      embed: apiMsg.embed || apiMsg.message?.embed,
      reactions: apiMsg.reactions || apiMsg.message?.reactions,
      sender: (() => {
        const s = apiMsg.sender || apiMsg.message?.sender;
        if (!s) return s;
        // Normalize deleted accounts coming through as missing.invalid
        if (s.handle === 'missing.invalid') {
          return {
            ...s,
            displayName: 'Deleted account',
            avatar: undefined,
          };
        }
        return s;
      })(),
      sentAt: apiMsg.sentAt || apiMsg.message?.sentAt,
      conversationId: apiMsg.convoId || apiMsg.conversationId,
      sent: (apiMsg.sender?.did || apiMsg.message?.sender?.did) === currentUserDid,
      received: (apiMsg.sender?.did || apiMsg.message?.sender?.did) !== currentUserDid,
      // Additional properties for UI compatibility
      createdAt: apiMsg.sentAt || apiMsg.message?.sentAt || apiMsg.createdAt,
      senderDid: apiMsg.sender?.did || apiMsg.message?.sender?.did,
    };
  };
}

export default new ChatService();