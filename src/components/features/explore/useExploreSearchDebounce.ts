import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 500;

export function useExploreSearchDebounce(searchQuery: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearPending();
    if (searchQuery === '') {
      setDebouncedQuery('');
      return;
    }
    timeoutRef.current = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS);
    return clearPending;
  }, [searchQuery, clearPending]);

  const clearPendingDebounce = useCallback(() => {
    clearPending();
  }, [clearPending]);

  return { debouncedQuery, clearPendingDebounce, setDebouncedQuery };
}
