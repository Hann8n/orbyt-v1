import { useRef, useLayoutEffect } from 'react';

/**
 * Creates a stable ref that stays in sync with the latest value.
 * This is useful for external APIs that require mutable references
 * (like expo-video player or Reanimated shared values) while avoiding
 * putting mutable objects in React dependency arrays.
 *
 * @param value - The value to keep in sync with the ref
 * @returns A ref that always contains the latest value
 */
export function useStableRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);

  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
