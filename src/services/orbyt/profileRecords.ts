/**
 * The signed-in account's profile edits, written PDS-direct, as Orbyt iOS
 * (`ProfileService.updateProfile` / `setProfileStyle`) writes them:
 *
 * - Name, bio and avatar go to `app.bsky.actor.profile/self`, read first so
 *   every other field (banner, pronouns, pinned post, labels…) survives. An
 *   empty name or bio is saved empty, so the profile shows the handle rather
 *   than an older name. When the account also has a `com.getorbyt.actor.profile`
 *   (seeded by earlier builds of this app), the same values are mirrored into
 *   it, because the Orbyt AppView prefers that record over the network profile.
 * - Colors go to `com.getorbyt.profile/self` (`#RRGGBB`, as Byte writes them),
 *   read first so `joinDate` and every other field survive unchanged.
 */
import { ComAtprotoRepoGetRecord } from '@atproto/api';
import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';

import { AtprotoCore } from '@/services/api/core';
import { logger } from '@/utils/logger';

const ACTOR_PROFILE_COLLECTION = 'com.getorbyt.actor.profile';
const STYLE_PROFILE_COLLECTION = 'com.getorbyt.profile';
const NETWORK_PROFILE_COLLECTION = 'app.bsky.actor.profile';
const SELF = 'self';

const DISPLAY_NAME_MAX = 64;
const DESCRIPTION_MAX = 256;

/** Bluesky refuses avatar blobs over 1 MB; Orbyt iOS sends at most 1000pt and 950 KB. */
const AVATAR_MAX_DIMENSION = 1000;
const AVATAR_MAX_BYTES = 950_000;

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

/** Name and bio edits: trimmed and capped; empty clears the field. */
function applyText(record: RecordValue, edit: ProfileEdit) {
  if (edit.displayName !== undefined) {
    record.displayName = edit.displayName.trim().slice(0, DISPLAY_NAME_MAX);
  }
  if (edit.description !== undefined) {
    record.description = edit.description.trim().slice(0, DESCRIPTION_MAX);
  }
}

/** A JPEG of the picked image, downscaled and recompressed to fit Bluesky's avatar limit. */
async function avatarJpeg(uri: string): Promise<Uint8Array> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error('Unreadable avatar image');
  const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(image.width(), image.height()));
  const width = Math.max(1, Math.round(image.width() * scale));
  const height = Math.max(1, Math.round(image.height() * scale));
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Could not resize avatar image');
  surface
    .getCanvas()
    .drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, width, height),
      FilterMode.Linear,
      MipmapMode.Linear
    );
  surface.flush();
  const resized = surface.makeImageSnapshot();
  let quality = 85;
  let bytes = resized.encodeToBytes(ImageFormat.JPEG, quality);
  while (bytes.length > AVATAR_MAX_BYTES && quality > 30) {
    quality -= 10;
    bytes = resized.encodeToBytes(ImageFormat.JPEG, quality);
  }
  return bytes;
}

export interface ProfileEdit {
  displayName?: string;
  description?: string;
  /** A local `file://` or `data:` image to upload as the new avatar. */
  avatarUri?: string;
}

/**
 * Save name, bio and avatar to `app.bsky.actor.profile/self`, mirrored into an
 * existing `com.getorbyt.actor.profile/self`.
 * @returns the new avatar's CDN URL when the avatar changed
 */
export async function updateProfile(edit: ProfileEdit): Promise<{ avatar?: string }> {
  if (AtprotoCore.isOutgoingApiBlocked()) {
    if (AtprotoCore.shouldFailOfflineWriteMock()) {
      throw new Error('Offline write mock failure: updateProfile');
    }
    return {};
  }

  const { api, did } = await session();
  // A transient read failure throws rather than writing over the record blind.
  const existing = await readSelfRecord(api, did, NETWORK_PROFILE_COLLECTION);
  const record: RecordValue = { ...existing };
  applyText(record, edit);

  let avatarUrl: string | undefined;
  if (edit.avatarUri) {
    const { data } = await api.uploadBlob(await avatarJpeg(edit.avatarUri), {
      encoding: 'image/jpeg',
    });
    record.avatar = data.blob;
    avatarUrl = `https://cdn.bsky.app/img/avatar/plain/${did}/${data.blob.ref.toString()}@jpeg`;
  }

  await writeSelfRecord(api, did, NETWORK_PROFILE_COLLECTION, record, existing !== null);

  try {
    const orbyt = await readSelfRecord(api, did, ACTOR_PROFILE_COLLECTION);
    if (orbyt) {
      const mirrored: RecordValue = { ...orbyt, updatedAt: new Date().toISOString() };
      applyText(mirrored, edit);
      if (edit.avatarUri) {
        mirrored.avatar = record.avatar;
        // A still upload supersedes any looping rendition of the previous avatar.
        delete mirrored.avatarVideo;
      }
      await writeSelfRecord(api, did, ACTOR_PROFILE_COLLECTION, mirrored, true);
    }
  } catch (error) {
    // The profile itself is saved; the Orbyt AppView catches up on the next edit.
    logger.warn('Failed to mirror profile into com.getorbyt.actor.profile', {
      component: 'profileRecords',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { avatar: avatarUrl };
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
    ...existing,
    joinDate: typeof existing?.joinDate === 'string' ? existing.joinDate : now,
    updatedAt: now,
    colors: { backgroundColor: colors.backgroundColor, textColor: colors.textColor },
  };

  await writeSelfRecord(api, did, STYLE_PROFILE_COLLECTION, record, existing !== null);
}
