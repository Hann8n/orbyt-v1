import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, logShare } from '@react-native-firebase/analytics';
import { AtprotoFeedService } from '../services/api/feed/FeedService';
import { setFeedPostToggle } from './useLikeMutation';
import {
  confirmToggle,
  isConfirmedUri,
  optimisticToggle,
  rollbackToggle,
  type ToggleState,
} from '../utils/query/viewerToggle';

interface RepostVars {
  postUri: string;
  postCid: string;
  /** The state at tap time. */
  isReposted: boolean;
  repostUri?: string;
  repostCount: number;
}

export function useRepostMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    string | undefined,
    Error,
    RepostVars,
    { previous: ToggleState; optimistic: ToggleState }
  >({
    mutationKey: ['repost'],
    mutationFn: async ({ postUri, postCid, isReposted, repostUri }) => {
      if (!isReposted) return AtprotoFeedService.repostPost(postUri, postCid);
      if (!isConfirmedUri(repostUri)) throw new Error('No repost URI');
      await AtprotoFeedService.deleteRepost(repostUri);
      return undefined;
    },

    onMutate: ({ postUri, isReposted, repostUri, repostCount }) => {
      const previous = { uri: isReposted ? repostUri : undefined, count: repostCount };
      const optimistic = optimisticToggle(previous, !isReposted);
      setFeedPostToggle(queryClient, postUri, 'repost', () => optimistic);
      return { previous, optimistic };
    },

    onSuccess: (repostUri, { postUri, isReposted }) => {
      if (!isReposted) {
        logShare(getAnalytics(), {
          content_type: 'video',
          item_id: postUri,
          method: 'repost',
        }).catch(() => {});
      }
      setFeedPostToggle(queryClient, postUri, 'repost', current =>
        confirmToggle(current, !isReposted, repostUri)
      );
    },

    onError: (_, { postUri }, context) => {
      if (!context) return;
      setFeedPostToggle(queryClient, postUri, 'repost', current =>
        rollbackToggle(current, context.optimistic, context.previous)
      );
    },
  });
}
