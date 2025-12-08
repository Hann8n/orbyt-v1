import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, Conversation, ProfileViewBasic } from '../services/ChatService';
import { ChatMessage, convertMessagesToGiftedChat } from '../utils/chatHelpers';

interface ChatState {
  // Cache messages by conversation ID
  messagesCache: Record<string, Message[]>;
  // Cache conversations list
  conversationsCache: Conversation[];
  // Last fetch timestamp for conversations
  conversationsLastFetch: number | null;
  
  // Actions
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  getMessages: (conversationId: string) => Message[];
  
  // GiftedChat conversion methods - store as single source of truth
  getGiftedChatMessages: (
    conversationId: string,
    currentUserId: string,
    currentUserAvatar?: string,
    otherUser?: ProfileViewBasic
  ) => ChatMessage[];
  
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  getConversations: () => Conversation[];
  
  // Update cache when new messages come from notifications
  updateFromConversations: (conversations: Conversation[]) => void;
  
  // Clear cache
  clearCache: () => void;
  clearConversation: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesCache: {},
      conversationsCache: [],
      conversationsLastFetch: null,
      
      setMessages: (conversationId, messages) => {
        set((state) => ({
          messagesCache: {
            ...state.messagesCache,
            [conversationId]: messages,
          },
        }));
      },
      
      addMessage: (conversationId, message) => {
        set((state) => {
          const existing = state.messagesCache[conversationId] || [];
          // Check if message already exists (avoid duplicates)
          const exists = existing.some(m => m.id === message.id);
          if (exists) return state;
          
          // Add to beginning (newest first)
          return {
            messagesCache: {
              ...state.messagesCache,
              [conversationId]: [message, ...existing],
            },
          };
        });
      },
      
      updateMessage: (conversationId, messageId, updates) => {
        set((state) => {
          const messages = state.messagesCache[conversationId] || [];
          const updated = messages.map(m => 
            m.id === messageId ? { ...m, ...updates } : m
          );
          return {
            messagesCache: {
              ...state.messagesCache,
              [conversationId]: updated,
            },
          };
        });
      },
      
      getMessages: (conversationId) => {
        return get().messagesCache[conversationId] || [];
      },
      
      // Get messages in GiftedChat format - store as single source of truth
      getGiftedChatMessages: (conversationId, currentUserId, currentUserAvatar, otherUser) => {
        const messages = get().messagesCache[conversationId] || [];
        return convertMessagesToGiftedChat(messages, currentUserId, currentUserAvatar, otherUser);
      },
      
      setConversations: (conversations) => {
        set({
          conversationsCache: conversations,
          conversationsLastFetch: Date.now(),
        });
      },
      
      updateConversation: (conversationId, updates) => {
        set((state) => {
          const updated = state.conversationsCache.map(conv =>
            conv.id === conversationId ? { ...conv, ...updates } : conv
          );
          return { conversationsCache: updated };
        });
      },
      
      getConversations: () => {
        return get().conversationsCache;
      },
      
      // When conversations are fetched (from polling or notifications),
      // update the cache with latest message info
      updateFromConversations: (conversations) => {
        const state = get();
        const now = Date.now();
        
        // Get current user DID to determine sent/received (lazy import to avoid circular deps)
        let currentUserDid: string | null = null;
        try {
          // Use dynamic import to avoid circular dependency
          const userStore = require('./userStore').useUserStore;
          currentUserDid = userStore.getState().currentUser?.did || null;
        } catch {}
        
        // Update conversations cache
        set({
          conversationsCache: conversations,
          conversationsLastFetch: now,
        });
        
        // For each conversation, if we have a lastMessage, update the messages cache
        conversations.forEach((conv) => {
          if (conv.lastMessage && !('deleted' in conv.lastMessage)) {
            const lastMsg = conv.lastMessage as any;
            if (!lastMsg.sender || !lastMsg.sender.did) return;
            
            const senderDid = lastMsg.sender.did;
            const isSent = currentUserDid ? senderDid === currentUserDid : false;
            
            const message: Message = {
              id: lastMsg.id,
              rev: lastMsg.rev,
              text: lastMsg.text || '',
              facets: lastMsg.facets,
              embed: lastMsg.embed,
              reactions: lastMsg.reactions,
              sender: lastMsg.sender,
              sentAt: lastMsg.sentAt,
              conversationId: conv.id,
              sent: isSent,
              received: !isSent,
              createdAt: lastMsg.sentAt,
              senderDid: senderDid,
            };
            
            // Add to cache if it's newer than what we have
            const cached = state.messagesCache[conv.id] || [];
            const exists = cached.some(m => m.id === message.id);
            if (!exists) {
              get().addMessage(conv.id, message);
            }
          }
        });
      },
      
      clearCache: () => {
        set({
          messagesCache: {},
          conversationsCache: [],
          conversationsLastFetch: null,
        });
      },
      
      clearConversation: (conversationId) => {
        set((state) => {
          const { [conversationId]: _, ...rest } = state.messagesCache;
          return { messagesCache: rest };
        });
      },
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist messages cache and conversations
        messagesCache: state.messagesCache,
        conversationsCache: state.conversationsCache,
        conversationsLastFetch: state.conversationsLastFetch,
      }),
    }
  )
);

