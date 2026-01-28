import Constants from 'expo-constants';

/**
 * Get the build version from app.json
 */
export function getBuildVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
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
