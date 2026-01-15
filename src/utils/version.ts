import Constants from 'expo-constants';

/**
 * Get the build version from app.json
 */
export function getBuildVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Get the update version from app.json extra section
 */
export function getUpdateVersion(): string | undefined {
  return Constants.expoConfig?.extra?.updateVersion as string | undefined;
}

/**
 * Format the display version as "buildVersion (updateVersion)"
 * Falls back to just buildVersion if updateVersion is not available
 */
export function getFormattedVersion(): string {
  const buildVersion = getBuildVersion();
  const updateVersion = getUpdateVersion();

  if (updateVersion) {
    return `${buildVersion} (${updateVersion})`;
  }

  return buildVersion;
}

/**
 * Get full version information for debugging
 */
export function getVersionInfo(): {
  buildVersion: string;
  updateVersion: string | undefined;
  formattedVersion: string;
  runtimeVersion: string | undefined;
} {
  const buildVersion = getBuildVersion();
  const updateVersion = getUpdateVersion();
  const formattedVersion = getFormattedVersion();
  const runtimeVersion = Constants.expoConfig?.runtimeVersion as string | undefined;

  return {
    buildVersion,
    updateVersion,
    formattedVersion,
    runtimeVersion,
  };
}
