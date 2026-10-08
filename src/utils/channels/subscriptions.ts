/**
 * Which channels the account follows: the pure rules behind
 * `userStore.loadSubscribedChannels`.
 *
 * Joined Communities are the account's `com.getorbyt.community.membership`
 * records, written by every Orbyt client, so the server's list wins for
 * Communities. The device list adds what only this app follows (feed
 * generators) and stands in while the server has not answered.
 */
import { isCommunityUri } from '@/services/orbyt/communities';
import type { SubscribedChannel } from '@/stores/userStore';

/** Feeds every account has; never stored as subscriptions. */
export const BUILT_IN_CHANNELS: readonly string[] = ['following', 'your-mix'];

/**
 * The retired `com.getorbyt.profile#subscribedChannels` list to migrate into
 * memberships, or nothing. It is migrated once per account: never after this
 * device migrated it, and never once the account has memberships (another
 * client or an earlier install already moved it), so leaving every Community
 * does not bring the legacy list back.
 */
export function legacyChannelsToMigrate({
  alreadyMigrated,
  joined,
  legacy,
}: {
  alreadyMigrated: boolean;
  joined: readonly string[];
  legacy: unknown;
}): string[] {
  if (alreadyMigrated || joined.length > 0 || !Array.isArray(legacy)) return [];
  return legacy.filter((uri): uri is string => typeof uri === 'string');
}

export interface SubscribedChannelsPlan {
  channels: SubscribedChannel[];
  /** Communities to join: migrated legacy references the server does not list yet. */
  toJoin: string[];
}

/**
 * Merge the device list, legacy references being migrated and the server's
 * memberships. With `joined` null (the server has not answered) the device
 * list is only normalized.
 *
 * @param prune drop device Communities the server no longer lists (left on
 *   another client). Off when the device list changed while the server was
 *   being asked, so a join made meanwhile is not undone.
 */
export function planSubscribedChannels({
  saved,
  joined,
  legacy = [],
  prune = true,
  migrateUri,
  now,
}: {
  saved: readonly SubscribedChannel[];
  joined: readonly string[] | null;
  legacy?: readonly string[];
  prune?: boolean;
  migrateUri: (uri: string) => string;
  now: number;
}): SubscribedChannelsPlan {
  const joinedSet = new Set(joined ?? []);
  const byUri = new Map<string, SubscribedChannel>();
  const toJoin: string[] = [];

  const add = (channel: SubscribedChannel, isLegacy: boolean) => {
    const uri = migrateUri(channel.uri);
    if (BUILT_IN_CHANNELS.includes(uri) || byUri.has(uri)) return;
    const isCommunity = isCommunityUri(uri);
    // A legacy profile reference with no Community of its name has nothing to follow.
    if (isLegacy && !isCommunity) return;
    const migrated = isLegacy || uri !== channel.uri;
    if (isCommunity && joined && !joinedSet.has(uri)) {
      if (migrated) toJoin.push(uri);
      else if (prune) return;
    }
    byUri.set(uri, { ...channel, uri, isOrbytChannel: isCommunity });
  };

  saved.forEach(channel => add(channel, false));
  legacy.forEach(uri => add({ uri, displayName: '', subscribedAt: now }, true));
  joined?.forEach(uri => add({ uri, displayName: '', subscribedAt: now }, false));

  return { channels: Array.from(byUri.values()), toJoin };
}
