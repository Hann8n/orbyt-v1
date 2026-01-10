/**
 * TanStack Query Client Configuration
 * Shared query client for Bluesky API queries
 * Uses ESM CDN import - no build tools required
 */

let QueryClient = null;
let queryClientInstance = null;

/**
 * Initialize TanStack Query Core from ESM CDN
 */
async function initQueryClient() {
  if (!QueryClient) {
    const module = await import('https://esm.sh/@tanstack/query-core@5.51.1');
    QueryClient = module.QueryClient;
  }
  return QueryClient;
}

/**
 * Create and configure the query client
 * @returns {Promise<Object>} Configured QueryClient instance
 */
export async function createQueryClient() {
  const QC = await initQueryClient();

  return new QC({
    defaultOptions: {
      queries: {
        // Profile queries: 5-minute stale time (rarely changes)
        staleTime: 5 * 60 * 1000, // 5 minutes
        // Cache time: 10 minutes (how long to keep unused data)
        gcTime: 10 * 60 * 1000, // Previously called cacheTime
        // Retry failed requests up to 2 times
        retry: 2,
        // Retry delay with exponential backoff
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  });
}

/**
 * Get or create singleton query client instance
 */
export async function getQueryClient() {
  if (!queryClientInstance) {
    queryClientInstance = await createQueryClient();

    // Set up window focus refetch (manual implementation for vanilla JS)
    let lastFocusTime = Date.now();
    window.addEventListener('focus', () => {
      const now = Date.now();
      // Only refetch if window was unfocused for more than 30 seconds
      if (now - lastFocusTime > 30000) {
        // Refetch stale queries
        queryClientInstance
          .refetchQueries({
            stale: true,
          })
          .catch(err => {
            console.warn('Error refetching queries on focus:', err);
          });
      }
      lastFocusTime = now;
    });

    // Refetch on reconnect
    window.addEventListener('online', () => {
      queryClientInstance
        .refetchQueries({
          stale: true,
        })
        .catch(err => {
          console.warn('Error refetching queries on reconnect:', err);
        });
    });
  }
  return queryClientInstance;
}

/**
 * Query key factories for consistent query key generation
 */
export const queryKeys = {
  profile: handle => ['bluesky-profile', handle],
  feed: (handle, cursor) => ['bluesky-feed', handle, cursor || null],
  post: (handle, postId) => ['bluesky-post', handle, postId],
};

/**
 * Helper function to fetch query with proper error handling
 * @param {Object} queryClient - QueryClient instance
 * @param {Array} queryKey - Query key array
 * @param {Function} queryFn - Function that returns a Promise
 * @param {Object} options - Additional query options
 * @returns {Promise} Query result
 */
export async function fetchQuery(queryClient, queryKey, queryFn, options = {}) {
  return queryClient.fetchQuery({
    queryKey,
    queryFn,
    ...options,
  });
}
