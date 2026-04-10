/**
 * OrbytColors - Profile colors from orbyt API (api.getorbyt.com)
 *
 * Single module: API, persistence (MMKV), React Query cache, user store sync.
 * No token - POST /v1/colors/refresh fetches from PDS (source of truth).
 */
import { queryClient } from '../../utils/query/queryClient';
import { queryOptions } from '@tanstack/react-query';
import { storage } from '../../utils/storage';
import { logger } from '../../utils/logger';
import { fetchJson, ApiRequestError } from '../api/fetchJson';
import { queryKeys } from '../../utils/query/queryKeys';

const API_BASE = 'https://api.getorbyt.com';
const STORAGE_KEY = 'orbyt_current_user_colors';
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ORBYT_COLOR_STALE_TIME_MS = 5 * 60 * 1000;
export const ORBYT_COLOR_GC_TIME_MS = 10 * 60 * 1000;

export interface OrbytColorData {
  textColor: string;
  backgroundColor: string;
  joinedAt: string;
  isBeta: boolean;
}

const getOrbytColorKey = (did: string) => queryKeys.orbyt.colors.detail(did);

export function getOrbytColorQueryOptions(did: string) {
  return queryOptions({
    queryKey: getOrbytColorKey(did),
    queryFn: ({ signal }) => fetchColors(did, signal),
    enabled: !!did,
    staleTime: ORBYT_COLOR_STALE_TIME_MS,
    gcTime: ORBYT_COLOR_GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchColors(
  did: string,
  signal?: globalThis.AbortSignal
): Promise<OrbytColorData | null> {
  if (!did) return null;
  try {
    return await fetchJson<OrbytColorData>(`${API_BASE}/v1/colors/${encodeURIComponent(did)}`, {
      signal,
      timeoutMs: 8000,
    });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) {
      return null;
    }
    logger.error('orbyt colors fetch failed', e, { did });
    throw e;
  }
}

async function batchFetchColors(
  dids: string[],
  signal?: globalThis.AbortSignal
): Promise<Record<string, OrbytColorData | null>> {
  if (!dids?.length) return {};
  const limited = dids.slice(0, 100);
  try {
    return await fetchJson<Record<string, OrbytColorData | null>>(`${API_BASE}/v1/colors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dids: limited }),
      signal,
      timeoutMs: 10000,
    });
  } catch (e) {
    logger.error('orbyt colors batch failed', e);
    throw e;
  }
}

async function refreshColors(
  did: string,
  signal?: globalThis.AbortSignal
): Promise<OrbytColorData | null> {
  try {
    return await fetchJson<OrbytColorData>(`${API_BASE}/v1/colors/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did }),
      signal,
      timeoutMs: 12000,
    });
  } catch (e) {
    logger.error('orbyt colors refresh failed', e, { did });
    return null;
  }
}

// ─── Persistence (MMKV) ──────────────────────────────────────────────────────

function getPersistedSync(did: string): OrbytColorData | null {
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return null;
    const {
      did: storedDid,
      data,
      timestamp,
    } = JSON.parse(raw) as {
      did: string;
      data: OrbytColorData;
      timestamp: number;
    };
    if (storedDid !== did || Date.now() - timestamp > STORAGE_MAX_AGE_MS || !data) return null;
    return data;
  } catch {
    return null;
  }
}

function loadPersisted(currentUserDid: string): void {
  try {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return;
    const { did, data, timestamp } = JSON.parse(raw) as {
      did: string;
      data: OrbytColorData;
      timestamp: number;
    };
    const valid = did === currentUserDid && Date.now() - timestamp < STORAGE_MAX_AGE_MS && data;
    if (valid) {
      queryClient.setQueryData(getOrbytColorKey(did), data, {
        updatedAt: timestamp,
      });
    }
  } catch {
    /* ignore */
  }
}

function persist(did: string, data: OrbytColorData | null): void {
  try {
    if (data) {
      storage.set(STORAGE_KEY, JSON.stringify({ did, data, timestamp: Date.now() }));
    }
  } catch {
    /* ignore */
  }
}

// ─── Sync (React Query + MMKV seed for initialData) ───────────────────────────

/** Write Orbyt API colors into React Query and MMKV (hydrates `useOrbytColors` initialData). */
export function syncOrbytColorsQuery(did: string, data: OrbytColorData): void {
  queryClient.setQueryData(getOrbytColorKey(did), data, {
    updatedAt: Date.now(),
  });
  persist(did, data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Sync-load persisted colors. Used at app start (userStore). */
export function getPersistedColorsSync(did: string): OrbytColorData | null {
  return getPersistedSync(did);
}

/** Load persisted colors into React Query. Used after sign-in (userStore). */
export function loadPersistedColors(currentUserDid: string): void {
  loadPersisted(currentUserDid);
}

/** Prefetch colors for DIDs, persist current user's. Used at sign-in (userStore). */
export async function prefetchOrbytColors(
  dids: string[],
  currentUserDid?: string | null
): Promise<OrbytColorData | null> {
  if (!dids?.length) return null;
  const results = await batchFetchColors(dids);
  for (const [did, data] of Object.entries(results)) {
    if (data) {
      queryClient.setQueryData(getOrbytColorKey(did), data, {
        updatedAt: Date.now(),
      });
    }
  }
  const firstDid = dids[0];
  const currentUserColors = results[firstDid] ?? null;
  if (currentUserColors && (currentUserDid == null || firstDid === currentUserDid)) {
    persist(firstDid, currentUserColors);
  }
  return currentUserDid ? (results[currentUserDid] ?? null) : currentUserColors;
}

/** Refresh from PDS and sync to caches. Call after saving profile colors. */
export async function saveAndSyncColors(
  did: string,
  colors: { textColor: string; backgroundColor: string }
): Promise<void> {
  const data = await refreshColors(did);
  if (!data) {
    const cached = queryClient.getQueryData<OrbytColorData | null>(getOrbytColorKey(did));
    const fallback: OrbytColorData = {
      ...colors,
      joinedAt: cached?.joinedAt ?? new Date().toISOString(),
      isBeta: cached?.isBeta ?? false,
    };
    syncOrbytColorsQuery(did, fallback);
    return;
  }
  syncOrbytColorsQuery(did, data);
}

export { fetchColors, batchFetchColors, getOrbytColorKey };
