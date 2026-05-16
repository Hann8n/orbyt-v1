import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

let teardown: (() => void) | null = null;

const setFocusedFromAppState = (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
};

const syncOnlineState = async () => {
  const state = await Network.getNetworkStateAsync();
  onlineManager.setOnline(state.isInternetReachable ?? true);
};

export function setupReactQueryLifecycleBridge(): () => void {
  if (teardown) return teardown;

  setFocusedFromAppState(AppState.currentState);
  const appStateSub = AppState.addEventListener('change', (status) => {
    setFocusedFromAppState(status);
    if (status === 'active') {
      void syncOnlineState();
    }
  });

  // Set initial online state and let onlineManager handle pausing offline queries
  void syncOnlineState();

  teardown = () => {
    appStateSub.remove();
    teardown = null;
  };

  return teardown;
}
