import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import ChatService from '../services/ChatService';
import { useChatStore } from '../stores/chatStore';

export const useUnreadCount = () => {
  const { updateFromConversations } = useChatStore();
  
  // Get unread notifications count
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      return AtprotoService.getUnreadNotificationCount();
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 60000, // Consider stale after 1 minute
  });

  // Get unread messages count
  const { data: messagesData } = useQuery({
    queryKey: ['conversations-count'],
    queryFn: async () => {
      const response = await ChatService.getConversations();
      // Update chat store with conversations (includes latest messages from notifications)
      if (response.conversations) {
        updateFromConversations(response.conversations);
      }
      return response.conversations.reduce((total, conv) => total + conv.unreadCount, 0);
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 60000, // Consider stale after 1 minute
  });

  const notificationsCount = notificationsData || 0;
  const messagesCount = messagesData || 0;
  const totalUnreadCount = notificationsCount + messagesCount;

  return {
    notificationsCount,
    messagesCount,
    totalUnreadCount,
    hasUnread: totalUnreadCount > 0,
  };
};
