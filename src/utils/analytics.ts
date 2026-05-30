import {
  getAnalytics,
  logEvent as _logEvent,
  logShare as _logShare,
  logLogin as _logLogin,
  logSignUp as _logSignUp,
  logSelectContent as _logSelectContent,
  setUserId as _setUserId,
} from '@react-native-firebase/analytics';

function tryGetAnalytics() {
  try {
    return getAnalytics();
  } catch {
    return null;
  }
}

type LogEventParams = Parameters<typeof _logEvent>[2];
type LogShareParams = Parameters<typeof _logShare>[1];
type LogLoginParams = Parameters<typeof _logLogin>[1];
type LogSignUpParams = Parameters<typeof _logSignUp>[1];
type LogSelectContentParams = Parameters<typeof _logSelectContent>[1];

export function logEvent(eventName: string, params?: LogEventParams): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _logEvent(a, eventName, params).catch(() => {});
}

export function logShare(params: LogShareParams): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _logShare(a, params).catch(() => {});
}

export function logLogin(params: LogLoginParams): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _logLogin(a, params).catch(() => {});
}

export function logSignUp(params: LogSignUpParams): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _logSignUp(a, params).catch(() => {});
}

export function logSelectContent(params: LogSelectContentParams): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _logSelectContent(a, params).catch(() => {});
}

export function setUserId(userId: string | null): Promise<void> {
  const a = tryGetAnalytics();
  if (!a) return Promise.resolve();
  return _setUserId(a, userId).catch(() => {});
}
