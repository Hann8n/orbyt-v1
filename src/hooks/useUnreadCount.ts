import { useQuery } from '@tanstack/react-query';
import { NotificationService } from '../services/api/notification/NotificationService';
import { useUserStore, selectIsSessionValid } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';

export const useUnreadCount = () => {
  const sessionValid = useUserStore(selectIsSessionValid);

  const { data: notificationsCount = 0 } = useQuery({
    queryKey: [...queryKeys.unread.summary(), 'notifications'],
    queryFn: async () => (await NotificationService.getUnreadCount()).count,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM,
  });

  return { notificationsCount, totalUnreadCount: notificationsCount };
};
