import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ChatService from '../services/ChatService';
import { Message, ReactionView } from '../services/ChatService';
import { formatHandle } from '../utils/helpers';

interface UseMessageReactionsProps {
  conversationId: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  currentUserId: string;
  currentUser?: { handle?: string; avatar?: string };
}

/**
 * Unified hook for handling message reactions
 * Replaces duplicate handleEmojiSelect and handleReactionPress functions
 */
export function useMessageReactions({
  conversationId,
  messages,
  setMessages,
  currentUserId,
  currentUser,
}: UseMessageReactionsProps) {
  const queryClient = useQueryClient();

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      ChatService.addReaction({
        conversationId,
        messageId,
        reactionValue: emoji,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => {
      // Don't show alert for reactions - they're non-critical
    },
  });

  // Remove reaction mutation
  const removeReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      ChatService.removeReaction({
        conversationId,
        messageId,
        reactionValue: emoji,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => {
      // Don't show alert for reactions - they're non-critical
    },
  });

  /**
   * Unified reaction toggle handler
   * Replaces both handleEmojiSelect and handleReactionPress
   */
  const handleReactionToggle = useCallback(
    (emoji: string, messageId: string) => {
      const targetMessage = messages.find((msg) => msg.id === messageId);
      const isCurrentUserReacted = targetMessage?.reactions?.some(
        (reaction) => reaction.value === emoji && reaction.sender.did === currentUserId
      );

      // Save previous state for rollback
      const previousMessages = messages;

      if (isCurrentUserReacted) {
        // Optimistically remove reaction
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const nextReactions = (m.reactions || []).filter(
              (r) => !(r.value === emoji && r.sender.did === currentUserId)
            );
            return { ...m, reactions: nextReactions };
          })
        );

        removeReactionMutation.mutate(
          { messageId, emoji },
          {
            onError: () => {
              // Rollback on error
              setMessages(previousMessages);
            },
            onSettled: () => {
              // Refresh to sync with server
              queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            },
          }
        );
      } else {
        // Optimistically add reaction
        const optimisticReaction: ReactionView = {
          value: emoji,
          sender: {
            did: currentUserId,
            handle: currentUser?.handle || '',
            displayName: formatHandle(currentUser?.handle) || 'You',
            avatar: currentUser?.avatar,
          },
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const nextReactions = [...(m.reactions || []), optimisticReaction];
            return { ...m, reactions: nextReactions };
          })
        );

        addReactionMutation.mutate(
          { messageId, emoji },
          {
            onError: () => {
              // Rollback on error
              setMessages(previousMessages);
            },
            onSettled: () => {
              queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
            },
          }
        );
      }
    },
    [
      messages,
      currentUserId,
      currentUser,
      setMessages,
      addReactionMutation,
      removeReactionMutation,
      conversationId,
    ]
  );

  return { handleReactionToggle };
}

