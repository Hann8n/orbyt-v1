import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ChatService from '../services/ChatService';
import { ChatMessage } from '../utils/chat/helpers';
import { ReactionView, ReactionViewSender } from '../services/ChatService';
import { formatHandle } from '../utils/formatting/handles';
import { queryKeys } from '../utils/query/queryKeys';

interface UseMessageReactionsProps {
  conversationId: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentUserId: string;
  currentUser?: { handle?: string; avatar?: string };
}

/**
 * Unified hook for handling message reactions
 * Replaces duplicate handleEmojiSelect and handleReactionPress functions
 */
export function useMessageReactions({
  conversationId,
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.byConversation(conversationId),
        refetchType: 'active',
      });
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.byConversation(conversationId),
        refetchType: 'active',
      });
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
      setMessages(prev => {
        const targetMessage = prev.find(msg => String(msg._id) === messageId);
        const isCurrentUserReacted = targetMessage?.reactions?.some(
          reaction => reaction.value === emoji && reaction.sender.did === currentUserId
        );

        if (isCurrentUserReacted) {
          // Optimistically remove reaction
          const updated = prev.map(m => {
            if (String(m._id) !== messageId) return m;
            const nextReactions = (m.reactions || []).filter(
              r => !(r.value === emoji && r.sender.did === currentUserId)
            );
            return { ...m, reactions: nextReactions } as ChatMessage;
          });
          removeReactionMutation.mutate({ messageId, emoji });
          return updated;
        } else {
          // Optimistically add reaction
          const optimisticReaction: ReactionView = {
            value: emoji,
            sender: {
              did: currentUserId,
              ...(currentUser?.handle && { handle: currentUser.handle }),
              ...(formatHandle(currentUser?.handle) && {
                displayName: formatHandle(currentUser?.handle),
              }),
              ...(currentUser?.avatar && { avatar: currentUser.avatar }),
            } as ReactionViewSender,
            createdAt: new Date().toISOString(),
          };

          const updated = prev.map(m => {
            if (String(m._id) !== messageId) return m;
            const nextReactions = [...(m.reactions || []), optimisticReaction];
            return { ...m, reactions: nextReactions } as ChatMessage;
          });
          addReactionMutation.mutate({ messageId, emoji });
          return updated;
        }
      });
    },
    [currentUserId, currentUser, setMessages, addReactionMutation, removeReactionMutation]
  );

  return { handleReactionToggle };
}
