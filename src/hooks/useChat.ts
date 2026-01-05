/**
 * React Query hooks for Chat operations - Direct Bluesky API calls
 * All chat data fetching goes through React Query with direct API usage
 * Zustand stores should only manage UI state and optimistic updates
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/queryKeys';
import { useUserStore } from '../stores/userStore';

const CHAT_SERVICE_DID = 'did:web:api.bsky.chat';

// Types from ChatService
import type { ProfileViewBasic } from '../services/ChatService';

export interface Conversation {
  id: string;
  rev: string;
  members: ProfileViewBasic[];
  lastMessage?: any;
  lastReaction?: any;
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
  facets?: any[];
  embed?: any;
  reactions?: any[];
  sender: { did: string; handle: string; displayName?: string; avatar?: string };
  sentAt: string;
  conversationId: string;
  sent: boolean;
  received: boolean;
  createdAt: string;
  senderDid: string;
}


/**
 * Fetch all conversations - Direct Bluesky API call
 */
export function useConversations() {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const agent = useUserStore(state => state.agent);

  return useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: async ({ pageParam }) => {
      if (!agent) throw new Error('No agent available');
      
      const response = await agent.api.chat.bsky.convo.listConvos({
        limit: 50,
        ...(pageParam && { cursor: pageParam as string }),
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      return {
        conversations: (response.data?.convos || []).map((conv: any) => ({
          id: conv.id,
          rev: conv.rev,
          members: conv.members || [],
          lastMessage: conv.lastMessage,
          lastReaction: conv.lastReaction,
          muted: conv.muted || false,
          status: conv.status || 'active',
          unreadCount: conv.unreadCount || 0,
          createdAt: conv.createdAt,
          lastMessageText: conv.lastMessage?.text || conv.lastMessage?.message?.text,
          lastMessageCreatedAt: conv.lastMessage?.sentAt || conv.lastMessage?.createdAt,
        })),
        cursor: response.data?.cursor || null,
      };
    },
    enabled: isAuthenticated && !!agent,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch a single conversation - Direct Bluesky API call
 */
export function useConversation(conversationId: string | null | undefined) {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const agent = useUserStore(state => state.agent);

  return useQuery({
    queryKey: queryKeys.chat.conversations.detail(conversationId || ''),
    queryFn: async () => {
      if (!agent || !conversationId) throw new Error('Missing agent or conversationId');
      
      const response = await agent.api.chat.bsky.convo.getConvo({
        convoId: conversationId,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      const conv: any = response.data?.convo || response.data;
      const lastMsg = conv.lastMessage;
      return {
        id: conv.id,
        rev: conv.rev,
        members: (conv.members || []).map((m: any) => 
          m.handle === 'missing.invalid' 
            ? { ...m, displayName: 'Account Deleted', avatar: undefined }
            : m
        ),
        lastMessage: lastMsg,
        lastReaction: conv.lastReaction,
        muted: conv.muted || false,
        status: conv.status || 'active',
        unreadCount: conv.unreadCount || 0,
        createdAt: conv.createdAt,
        lastMessageText: lastMsg?.text || lastMsg?.message?.text,
        lastMessageCreatedAt: lastMsg?.sentAt || lastMsg?.createdAt,
      };
    },
    enabled: isAuthenticated && !!agent && !!conversationId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch messages for a conversation - Direct Bluesky API call
 */
export function useMessages(conversationId: string | null | undefined, options?: { refetchInterval?: number }) {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const agent = useUserStore(state => state.agent);
  const currentUser = useUserStore(state => state.currentUser);

  return useInfiniteQuery({
    queryKey: queryKeys.chat.messages.infinite(conversationId || ''),
    queryFn: async ({ pageParam }) => {
      if (!agent || !conversationId) throw new Error('Missing agent or conversationId');
      
      const response = await agent.api.chat.bsky.convo.getMessages({
        convoId: conversationId,
        limit: 50,
        ...(pageParam && { cursor: pageParam as string }),
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      const logs: any[] = (response.data as any)?.logs || (response.data as any)?.messages || [];
      const currentUserDid = currentUser?.did;

      return {
        messages: logs.map((msg: any) => {
          const sender = msg.sender || msg.message?.sender;
          const senderDid = sender?.did;
          return {
            id: msg.id,
            rev: msg.rev,
            text: msg.text || msg.message?.text || '',
            facets: msg.facets || msg.message?.facets,
            embed: msg.embed || msg.message?.embed,
            reactions: msg.reactions || msg.message?.reactions,
            sender: sender?.handle === 'missing.invalid'
              ? { ...sender, displayName: 'Deleted account', avatar: undefined }
              : sender,
            sentAt: msg.sentAt || msg.message?.sentAt,
            conversationId: msg.convoId || msg.conversationId || conversationId,
            sent: senderDid === currentUserDid,
            received: senderDid !== currentUserDid,
            createdAt: msg.sentAt || msg.message?.sentAt || msg.createdAt,
            senderDid,
          };
        }),
        cursor: response.data?.cursor || null,
      };
    },
    enabled: isAuthenticated && !!agent && !!conversationId,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
    staleTime: 10 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Check if chat is available - Direct Bluesky API call
 */
export function useChatAvailability(userDid: string | null | undefined) {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const agent = useUserStore(state => state.agent);
  const currentUser = useUserStore(state => state.currentUser);

  return useQuery({
    queryKey: queryKeys.chat.availability(userDid || ''),
    queryFn: async () => {
      if (!agent || !userDid) throw new Error('Missing agent or userDid');
      
      const members = currentUser?.did ? [currentUser.did, userDid] : [userDid];
      const response = await agent.api.chat.bsky.convo.getConvoAvailability({
        members,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      return response.data?.canChat === true;
    },
    enabled: isAuthenticated && !!agent && !!userDid,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Mutation: Send a message - Direct Bluesky API call
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async ({ conversationId, text, facets, embed }: { 
      conversationId: string; 
      text: string; 
      facets?: any[]; 
      embed?: any;
    }) => {
      if (!agent) throw new Error('No agent available');
      
      const messageData: any = { text };
      if (facets) messageData.facets = facets;
      if (embed) messageData.embed = embed;

      const response = await agent.api.chat.bsky.convo.sendMessage({
        convoId: conversationId,
        message: messageData,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      if (!response.data) throw new Error('Failed to send message');
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.messages.infinite(variables.conversationId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.list() 
      });
    },
  });
}

/**
 * Mutation: Create a new conversation - Direct Bluesky API call
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);
  const currentUser = useUserStore(state => state.currentUser);

  return useMutation({
    mutationFn: async ({ recipientDid }: { recipientDid: string }) => {
      if (!agent || !currentUser?.did) throw new Error('No agent or user available');
      
      const members = [currentUser.did, recipientDid];
      const response = await agent.api.chat.bsky.convo.getConvoForMembers({
        members,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      if (!response.data?.convo) throw new Error('Failed to create conversation');
      return response.data.convo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.list() 
      });
    },
  });
}

/**
 * Mutation: Add reaction - Direct Bluesky API call
 */
export function useAddReaction() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async ({ conversationId, messageId, reactionValue }: { 
      conversationId: string; 
      messageId: string; 
      reactionValue: string;
    }) => {
      if (!agent) throw new Error('No agent available');
      
      await agent.api.chat.bsky.convo.addReaction({
        convoId: conversationId,
        messageId,
        value: reactionValue,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.messages.infinite(variables.conversationId) 
      });
    },
  });
}

/**
 * Mutation: Remove reaction - Direct Bluesky API call
 */
export function useRemoveReaction() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async ({ conversationId, messageId, reactionValue }: { 
      conversationId: string; 
      messageId: string; 
      reactionValue: string;
    }) => {
      if (!agent) throw new Error('No agent available');
      
      await agent.api.chat.bsky.convo.removeReaction({
        convoId: conversationId,
        messageId,
        value: reactionValue,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.messages.infinite(variables.conversationId) 
      });
    },
  });
}

/**
 * Mutation: Mute/unmute conversation - Direct Bluesky API call
 */
export function useMuteConversation() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async ({ conversationId, muted }: { conversationId: string; muted: boolean }) => {
      if (!agent) throw new Error('No agent available');
      
      const method = muted ? 'muteConvo' : 'unmuteConvo';
      await agent.api.chat.bsky.convo[method]({
        convoId: conversationId,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.detail(variables.conversationId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.list() 
      });
    },
  });
}

/**
 * Mutation: Mark conversation as read - Direct Bluesky API call
 */
export function useMarkConversationAsRead() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!agent) throw new Error('No agent available');
      
      // Get latest message ID first
      const messagesResponse = await agent.api.chat.bsky.convo.getMessages({
        convoId: conversationId,
        limit: 1,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });

      const latestMessageId = (messagesResponse.data as any)?.logs?.[0]?.id;
      if (latestMessageId) {
        await agent.api.chat.bsky.convo.updateRead({
          convoId: conversationId,
          messageId: latestMessageId,
        }, {
          headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
        });
      }
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.detail(conversationId) 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.list() 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.conversations.count() 
      });
    },
  });
}

/**
 * Mutation: Delete message - Direct Bluesky API call
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();
  const agent = useUserStore(state => state.agent);

  return useMutation({
    mutationFn: async ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      if (!agent) throw new Error('No agent available');
      
      await agent.api.chat.bsky.convo.deleteMessageForSelf({
        convoId: conversationId,
        messageId,
      }, {
        headers: { 'atproto-proxy': `${CHAT_SERVICE_DID}#bsky_chat` },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.chat.messages.infinite(variables.conversationId) 
      });
    },
  });
}
