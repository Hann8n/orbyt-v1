import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '../stores/userStore';
import { queryKeys } from '../utils/query/queryKeys';
import { ModerationService } from '../services/moderation/ModerationService';
import { QUERY_CONSTANTS } from '../utils/constants';

export function useModerationSettings(userDid?: string) {
  const agent = useUserStore(state => state.agent);
  const currentUser = useUserStore(state => state.currentUser);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);

  const effectiveDid = userDid || currentUser?.did;

  const query = useQuery({
    queryKey: effectiveDid ? queryKeys.moderation.byUser(effectiveDid) : ['moderation', 'no-user'],
    queryFn: () => ModerationService.fetchModerationSettings(agent ?? undefined),
    enabled: !!agent && !!effectiveDid && !isSwitchingAccount,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: QUERY_CONSTANTS.GC_TIME,
    retry: 1,
  });

  return {
    settings:
      query.data ?? ModerationService.getCachedModerationSettings(effectiveDid ?? undefined),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
