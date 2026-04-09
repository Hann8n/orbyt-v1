import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/utils/query/queryKeys';
import {
  getCurrentLocaleTag,
  resolveLocalizedText,
  type TranslationMap,
} from '@/i18n/resolveLocalizedText';

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

let channelsCache: RemoteOrbytChannel[] = [];
let channelsByUri = new Map<string, RemoteOrbytChannel>();
let channelsBySlug = new Map<string, RemoteOrbytChannel>();

function normalizeChannel(raw: RemoteOrbytChannel): RemoteOrbytChannel {
  return {
    ...raw,
    displayName:
      resolveLocalizedText(raw.displayName, raw.displayNameTranslations) || raw.displayName,
    description: resolveLocalizedText(raw.description, raw.descriptionTranslations),
    channelColor: raw.channelColor || FALLBACK_COLOR,
  };
}

function setChannelsCache(channels: RemoteOrbytChannel[]): void {
  channelsCache = channels.map(normalizeChannel);
  channelsByUri = new Map(channelsCache.map(channel => [channel.uri, channel]));
  channelsBySlug = new Map(channelsCache.map(channel => [channel.slug, channel]));
}

async function fetchChannels(): Promise<RemoteOrbytChannel[]> {
  const response = await fetch(REMOTE_URL);
  if (!response.ok) {
    throw new Error(`Channel config request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as ChannelsResponse;
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  setChannelsCache(channels);
  return channelsCache;
}

export async function hydrateOrbytChannels(): Promise<RemoteOrbytChannel[]> {
  return fetchChannels();
}

export function getAllRemoteChannels(): RemoteOrbytChannel[] {
  return [...channelsCache];
}

export function getActiveRemoteChannels(): RemoteOrbytChannel[] {
  return channelsCache.filter(channel => channel.active !== false);
}

export function getRemoteChannelByUri(uri: string): RemoteOrbytChannel | undefined {
  return channelsByUri.get(uri);
}

export function getRemoteChannelBySlug(slug: string): RemoteOrbytChannel | undefined {
  return channelsBySlug.get(slug);
}

export function isKnownOrbytChannelUri(uri: string): boolean {
  return channelsByUri.has(uri);
}

export function useOrbytChannels() {
  const locale = getCurrentLocaleTag();
  return useQuery({
    queryKey: queryKeys.channels.metadata(locale),
    queryFn: hydrateOrbytChannels,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
  });
}
