import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 500;

export function useExploreSearchDebounce(searchQuery: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- standard debounce: clear vs schedule setDebouncedQuery */
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (searchQuery === '') {
      setDebouncedQuery('');
      debounceTimeoutRef.current = null;
      return;
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      debounceTimeoutRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [searchQuery]);

  const clearPendingDebounce = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  };

  return { debouncedQuery, debounceTimeoutRef, clearPendingDebounce, setDebouncedQuery };
}
