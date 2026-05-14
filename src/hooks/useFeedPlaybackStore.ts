import { useCallback, useEffect, useRef, useState } from 'react';
import { createFeedListPlaybackStore } from '../core/visibility';

export function useFeedPlaybackStore(initialScrollIndex: number | undefined, feedLength: number) {
  const seedActiveIndex =
    typeof initialScrollIndex === 'number' ? initialScrollIndex : feedLength > 0 ? 0 : -1;

  const activeVisibleIndexRef = useRef(seedActiveIndex);

  const [listPlaybackStore] = useState(() =>
    createFeedListPlaybackStore({ activeIndex: seedActiveIndex })
  );

  const handleActiveVisibleIndexChange = useCallback(
    (index: number) => {
      if (activeVisibleIndexRef.current === index) return;
      activeVisibleIndexRef.current = index;
      listPlaybackStore.patch({ activeIndex: index });
    },
    [listPlaybackStore]
  );

  useEffect(() => {
    if (typeof initialScrollIndex !== 'number') return;
    if (activeVisibleIndexRef.current === initialScrollIndex) return;
    activeVisibleIndexRef.current = initialScrollIndex;
    listPlaybackStore.patch({ activeIndex: initialScrollIndex });
  }, [initialScrollIndex, listPlaybackStore]);

  useEffect(() => {
    if (feedLength === 0) {
      if (activeVisibleIndexRef.current === -1) return;
      activeVisibleIndexRef.current = -1;
      listPlaybackStore.patch({ activeIndex: -1 });
      return;
    }
    if (activeVisibleIndexRef.current >= 0) return;
    activeVisibleIndexRef.current = 0;
    listPlaybackStore.patch({ activeIndex: 0 });
  }, [feedLength, listPlaybackStore]);

  return {
    listPlaybackStore,
    activeVisibleIndexRef,
    handleActiveVisibleIndexChange,
  };
}
