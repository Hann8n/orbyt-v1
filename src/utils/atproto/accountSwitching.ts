import ProfileService from '@/services/data/ProfileService';
import type { ProfileViewWithOrbyt } from '@/services/api/types';

type AccountWithDid = {
  did: string;
};

export type AccountWithCachedProfile<TAccount extends AccountWithDid> = TAccount & {
  cachedProfile?: ProfileViewWithOrbyt;
};

type AccountSwitchEligibilityParams = {
  targetDid: string;
  activeAccountDid: string | null;
  isSwitchingAccount: boolean;
  isAuthenticating: boolean;
};

export type AccountSwitchEligibility = 'ok' | 'already-active' | 'busy';

export function getAccountSwitchEligibility({
  targetDid,
  activeAccountDid,
  isSwitchingAccount,
  isAuthenticating,
}: AccountSwitchEligibilityParams): AccountSwitchEligibility {
  if (targetDid === activeAccountDid) {
    return 'already-active';
  }

  if (isSwitchingAccount || isAuthenticating) {
    return 'busy';
  }

  return 'ok';
}

/**
 * Pulls cached profile data for saved accounts so UI can render richer account rows
 * without re-implementing profile-fetch logic in each component.
 */
export async function hydrateAccountsWithCachedProfiles<TAccount extends AccountWithDid>(
  accounts: TAccount[]
): Promise<AccountWithCachedProfile<TAccount>[]> {
  return Promise.all(
    accounts.map(async account => {
      try {
        const cachedProfile = await ProfileService.getProfileByDid(account.did);
        return {
          ...account,
          cachedProfile: cachedProfile ?? undefined,
        };
      } catch {
        return account;
      }
    })
  );
}
