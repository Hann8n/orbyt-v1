import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import { useUserStore } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';
import type { Notification } from '../services/api/types';

export const useUnreadCount = () => {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);

  const queryOptions = {
    enabled: isAuthenticated,
    refetchInterval: (isAuthenticated ? 30000 : false) as number | false,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM, // 1 minute - unread counts change moderately
  };

  // Get unread notifications count
  const { data: notificationsData } = useQuery({
    queryKey: queryKeys.notifications.count(),
    queryFn: async () => {
      const response = await AtprotoService.listNotifications(null, 100);
      return response.notifications.filter((n: Notification) => !n.isRead).length;
    },
    ...queryOptions,
  });

  const notificationsCount = notificationsData || 0;
  const messagesCount = 0;
  const totalUnreadCount = notificationsCount + messagesCount;

  return {
    notificationsCount,
    messagesCount,
    totalUnreadCount,
    hasUnread: totalUnreadCount > 0,
  };
};
