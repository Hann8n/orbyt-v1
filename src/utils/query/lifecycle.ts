import { focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

let teardown: (() => void) | null = null;

const setFocusedFromAppState = (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
  warmupOnActive(status);
};

/** Warm orbyt-mix when app comes to foreground (user may load your-mix next). */
const warmupOnActive = (status: AppStateStatus) => {
  if (status !== 'active') return;
  try {
    const { useAppStore } = require('../../stores/appStore');
    const { useUserStore } = require('../../stores/userStore');
    const lastHomeFeed = useAppStore.getState().lastHomeFeed;
    const serverYourMixEnabled = useUserStore.getState().serverYourMixEnabled;
    if (serverYourMixEnabled && (lastHomeFeed === 'your-mix' || lastHomeFeed === 'following')) {
      const { warmupOrbytMix } = require('../../services/OrbytMixWarmupService');
      warmupOrbytMix();
    }
  } catch {
    // Store not ready or warmup failed — no-op
  }
};

export function setupReactQueryLifecycleBridge(): () => void {
  if (teardown) return teardown;

  setFocusedFromAppState(AppState.currentState);
  const subscription = AppState.addEventListener('change', setFocusedFromAppState);

  teardown = () => {
    subscription.remove();
    teardown = null;
  };

  return teardown;
}
