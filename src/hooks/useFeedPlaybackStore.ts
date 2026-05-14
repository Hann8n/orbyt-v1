import { useCallback, useEffect, useRef, useState } from 'react';
import { createFeedListPlaybackStore } from '../core/visibility';

export function useFeedPlaybackStore(initialScrollIndex: number | undefined, feedLength: number) {
  const seedActiveIndex =
    typeof initialScrollIndex === 'number' ? initialScrollIndex : feedLength > 0 ? 0 : -1;

  const [listPlaybackStore] = useState(() =>
    createFeedListPlaybackStore({ activeIndex: seedActiveIndex })
  );

  // Internal-only: guards the feedLength effect from resetting a valid scroll position to 0.
  // The store's patch() covers all other equality checks.
  const activeIndexRef = useRef(seedActiveIndex);

  const handleActiveVisibleIndexChange = useCallback(
    (index: number) => {
      if (activeIndexRef.current === index) return;
      activeIndexRef.current = index;
      listPlaybackStore.patch({ activeIndex: index });
    },
    [listPlaybackStore]
  );

  useEffect(() => {
    if (typeof initialScrollIndex !== 'number') return;
    if (activeIndexRef.current === initialScrollIndex) return;
    activeIndexRef.current = initialScrollIndex;
    listPlaybackStore.patch({ activeIndex: initialScrollIndex });
  }, [initialScrollIndex, listPlaybackStore]);

  useEffect(() => {
    if (feedLength === 0) {
      if (activeIndexRef.current !== -1) {
        activeIndexRef.current = -1;
        listPlaybackStore.patch({ activeIndex: -1 });
      }
      return;
    }
    if (activeIndexRef.current >= 0) return;
    activeIndexRef.current = 0;
    listPlaybackStore.patch({ activeIndex: 0 });
  }, [feedLength, listPlaybackStore]);

  return {
    listPlaybackStore,
    handleActiveVisibleIndexChange,
  };
}
