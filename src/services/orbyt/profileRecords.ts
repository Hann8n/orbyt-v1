/**
 * The signed-in account's Orbyt profile records, written PDS-direct.
 *
 * Per orbyt-platform `docs/SOCIAL_GRAPH.md`:
 * - `com.getorbyt.actor.profile/self` is the account's Orbyt profile (name, bio,
 *   avatar, banner). Absent fields fall back to the network profile, so it is
 *   seeded from `app.bsky.actor.profile` the first time (onboarding import).
 * - `com.getorbyt.profile/self` is styling only: `joinDate`, `updatedAt`,
 *   `colors` (`#RRGGBB`, as Byte writes them) and `fontPreference`. Retired
 *   fields (`subscribedChannels`, `algorithmicFeedProvider`) are not carried.
 *
 * The AppView projects both through the Jetstream ingester and serves them
 * merged from `com.getorbyt.actor.getProfile`.
 */
import { ComAtprotoRepoGetRecord } from '@atproto/api';

import { AtprotoCore } from '@/services/api/core';
import { storage } from '@/utils/storage/storage';

const ACTOR_PROFILE_COLLECTION = 'com.getorbyt.actor.profile';
const STYLE_PROFILE_COLLECTION = 'com.getorbyt.profile';
const NETWORK_PROFILE_COLLECTION = 'app.bsky.actor.profile';
const SELF = 'self';

const DISPLAY_NAME_MAX = 64;
const DESCRIPTION_MAX = 256;

type Api = Awaited<ReturnType<typeof AtprotoCore.getApiClient>>['api'];
type RecordValue = Record<string, unknown>;

/** The record, or null when it genuinely does not exist. Any other failure throws. */
async function readSelfRecord(
  api: Api,
  did: string,
  collection: string
): Promise<RecordValue | null> {
  try {
    const { data } = await api.com.atproto.repo.getRecord({ repo: did, collection, rkey: SELF });
    return (data.value as RecordValue) ?? null;
  } catch (error) {
    if (error instanceof ComAtprotoRepoGetRecord.RecordNotFoundError) return null;
    throw error;
  }
}

/**
 * Replace the record when one was read, create it otherwise. `createRecord`
 * fails if a record already exists, so a wrong "absent" read can never
 * overwrite live data.
 */
async function writeSelfRecord(
  api: Api,
  did: string,
  collection: string,
  record: RecordValue,
  hasExisting: boolean
): Promise<void> {
  const input = { repo: did, collection, rkey: SELF, record: { ...record, $type: collection } };
  if (hasExisting) {
    await api.com.atproto.repo.putRecord(input);
  } else {
    await api.com.atproto.repo.createRecord(input);
  }
}

async function session(): Promise<{ api: Api; did: string }> {
  const { did } = await AtprotoCore.ensureSession();
  const { api } = await AtprotoCore.getApiClient();
  return { api, did };
}

/** The network profile's fields that seed an Orbyt profile on first use. */
async function importNetworkProfile(api: Api, did: string): Promise<RecordValue> {
  const network = await readSelfRecord(api, did, NETWORK_PROFILE_COLLECTION).catch(() => null);
  const seeded: RecordValue = {};
  for (const field of ['displayName', 'description', 'avatar', 'banner'] as const) {
    if (network?.[field] !== undefined) seeded[field] = network[field];
  }
  return seeded;
}

function applyText(record: RecordValue, field: string, value: string | undefined, max: number) {
  if (value === undefined) return;
  const trimmed = value.trim().slice(0, max);
  // Absent means "use the network profile's value"; an empty edit clears to that.
  if (trimmed) record[field] = trimmed;
  else delete record[field];
}

async function uploadImage(api: Api, uri: string) {
  const blob = await (await fetch(uri)).blob();
  const { data } = await api.uploadBlob(blob, { encoding: blob.type || 'image/jpeg' });
  return data.blob;
}

export interface OrbytProfileEdit {
  displayName?: string;
  description?: string;
  /** A local `file://` or `data:` image to upload as the new avatar. */
  avatarUri?: string;
}

/** Save the user's Orbyt profile (`com.getorbyt.actor.profile/self`). */
export async function updateOrbytActorProfile(edit: OrbytProfileEdit): Promise<void> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: updateOrbytActorProfile');
    }
    return;
  }

  const { api, did } = await session();
  const existing = await readSelfRecord(api, did, ACTOR_PROFILE_COLLECTION);
  const now = new Date().toISOString();
  const record: RecordValue = existing
    ? { ...existing }
    : { ...(await importNetworkProfile(api, did)), createdAt: now };

  applyText(record, 'displayName', edit.displayName, DISPLAY_NAME_MAX);
  applyText(record, 'description', edit.description, DESCRIPTION_MAX);
  if (edit.avatarUri) {
    record.avatar = await uploadImage(api, edit.avatarUri);
    // A still upload supersedes any looping rendition of the previous avatar.
    delete record.avatarVideo;
  }
  record.updatedAt = now;

  await writeSelfRecord(api, did, ACTOR_PROFILE_COLLECTION, record, existing !== null);
}

/** Save the user's profile colors (`com.getorbyt.profile/self`). */
export async function updateOrbytProfileColors(colors: {
  backgroundColor: string;
  textColor: string;
}): Promise<void> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: updateOrbytProfileColors');
    }
    return;
  }

  const { api, did } = await session();
  // A transient read failure throws here rather than falling through to a write
  // that would drop the account's join date.
  const existing = await readSelfRecord(api, did, STYLE_PROFILE_COLLECTION);
  const now = new Date().toISOString();
  const record: RecordValue = {
    joinDate: typeof existing?.joinDate === 'string' ? existing.joinDate : now,
    updatedAt: now,
    colors: { backgroundColor: colors.backgroundColor, textColor: colors.textColor },
  };
  if (typeof existing?.fontPreference === 'string') {
    record.fontPreference = existing.fontPreference;
  }

  await writeSelfRecord(api, did, STYLE_PROFILE_COLLECTION, record, existing !== null);
}

const ONBOARDED_KEY_PREFIX = 'orbyt_actor_profile_v1_';

/**
 * First sign-in onboarding: copy the network profile into
 * `com.getorbyt.actor.profile` when the account has none. Writing it is also
 * what makes the account an Orbyt actor in the AppView. Best-effort, once per
 * account per install.
 */
export async function ensureOrbytActorProfile(): Promise<void> {
  if (AtprotoCore.isOutgoingApiBlocked()) return;
  const did = AtprotoCore.getCurrentUserDid();
  if (!did || storage.getString(`${ONBOARDED_KEY_PREFIX}${did}`) === 'true') return;

  const { api } = await AtprotoCore.getApiClient();
  const existing = await readSelfRecord(api, did, ACTOR_PROFILE_COLLECTION);
  if (!existing) {
    const now = new Date().toISOString();
    const record = { ...(await importNetworkProfile(api, did)), createdAt: now, updatedAt: now };
    await writeSelfRecord(api, did, ACTOR_PROFILE_COLLECTION, record, false);
  }
  storage.set(`${ONBOARDED_KEY_PREFIX}${did}`, 'true');
}
