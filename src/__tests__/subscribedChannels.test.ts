import {
  createMembershipWriteTracker,
  legacyChannelsToMigrate,
  planSubscribedChannels,
} from '@/utils/channels/subscriptions';
import type { SubscribedChannel } from '@/stores/userStore';

const art = 'at://did:plc:a/com.getorbyt.community.declaration/art';
const music = 'at://did:plc:a/com.getorbyt.community.declaration/music';
const feed = 'at://did:plc:b/app.bsky.feed.generator/cats';
const legacyArt = 'at://local.orbyt.channel/art';

const migrateUri = (uri: string) => (uri === legacyArt ? art : uri);
const channel = (uri: string): SubscribedChannel => ({ uri, displayName: uri, subscribedAt: 1 });

describe('legacyChannelsToMigrate', () => {
  it('migrates the legacy list for an account with no memberships', () => {
    expect(
      legacyChannelsToMigrate({ alreadyMigrated: false, joined: [], legacy: [legacyArt] })
    ).toEqual([legacyArt]);
  });

  it('never migrates twice', () => {
    expect(
      legacyChannelsToMigrate({ alreadyMigrated: true, joined: [], legacy: [legacyArt] })
    ).toEqual([]);
  });

  it('skips accounts that already have memberships', () => {
    expect(
      legacyChannelsToMigrate({ alreadyMigrated: false, joined: [music], legacy: [legacyArt] })
    ).toEqual([]);
  });

  it('ignores a malformed list', () => {
    expect(legacyChannelsToMigrate({ alreadyMigrated: false, joined: [], legacy: 'art' })).toEqual(
      []
    );
    expect(
      legacyChannelsToMigrate({ alreadyMigrated: false, joined: [], legacy: [legacyArt, 3] })
    ).toEqual([legacyArt]);
  });
});

describe('planSubscribedChannels', () => {
  it('normalizes the device list while the server has not answered', () => {
    const plan = planSubscribedChannels({
      saved: [channel('following'), channel(legacyArt), channel(feed), channel(feed)],
      joined: null,
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([art, feed]);
    expect(plan.channels[0].isOrbytChannel).toBe(true);
    expect(plan.channels[1].isOrbytChannel).toBe(false);
    expect(plan.toJoin).toEqual([]);
  });

  it('follows what the server lists and drops Communities left elsewhere', () => {
    const plan = planSubscribedChannels({
      saved: [channel(art), channel(feed)],
      joined: [music],
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([feed, music]);
    expect(plan.toJoin).toEqual([]);
  });

  it('keeps a Community followed while the server was asked', () => {
    const plan = planSubscribedChannels({
      saved: [channel(art), channel(music)],
      joined: [],
      pinned: new Set([art]),
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([art]);
    expect(plan.toJoin).toEqual([]);
  });

  it('does not bring back a Community left while the server was asked', () => {
    const plan = planSubscribedChannels({
      saved: [channel(feed)],
      joined: [art, music],
      legacy: [legacyArt],
      pinned: new Set([art]),
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([feed, music]);
    expect(plan.toJoin).toEqual([]);
  });

  it('joins migrated legacy references the server does not list', () => {
    const plan = planSubscribedChannels({
      saved: [],
      joined: [],
      legacy: [legacyArt, 'at://local.orbyt.channel/unknown'],
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([art]);
    expect(plan.toJoin).toEqual([art]);
  });

  it('does not rejoin a legacy reference already joined', () => {
    const plan = planSubscribedChannels({
      saved: [channel(legacyArt)],
      joined: [art],
      legacy: [legacyArt],
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([art]);
    expect(plan.toJoin).toEqual([]);
  });
});

describe('createMembershipWriteTracker', () => {
  const deferred = () => {
    let resolve: () => void = () => {};
    const promise = new Promise<void>(done => {
      resolve = done;
    });
    return { promise, resolve };
  };

  it('pins writes in flight when a reconcile starts and writes made while it runs', async () => {
    const tracker = createMembershipWriteTracker();
    const before = deferred();
    const beforeWrite = tracker.track([art], () => before.promise);

    const server = deferred();
    let pinned: string[] = [];
    const reconcile = tracker.watch(async written => {
      await server.promise;
      pinned = [...written];
    });
    const during = tracker.track([music], async () => {});
    server.resolve();
    await reconcile;
    before.resolve();
    await Promise.all([beforeWrite, during]);

    expect(pinned.sort()).toEqual([art, music].sort());
  });

  it('pins nothing once writes have settled', async () => {
    const tracker = createMembershipWriteTracker();
    await tracker.track([art], async () => {});
    await expect(tracker.track([music], () => Promise.reject(new Error('x')))).rejects.toThrow();
    let pinned: string[] = ['unset'];
    await tracker.watch(async written => {
      pinned = [...written];
    });
    expect(pinned).toEqual([]);
  });
});
