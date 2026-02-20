import { Platform } from 'react-native';

export const PROFILE_FONT_PREFERENCES = ['default', 'serif', 'monospace'] as const;

export type ProfileFontPreference = (typeof PROFILE_FONT_PREFERENCES)[number];

export interface ProfileFontOption {
  key: ProfileFontPreference;
  label: string;
  preview: string;
}

export interface HeaderFontSet {
  title: string;
  subtitle: string;
  subtitleSecondaryRegular: string;
  subtitleSecondaryBold: string;
  description: string;
  actionRegular: string;
  actionBold: string;
}

export const PROFILE_FONT_OPTIONS: ProfileFontOption[] = [
  { key: 'default', label: 'Default', preview: 'Figtree' },
  { key: 'serif', label: 'Serif', preview: 'Serif' },
  { key: 'monospace', label: 'Mono', preview: 'Monospace' },
];

export function sanitizeProfileFontPreference(value: unknown): ProfileFontPreference | null {
  if (typeof value !== 'string') return null;
  if (PROFILE_FONT_PREFERENCES.includes(value as ProfileFontPreference)) {
    return value as ProfileFontPreference;
  }
  return null;
}

export function getHeaderFontSet(
  preference: ProfileFontPreference | null | undefined
): HeaderFontSet {
  const sanitized = sanitizeProfileFontPreference(preference) ?? 'default';

  if (sanitized === 'serif') {
    const regular = Platform.select({ ios: 'Georgia', default: 'serif' }) ?? 'serif';
    const bold = Platform.select({ ios: 'Georgia-Bold', default: 'serif' }) ?? 'serif';
    return {
      title: bold,
      subtitle: regular,
      subtitleSecondaryRegular: regular,
      subtitleSecondaryBold: bold,
      description: regular,
      actionRegular: regular,
      actionBold: bold,
    };
  }

  if (sanitized === 'monospace') {
    const mono = Platform.select({ ios: 'Menlo', default: 'monospace' }) ?? 'monospace';
    const monoBold = Platform.select({ ios: 'Menlo-Bold', default: 'monospace' }) ?? 'monospace';
    return {
      title: monoBold,
      subtitle: mono,
      subtitleSecondaryRegular: mono,
      subtitleSecondaryBold: monoBold,
      description: mono,
      actionRegular: mono,
      actionBold: monoBold,
    };
  }

  return {
    title: 'Figtree-Black',
    subtitle: 'Figtree-Medium',
    subtitleSecondaryRegular: 'Figtree-Medium',
    subtitleSecondaryBold: 'Figtree-Bold',
    description: 'Figtree-Medium',
    actionRegular: 'Figtree-SemiBold',
    actionBold: 'Figtree-Bold',
  };
}
