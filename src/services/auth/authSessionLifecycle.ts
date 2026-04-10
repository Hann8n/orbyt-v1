import { APP_CONSTANTS } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { prefetchOrbytColors } from '@/services/colors/OrbytColors';
import { RepoService } from '@/services/api/repo/RepoService';

export async function prefetchFollowingOrbytColorsOnly(userDid: string): Promise<void> {
  try {
    const { GraphService } = await import('@/services/api/graph/GraphService');
    const followingResponse = await GraphService.getFollowing(userDid, null, 100);
    const followingDids = followingResponse.following.map(f => f.did).slice(0, 99);
    if (followingDids.length === 0) return;
    await prefetchOrbytColors(followingDids, null);
  } catch (error) {
    logger.warn('Failed to prefetch following Orbyt colors', {
      component: 'authSessionLifecycle',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export function deferOrbytProfileInit(context: string = 'userStore'): void {
  requestIdleCallback(
    async () => {
      try {
        await RepoService.initOrbytProfileIfNeeded();
      } catch (error) {
        logger.debug(`Failed to initialize orbyt profile (${context})`, {
          component: 'authSessionLifecycle',
          error,
        });
      }
    },
    { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
  );
}
