import { QueryClient } from '@tanstack/react-query';
import { QUERY_CONSTANTS } from '../constants';
import { ApiRequestError } from '@/services/api/fetchJson';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= QUERY_CONSTANTS.RETRY_COUNT) {
          return false;
        }
        if (error instanceof ApiRequestError) {
          return error.status === 429 || error.status >= 500;
        }
        return true;
      },
      staleTime: QUERY_CONSTANTS.STALE_TIME,
      gcTime: QUERY_CONSTANTS.GC_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: 'always',
    },
  },
});
