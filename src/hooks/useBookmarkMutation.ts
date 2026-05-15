import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { queryKeys } from '../utils/query/queryKeys';
import { BookmarkService } from '../services/api/bookmark/BookmarkService';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import { useBookmarkStore } from '../stores/bookmarkStore';

interface BookmarkVars {
  uri: string;
  cid: string;
  isBookmarked: boolean;
}

export function useBookmarkMutation() {
  const queryClient = useQueryClient();
  const { addBookmark, removeBookmark } = useBookmarkStore(
    useShallow(state => ({ addBookmark: state.addBookmark, removeBookmark: state.removeBookmark }))
  );

  return useMutation<string | void, Error, BookmarkVars>({
    mutationFn: async ({ uri, cid, isBookmarked }) => {
      if (isBookmarked) return BookmarkService.deleteBookmark(uri);
      let resolvedCid = cid;
      if (!resolvedCid) {
        const post = await AtprotoFeedService.getPost(uri);
        resolvedCid = post?.cid ?? '';
      }
      return BookmarkService.createBookmark(uri, resolvedCid);
    },

    onMutate: ({ uri, cid, isBookmarked }) => {
      if (isBookmarked) removeBookmark(uri);
      else addBookmark(uri, { uri, cid });
    },

    onError: (_err, { uri, cid, isBookmarked }) => {
      // Rollback the optimistic store update
      if (isBookmarked) addBookmark(uri, { uri, cid });
      else removeBookmark(uri);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks.list() });
    },
  });
}
