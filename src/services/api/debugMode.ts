import { logger } from '../../utils/logger';

export type AtprotoDebugMode = 'live' | 'offline';
export type AtprotoOfflineWriteMockMode = 'success' | 'failure' | 'alternate';

let hasLoggedMode = false;
let hasLoggedWriteMode = false;
let alternateWriteFlip = false;

export function getAtprotoDebugMode(): AtprotoDebugMode {
  const inDev = typeof __DEV__ === 'boolean' ? __DEV__ : process.env.NODE_ENV !== 'production';

  const mode = inDev ? 'offline' : 'live';
  const writeMockMode = parseWriteMockMode(process.env.EXPO_PUBLIC_ATPROTO_OFFLINE_WRITE_MODE);

  if (!hasLoggedMode) {
    hasLoggedMode = true;
    logger.info('ATProto debug mode resolved', {
      component: 'atprotoDebugMode',
      mode,
      isDev: inDev,
      writeMockMode,
      writeModeHint:
        'Set EXPO_PUBLIC_ATPROTO_OFFLINE_WRITE_MODE=success|failure|alternate (restart Metro)',
    });
  }

  return mode;
}

export function isAtprotoOfflineModeEnabled(): boolean {
  return getAtprotoDebugMode() === 'offline';
}

export function isAtprotoIncomingApiEnabled(): boolean {
  return true;
}

export function isAtprotoOutgoingApiBlocked(): boolean {
  return isAtprotoOfflineModeEnabled();
}

function parseWriteMockMode(raw: string | undefined): AtprotoOfflineWriteMockMode {
  if (raw === 'failure' || raw === 'alternate') return raw;
  return 'success';
}

export function getAtprotoOfflineWriteMockMode(): AtprotoOfflineWriteMockMode {
  const raw = process.env.EXPO_PUBLIC_ATPROTO_OFFLINE_WRITE_MODE;
  const mode = parseWriteMockMode(raw);

  if (!hasLoggedWriteMode) {
    hasLoggedWriteMode = true;
    logger.info('ATProto offline write mock mode resolved', {
      component: 'atprotoDebugMode',
      mode,
      rawValue: raw ?? null,
      hint: 'Use EXPO_PUBLIC_ATPROTO_OFFLINE_WRITE_MODE=success|failure|alternate',
    });
  }

  return mode;
}

export function shouldFailAtprotoOfflineWriteMock(): boolean {
  if (!isAtprotoOutgoingApiBlocked()) return false;

  const mode = getAtprotoOfflineWriteMockMode();
  if (mode === 'failure') return true;
  if (mode === 'alternate') {
    alternateWriteFlip = !alternateWriteFlip;
    return alternateWriteFlip;
  }
  return false;
}
