import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { storage } from '../utils/storage';
import { useBatchProfilesByDid } from '../services/data/ProfileService';
import type { GeneratorView } from '../services/api/types';
import { AtprotoCore } from '../services/api/core';
import type { ProfileViewWithOrbyt } from '../services/api/types';
import type { CachedChannel } from '../services/data/ChannelService';

const VISIT_HISTORY_KEY_BASE = 'visitHistory';
const MAX_HISTORY = 20;

export type VisitHistoryEntry = { type: 'profile'; did: string } | { type: 'channel'; uri: string };

function getScopedKey(did: string | null | undefined): string {
  if (!did) return VISIT_HISTORY_KEY_BASE;
  const sanitizedDid = String(did).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${VISIT_HISTORY_KEY_BASE}_${sanitizedDid}`;
}

function readVisitHistoryFromStorage(storageKey: string): VisitHistoryEntry[] {
  const raw = storage.getString(storageKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    // Lean format: ["p:<did>", "c:<uri>", ...]
    const strings: string[] = (parsed as unknown[])
      .map(v => (typeof v === 'string' ? v : null))
      .filter((v): v is string => typeof v === 'string');

    if (strings.length > 0) {
      return strings
        .map((s): VisitHistoryEntry | null => {
          if (s.startsWith('p:')) {
            const did = s.slice(2).trim();
            return did ? { type: 'profile', did } : null;
          }
          if (s.startsWith('c:')) {
            const uri = s.slice(2).trim();
            return uri ? { type: 'channel', uri } : null;
          }
          return null;
        })
        .filter((v): v is VisitHistoryEntry => v !== null);
    }

    // Legacy formats -> migrate into lean strings once.
    const migratedStrings: string[] = (parsed as unknown[])
      .map((item): string | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as {
          type?: string;
          did?: string;
          uri?: string;
          data?: { did?: string; uri?: string };
          t?: 'p' | 'c';
          id?: string;
        };
        if (record.type === 'profile') {
          const did = record.did ?? record.data?.did;
          return typeof did === 'string' && did.trim() ? `p:${did.trim()}` : null;
        }
        if (record.type === 'channel') {
          const uri = record.uri ?? record.data?.uri;
          return typeof uri === 'string' && uri.trim() ? `c:${uri.trim()}` : null;
        }
        // Previously-compact objects
        if (record.t === 'p' && typeof record.id === 'string' && record.id.trim())
          return `p:${record.id.trim()}`;
        if (record.t === 'c' && typeof record.id === 'string' && record.id.trim())
          return `c:${record.id.trim()}`;
        return null;
      })
      .filter((v): v is string => typeof v === 'string');

    storage.set(storageKey, JSON.stringify(migratedStrings));

    return migratedStrings
      .map((s): VisitHistoryEntry | null => {
        if (s.startsWith('p:')) {
          const did = s.slice(2).trim();
          return did ? { type: 'profile', did } : null;
        }
        if (s.startsWith('c:')) {
          const uri = s.slice(2).trim();
          return uri ? { type: 'channel', uri } : null;
        }
        return null;
      })
      .filter((v): v is VisitHistoryEntry => v !== null);
  } catch {
    return [];
  }
}

function writeVisitHistoryToStorage(storageKey: string, history: VisitHistoryEntry[]) {
  const strings = history.map(h => (h.type === 'profile' ? `p:${h.did}` : `c:${h.uri}`));
  storage.set(storageKey, JSON.stringify(strings));
}

export function useVisitHistory(currentUserDid?: string | null) {
  const storageKey = useMemo(() => getScopedKey(currentUserDid ?? null), [currentUserDid]);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryEntry[]>([]);

  useEffect(() => {
    // If we now have a DID-scoped key, migrate once from legacy global key (if present).
    if (storageKey !== VISIT_HISTORY_KEY_BASE) {
      const existingScoped = storage.getString(storageKey);
      if (!existingScoped) {
        const legacyRaw = storage.getString(VISIT_HISTORY_KEY_BASE);
        if (legacyRaw) {
          storage.set(storageKey, legacyRaw);
          storage.delete(VISIT_HISTORY_KEY_BASE);
        }
      }
    }

    // Sync local state from MMKV for this scoped key.
    // This is effectively an external store read (MMKV) mirrored into React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisitHistory(readVisitHistoryFromStorage(storageKey));
  }, [storageKey]);

  const profileDids = useMemo(
    () =>
      visitHistory
        .filter((h): h is Extract<VisitHistoryEntry, { type: 'profile' }> => h.type === 'profile')
        .map(h => h.did),
    [visitHistory]
  );

  const channelUris = useMemo(() => {
    const uris = visitHistory
      .filter((h): h is Extract<VisitHistoryEntry, { type: 'channel' }> => h.type === 'channel')
      .map(h => h.uri);
    // ATProto getFeedGenerators accepts an array; keep deterministic to stabilize query keys.
    return Array.from(new Set(uris)).sort();
  }, [visitHistory]);

  // Profiles: batch endpoint is best-practice for ATProto.
  const { data: recentProfiles = [] } = useBatchProfilesByDid(profileDids);
  const profilesByDid = useMemo(() => {
    const map = new Map<string, ProfileViewWithOrbyt>();
    for (const p of recentProfiles) {
      if (p?.did) map.set(p.did, p);
    }
    return map;
  }, [recentProfiles]);

  // Channels: batch ATProto fetch (no per-item fan-out).
  const { data: recentFeedGenerators = [] } = useQuery({
    queryKey: ['recently-visited', 'feed-generators', currentUserDid ?? null, channelUris] as const,
    queryFn: async (): Promise<GeneratorView[]> => {
      if (channelUris.length === 0) return [];
      await AtprotoCore.ensureSession();
      const { api } = await AtprotoCore.getApiClient();
      const res = await api.app.bsky.feed.getFeedGenerators({ feeds: channelUris });
      return (res.data.feeds ?? []) as GeneratorView[];
    },
    enabled: channelUris.length > 0,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  // Map into the existing CachedChannel-ish shape the UI expects.
  const channelsByUri = useMemo(() => {
    const map = new Map<string, CachedChannel>();
    for (const feed of recentFeedGenerators) {
      const uri = feed.uri;
      if (!uri) continue;
      map.set(uri, {
        uri,
        cid: feed.cid ?? '',
        did: feed.creator?.did ?? '',
        creator: feed.creator as CachedChannel['creator'],
        displayName: feed.displayName ?? '',
        description: feed.description ?? '',
        avatar: feed.avatar ?? undefined,
        likeCount: feed.likeCount ?? 0,
        subscriberCount:
          (feed as GeneratorView & { subscriberCount?: number }).subscriberCount ?? 0,
        indexedAt: feed.indexedAt ?? new Date().toISOString(),
      } as CachedChannel);
    }
    return map;
  }, [recentFeedGenerators]);

  const addVisit = useCallback(
    (type: 'profile' | 'channel', data: { did?: string; uri?: string }) => {
      const entry: VisitHistoryEntry | null =
        type === 'profile'
          ? data?.did
            ? { type: 'profile', did: data.did.trim() }
            : null
          : data?.uri
            ? { type: 'channel', uri: data.uri.trim() }
            : null;

      if (!entry) return;

      setVisitHistory(prev => {
        const next = [
          entry,
          ...prev.filter(item => {
            if (entry.type === 'profile') return item.type !== 'profile' || item.did !== entry.did;
            return item.type !== 'channel' || item.uri !== entry.uri;
          }),
        ].slice(0, MAX_HISTORY);

        writeVisitHistoryToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const getHydratedProfileForDid = useCallback(
    (did: string) => profilesByDid.get(did) ?? null,
    [profilesByDid]
  );

  return {
    visitHistory,
    addVisit,
    profilesByDid,
    channelsByUri,
    getHydratedProfileForDid,
  };
}
