/**
 * Handle Formatting Utilities
 */

/**
 * Format a handle by removing the .bsky.social or .orbyt.video suffix if present
 * @param handle - The handle to format (can be null or undefined)
 * @returns The formatted handle, or 'Unknown' if handle is falsy
 */
export function formatHandle(handle: string | null | undefined): string {
  if (!handle) return 'Unknown';
  return handle.replace(/\.(bsky\.social|orbyt\.video)$/, '');
}

/**
 * Split a handle into base and suffix parts for display purposes
 * Detaches ".orbyt.video" or ".bsky.social" suffix if present
 * @param handle - The handle to split (can be null or undefined)
 * @returns Object with handleBase and handleSuffix properties
 */
export function splitHandleSuffix(handle: string | null | undefined): {
  handleBase: string;
  handleSuffix: string | null;
} {
  if (!handle) {
    return { handleBase: 'username', handleSuffix: null };
  }

  const orbytSuffix = '.orbyt.video';
  const bskySuffix = '.bsky.social';

  if (handle.endsWith(orbytSuffix)) {
    return {
      handleBase: handle.slice(0, -orbytSuffix.length),
      handleSuffix: orbytSuffix,
    };
  }

  if (handle.endsWith(bskySuffix)) {
    return {
      handleBase: handle.slice(0, -bskySuffix.length),
      handleSuffix: bskySuffix,
    };
  }

  return {
    handleBase: handle,
    handleSuffix: null,
  };
}
