import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Get the native app version (store-facing).
 *
 * Prefer reading from the actual installed binary via `expo-application`,
 * then fall back to config when not available (e.g. web).
 */
export function getBuildVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.1.1';
}

/**
 * Get the native build number/version code for the installed binary.
 */
export function getBuildNumber(): string {
  const fromBinary = Application.nativeBuildVersion;
  if (fromBinary) return fromBinary;

  const fromConfig =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode?.toString()
        : undefined;

  return fromConfig ?? 'N/A';
}

/**
 * Format the display version for UI.
 */
export function getFormattedVersion(): string {
  return getBuildVersion();
}

/**
 * Get full version information for debugging
 */
export function getVersionInfo(): {
  buildVersion: string;
  formattedVersion: string;
} {
  const buildVersion = getBuildVersion();
  const formattedVersion = getFormattedVersion();

  return {
    buildVersion,
    formattedVersion,
  };
}
