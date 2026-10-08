/**
 * Profile color swatches, served by the Orbyt AppView
 * (`com.getorbyt.actor.getColorPalette`) — the same ordered pairs and stable
 * ids native Orbyt and Byte offer, so a swatch picked in any client is the
 * same swatch everywhere.
 */
import { queryOptions, useQuery } from '@tanstack/react-query';

import { QUERY_CONSTANTS } from '@/utils/constants';
import { queryKeys } from '@/utils/query/queryKeys';
import { orbytPublicQuery } from '@/services/orbyt/orbytApi';

/** `com.getorbyt.actor.getColorPalette#color`: unprefixed uppercase hex. */
interface PaletteColor {
  id: number;
  foreground: string;
  background: string;
}

export interface ProfileColorSwatch {
  id: number;
  /** `#RRGGBB` */
  backgroundColor: string;
  /** `#RRGGBB` */
  textColor: string;
}

/**
 * `#RRGGBB` in uppercase — the form Byte writes into `com.getorbyt.profile`,
 * so records from either client compare equal. Returns null when unparseable.
 */
export function normalizeProfileHex(value: string | null | undefined): string | null {
  const hex = (value ?? '').trim().replace(/^#/, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : null;
}

async function fetchProfileColorPalette(
  signal?: globalThis.AbortSignal
): Promise<ProfileColorSwatch[]> {
  const { colors } = await orbytPublicQuery<{ colors?: PaletteColor[] }>(
    'com.getorbyt.actor.getColorPalette',
    undefined,
    { signal }
  );
  return (colors ?? []).flatMap(color => {
    const backgroundColor = normalizeProfileHex(color.background);
    const textColor = normalizeProfileHex(color.foreground);
    return backgroundColor && textColor ? [{ id: color.id, backgroundColor, textColor }] : [];
  });
}

const profileColorPaletteQueryOptions = queryOptions({
  queryKey: queryKeys.orbytProfile.colorPalette(),
  queryFn: ({ signal }) => fetchProfileColorPalette(signal),
  staleTime: QUERY_CONSTANTS.STALE_TIME_VERY_LONG,
  gcTime: 24 * 60 * 60 * 1000,
});

export function useProfileColorPalette() {
  return useQuery(profileColorPaletteQueryOptions);
}

/** Find `colors` in the palette, as stored or with foreground/background swapped. */
export function findPaletteMatch(
  palette: readonly ProfileColorSwatch[],
  colors: { backgroundColor: string; textColor: string }
): { index: number; inverted: boolean } | null {
  const background = normalizeProfileHex(colors.backgroundColor);
  const text = normalizeProfileHex(colors.textColor);
  if (!background || !text) return null;
  const direct = palette.findIndex(
    swatch => swatch.backgroundColor === background && swatch.textColor === text
  );
  if (direct >= 0) return { index: direct, inverted: false };
  const inverted = palette.findIndex(
    swatch => swatch.backgroundColor === text && swatch.textColor === background
  );
  return inverted >= 0 ? { index: inverted, inverted: true } : null;
}
