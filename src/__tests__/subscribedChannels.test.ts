import { legacyChannelsToMigrate, planSubscribedChannels } from '@/utils/channels/subscriptions';
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

  it('keeps device Communities when the list changed during the request', () => {
    const plan = planSubscribedChannels({
      saved: [channel(art)],
      joined: [],
      prune: false,
      migrateUri,
      now: 2,
    });
    expect(plan.channels.map(c => c.uri)).toEqual([art]);
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
