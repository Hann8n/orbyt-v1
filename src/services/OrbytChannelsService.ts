import { queryOptions, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/utils/query/queryKeys';
import { queryClient } from '@/utils/query/queryClient';
import {
  getCurrentLocaleTag,
  resolveLocalizedText,
  type TranslationMap,
} from '@/i18n/resolveLocalizedText';
import { fetchJson } from '@/services/api/fetchJson';

export interface RemoteOrbytChannel {
  id: string;
  slug: string;
  uri: string;
  displayName: string;
  displayNameTranslations?: TranslationMap;
  description: string | null;
  descriptionTranslations?: TranslationMap;
  channelColor: string | null;
  mediaUrl: string;
  showSlash: boolean;
  isPostable: boolean;
  active: boolean;
  sortWeight: number;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string;
}

interface ChannelsResponse {
  channels: RemoteOrbytChannel[];
}

const REMOTE_URL = 'https://api.getorbyt.com/v1/channels/active';
const FALLBACK_COLOR = '#FF93CB';

function normalizeChannel(raw: RemoteOrbytChannel): RemoteOrbytChannel {
  return {
    ...raw,
    displayName:
      resolveLocalizedText(raw.displayName, raw.displayNameTranslations) || raw.displayName,
    description: resolveLocalizedText(raw.description, raw.descriptionTranslations),
    channelColor: raw.channelColor || FALLBACK_COLOR,
  };
}

async function fetchChannels(signal?: globalThis.AbortSignal): Promise<RemoteOrbytChannel[]> {
  const payload = await fetchJson<ChannelsResponse>(REMOTE_URL, { signal, timeoutMs: 10000 });
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  return channels.map(normalizeChannel);
}

export function getChannelsQueryOptions(locale: string) {
  return queryOptions({
    queryKey: queryKeys.channels.metadata(locale),
    queryFn: ({ signal }) => fetchChannels(signal),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });
}

function readCachedChannels(locale?: string): RemoteOrbytChannel[] {
  const activeLocale = locale ?? getCurrentLocaleTag();
  return (
    queryClient.getQueryData<RemoteOrbytChannel[]>(queryKeys.channels.metadata(activeLocale)) ?? []
  );
}

export async function hydrateOrbytChannels(): Promise<RemoteOrbytChannel[]> {
  const locale = getCurrentLocaleTag();
  return queryClient.fetchQuery(getChannelsQueryOptions(locale));
}

export function getAllRemoteChannels(): RemoteOrbytChannel[] {
  return [...readCachedChannels()];
}

export function getActiveRemoteChannels(): RemoteOrbytChannel[] {
  return readCachedChannels().filter(channel => channel.active !== false);
}

export function getRemoteChannelByUri(uri: string): RemoteOrbytChannel | undefined {
  return readCachedChannels().find(channel => channel.uri === uri);
}

export function getRemoteChannelBySlug(slug: string): RemoteOrbytChannel | undefined {
  return readCachedChannels().find(channel => channel.slug === slug);
}

export function isKnownOrbytChannelUri(uri: string): boolean {
  return readCachedChannels().some(channel => channel.uri === uri);
}

export function useOrbytChannels() {
  const locale = getCurrentLocaleTag();
  return useQuery(getChannelsQueryOptions(locale));
}
