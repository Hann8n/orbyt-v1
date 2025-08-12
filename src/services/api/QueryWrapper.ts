/**
 * TanStack Query Wrapper
 * Standardized wrapper for API services to use TanStack Query
 */
import { 
  QueryClient, 
  QueryKey, 
  UseQueryOptions,
  UseMutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery
} from '@tanstack/react-query';

// Default cache times
export const DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
export const EXTENDED_CACHE_TIME = 30 * 60 * 1000; // 30 minutes
export const SHORT_CACHE_TIME = 60 * 1000; // 1 minute

// Request statuses
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

// Create a global query client instance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_CACHE_TIME,
      gcTime: EXTENDED_CACHE_TIME,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

/**
 * Standard query function wrapper
 */
export function createQueryFn<TData = unknown, TParams = void>(
  fn: (params: TParams) => Promise<TData>
) {
  return async (params: TParams): Promise<TData> => {
    try {
      return await fn(params);
    } catch (error) {
      console.error(`Query error:`, error);
      throw error;
    }
  };
}

/**
 * Standard mutation function wrapper
 */
export function createMutationFn<TData = unknown, TVariables = void>(
  fn: (variables: TVariables) => Promise<TData>
) {
  return async (variables: TVariables): Promise<TData> => {
    try {
      return await fn(variables);
    } catch (error) {
      console.error(`Mutation error:`, error);
      throw error;
    }
  };
}

/**
 * Standard useQuery hook with error handling and loading state
 */
export function useStandardQuery<TData = unknown, TError = Error, TParams = void>(
  queryKey: QueryKey,
  queryFn: (params: TParams) => Promise<TData>,
  params: TParams,
  options?: UseQueryOptions<TData, TError, TData, QueryKey>
) {
  const result = useQuery({
    queryKey,
    queryFn: () => queryFn(params),
    ...options,
  });

  // Derive request status from query state
  const status: RequestStatus = 
    result.isLoading ? 'loading' : 
    result.isError ? 'error' : 
    result.isSuccess ? 'success' : 'idle';

  return {
    ...result,
    status,
  };
}

/**
 * Standard useMutation hook with automatic invalidation
 */
export function useStandardMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, TError, TVariables, TContext> & {
    invalidateQueries?: QueryKey[];
  }
) {
  const queryClient = useQueryClient();
  const { invalidateQueries, ...mutationOptions } = options || {};

  return useMutation({
    mutationFn,
    ...mutationOptions,
    onSuccess: async (data, variables, context) => {
      // Call the original onSuccess if provided
      if (mutationOptions?.onSuccess) {
        await mutationOptions.onSuccess(data, variables, context);
      }
      
      // Invalidate queries if specified
      if (invalidateQueries && invalidateQueries.length > 0) {
        await Promise.all(
          invalidateQueries.map(queryKey => 
            queryClient.invalidateQueries({ queryKey })
          )
        );
      }
    },
  });
}
