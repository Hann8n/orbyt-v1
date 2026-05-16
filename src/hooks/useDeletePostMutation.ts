import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/query/queryKeys';
import { AtprotoFeedService } from '../services/api/feed/FeedService';

export function useDeletePostMutation() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, string>({
    mutationFn: (postUri: string) => AtprotoFeedService.deletePost(postUri),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all, refetchType: 'active' });
    },
  });
}
