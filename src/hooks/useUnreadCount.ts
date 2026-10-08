import { useQuery } from '@tanstack/react-query';
import { NotificationService } from '../services/api/notification/NotificationService';
import { useUserStore, selectIsSessionValid } from '../stores/userStore';
import { QUERY_CONSTANTS } from '../utils/constants';
import { queryKeys } from '../utils/query/queryKeys';
const UNREAD_NOTIFICATIONS_POLL_MS = 60_000;

export const useUnreadCount = () => {
  const sessionValid = useUserStore(selectIsSessionValid);

  const { data: notificationsCount = 0 } = useQuery({
    queryKey: [...queryKeys.unread.summary(), 'notifications'],
    queryFn: async () => (await NotificationService.getUnreadCount()).count,
    enabled: sessionValid,
    staleTime: QUERY_CONSTANTS.STALE_TIME_MEDIUM,
    // The badge lives in the tab bar, which never remounts: refresh on resume and periodically
    // while foregrounded (React Query pauses intervals in the background).
    refetchOnWindowFocus: true,
    refetchInterval: UNREAD_NOTIFICATIONS_POLL_MS,
  });

  return { notificationsCount, totalUnreadCount: notificationsCount };
};
