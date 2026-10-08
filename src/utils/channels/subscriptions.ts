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
 * @param pinned Communities followed or left on this device while the server
 *   was being asked: the device list wins for them, so a follow or unfollow
 *   still being written is neither undone nor re-added from a stale answer.
 */
export function planSubscribedChannels({
  saved,
  joined,
  legacy = [],
  pinned = new Set(),
  migrateUri,
  now,
}: {
  saved: readonly SubscribedChannel[];
  joined: readonly string[] | null;
  legacy?: readonly string[];
  pinned?: ReadonlySet<string>;
  migrateUri: (uri: string) => string;
  now: number;
}): SubscribedChannelsPlan {
  const joinedSet = new Set(joined ?? []);
  const byUri = new Map<string, SubscribedChannel>();
  const toJoin: string[] = [];

  const add = (channel: SubscribedChannel, source: 'device' | 'legacy' | 'server') => {
    const uri = migrateUri(channel.uri);
    if (BUILT_IN_CHANNELS.includes(uri) || byUri.has(uri)) return;
    if (source !== 'device' && pinned.has(uri)) return;
    const isCommunity = isCommunityUri(uri);
    // A legacy profile reference with no Community of its name has nothing to follow.
    if (source === 'legacy' && !isCommunity) return;
    if (isCommunity && joined && !joinedSet.has(uri) && !pinned.has(uri)) {
      // Not migrating, so it was left on another client.
      if (source === 'device' && uri === channel.uri) return;
      toJoin.push(uri);
    }
    byUri.set(uri, { ...channel, uri, isOrbytChannel: isCommunity });
  };

  saved.forEach(channel => add(channel, 'device'));
  legacy.forEach(uri => add({ uri, displayName: '', subscribedAt: now }, 'legacy'));
  joined?.forEach(uri => add({ uri, displayName: '', subscribedAt: now }, 'server'));

  return { channels: Array.from(byUri.values()), toJoin };
}

/**
 * Which Communities this device followed or left while a reconcile asked the
 * server, so the reconcile can pin them (`planSubscribedChannels` `pinned`).
 */
export function createMembershipWriteTracker() {
  /** Communities with a membership write in flight, counted per URI. */
  const pending = new Map<string, number>();
  /** One set per running reconcile, collecting every Community written while it runs. */
  const watchers = new Set<Set<string>>();

  return {
    /** Run a membership write for these Communities. */
    async track<T>(uris: readonly string[], write: () => Promise<T>): Promise<T> {
      uris.forEach(uri => {
        pending.set(uri, (pending.get(uri) ?? 0) + 1);
        watchers.forEach(written => written.add(uri));
      });
      try {
        return await write();
      } finally {
        uris.forEach(uri => {
          const remaining = (pending.get(uri) ?? 1) - 1;
          if (remaining > 0) pending.set(uri, remaining);
          else pending.delete(uri);
        });
      }
    },

    /** Run a reconcile, given every Community in flight when it starts or written while it runs. */
    async watch<T>(reconcile: (written: ReadonlySet<string>) => Promise<T>): Promise<T> {
      const written = new Set(pending.keys());
      watchers.add(written);
      try {
        return await reconcile(written);
      } finally {
        watchers.delete(written);
      }
    },
  };
}
