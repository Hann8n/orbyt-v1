import type { QueryClient } from '@tanstack/react-query';
import { prefetchProfile } from '@/services/data/ProfileService';
import type { Profile } from './types';

/** Prefetch profile then open with tab-aware stack navigation. */
export const prefetchProfileThenOpen = (
  profile: Profile,
  queryClient: QueryClient,
  openProfileForDid: (did: string) => void
) => {
  if (!profile.did) return;

  const did = profile.did.trim();
  if (!did) return;

  prefetchProfile(queryClient, did, {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    avatar: profile.avatar,
    description: profile.description,
    verification: profile.verification,
  }).finally(() => {
    openProfileForDid(did);
  });
};
