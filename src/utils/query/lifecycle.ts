import { focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

let teardown: (() => void) | null = null;

const setFocusedFromAppState = (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
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
