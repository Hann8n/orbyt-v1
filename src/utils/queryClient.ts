import { QueryClient } from '@tanstack/react-query';
import { QUERY_CONSTANTS } from './constants';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: QUERY_CONSTANTS.RETRY_COUNT,
      staleTime: QUERY_CONSTANTS.STALE_TIME,
      gcTime: QUERY_CONSTANTS.GC_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

