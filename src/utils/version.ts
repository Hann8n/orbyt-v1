import * as Application from 'expo-application';
import { ApplicationReleaseType } from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Get the native app version (store-facing).
 *
 * In development, prefer `expo-constants` so the UI matches `app.json` without
 * rebuilding the dev client when only the marketing version changes.
 *
 * In release builds, prefer the installed binary (`expo-application`) — that is
 * what the store and OS report.
 */
export function getBuildVersion(): string {
  const fromConfig = Constants.expoConfig?.version;
  if (__DEV__ && fromConfig) {
    return fromConfig;
  }
  return Application.nativeApplicationVersion ?? fromConfig ?? '0.0.0';
}

/**
 * Get the native build number/version code for the installed binary.
 */
export function getBuildNumber(): string {
  const fromBinary = Application.nativeBuildVersion;
  const fromConfig =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Platform.OS === 'android'
        ? Constants.expoConfig?.android?.versionCode?.toString()
        : undefined;

  if (__DEV__ && fromConfig) {
    return fromConfig;
  }
  if (fromBinary) return fromBinary;

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

/**
 * Format iOS ApplicationReleaseType enum value to human-readable string.
 * Uses the enum's reverse mapping (e.g. 5 -> 'APP_STORE').
 */
export function formatIosReleaseType(releaseType: ApplicationReleaseType | null): string {
  if (releaseType == null) return 'N/A';
  return ApplicationReleaseType[releaseType] ?? String(releaseType);
}

/**
 * Get platform-specific app info lines (Android ID, iOS release type, etc.).
 * Shared by device info in Settings and ErrorBoundary.
 */
export async function getPlatformAppInfoLines(): Promise<string[]> {
  const lines: string[] = [];
  if (Platform.OS === 'android') {
    const androidId = (() => {
      try {
        return Application.getAndroidId();
      } catch {
        return null;
      }
    })();
    lines.push(`Android ID: ${androidId ?? 'N/A'}`);

    const installReferrer = await Application.getInstallReferrerAsync().catch(() => null);
    lines.push(`Install Referrer: ${installReferrer ?? 'N/A'}`);

    const lastUpdateTime = await Application.getLastUpdateTimeAsync().catch(() => null);
    lines.push(`Last Update Time: ${lastUpdateTime ? lastUpdateTime.toISOString() : 'N/A'}`);
  }
  if (Platform.OS === 'ios') {
    const idForVendor = await Application.getIosIdForVendorAsync().catch(() => null);
    lines.push(`ID for Vendor: ${idForVendor ?? 'N/A'}`);

    const releaseType = await Application.getIosApplicationReleaseTypeAsync().catch(() => null);
    lines.push(`iOS Release Type: ${formatIosReleaseType(releaseType)}`);

    const apnsEnv = await Application.getIosPushNotificationServiceEnvironmentAsync().catch(
      () => null
    );
    lines.push(`APNs Environment: ${apnsEnv ?? 'N/A'}`);
  }
  return lines;
}

/**
 * Get full device/app info string for support emails and error reports.
 */
export async function getDeviceInfo(): Promise<string> {
  const platform =
    Platform.OS === 'ios'
      ? 'iOS'
      : Platform.OS === 'android'
        ? 'Android'
        : Platform.OS === 'web'
          ? 'Web'
          : Platform.OS;
  const appType = `orbyt for ${platform}`;
  const osVersion = Device.osVersion || 'Unknown';
  const modelName = Device.modelName || 'Unknown';
  const appVersion = getBuildVersion();
  const buildNumber = getBuildNumber();
  const environment = __DEV__ ? 'Debug' : 'Release';
  const applicationId = Application.applicationId ?? 'N/A';
  const applicationName = Application.applicationName ?? 'N/A';

  const installationTime = await Application.getInstallationTimeAsync().catch(() => null);
  const installationTimeText = installationTime ? installationTime.toISOString() : 'N/A';

  const platformAppInfo = await getPlatformAppInfoLines();

  return [
    appType,
    `Platform: ${platform}`,
    `OS Version: ${osVersion}`,
    `Device Model: ${modelName}`,
    '',
    `App Version: ${appVersion}`,
    `Build Number: ${buildNumber}`,
    `Environment: ${environment}`,
    '',
    `Application ID: ${applicationId}`,
    `Application Name: ${applicationName}`,
    '',
    `Installation Time: ${installationTimeText}`,
    ...(platformAppInfo.length ? ['', ...platformAppInfo] : []),
  ].join('\n');
}
