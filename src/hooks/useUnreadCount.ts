import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import ChatService from '../services/ChatService';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';

export const useUnreadCount = () => {
  const { updateFromConversations } = useChatStore();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  
  const queryOptions = {
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? 30000 : false,
    staleTime: 60000,
  };
  
  // Get unread notifications count
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: async () => {
      const response = await AtprotoService.listNotifications(null, 100);
      return response.notifications.filter((n: any) => !n.isRead).length;
    },
    ...queryOptions,
  });

  // Get unread messages count
  const { data: messagesData } = useQuery({
    queryKey: ['conversations-count'],
    queryFn: async () => {
      const response = await ChatService.getConversations();
      if (response.conversations) {
        updateFromConversations(response.conversations);
      }
      return response.conversations.reduce((total, conv) => total + conv.unreadCount, 0);
    },
    ...queryOptions,
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
