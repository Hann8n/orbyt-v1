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

  const { data } = useQuery({
    queryKey: effectiveDid ? queryKeys.moderation.byUser(effectiveDid) : ['moderation', 'no-user'],
    queryFn: async () => {
      const result = await ModerationService.getModerationPrefsAndLabelDefs(agent ?? undefined);
      return result ?? null;
    },
    enabled: !!agent && !!effectiveDid && !isSwitchingAccount,
    staleTime: QUERY_CONSTANTS.STALE_TIME_LONG,
    gcTime: QUERY_CONSTANTS.GC_TIME,
    retry: 1,
    select: raw => ({
      moderationPrefs: raw?.moderationPrefs ?? null,
      labelDefs: raw?.labelDefs ?? null,
    }),
  });

  return {
    moderationPrefs: data?.moderationPrefs ?? null,
    labelDefs: data?.labelDefs ?? null,
  };
}
