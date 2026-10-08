import { QueryClient } from '@tanstack/react-query';
import { QUERY_CONSTANTS } from '../constants';
import { createRetryPolicy } from './retryPolicy';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: createRetryPolicy(QUERY_CONSTANTS.RETRY_COUNT),
      staleTime: QUERY_CONSTANTS.STALE_TIME,
      gcTime: QUERY_CONSTANTS.GC_TIME,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: 'always',
    },
  },
});
