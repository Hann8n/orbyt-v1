import { TrueSheet } from '@lodev09/react-native-true-sheet';

/**
 * Safely dismiss a TrueSheet by name, swallowing any error from the native layer.
 * Useful to avoid unhandled promise rejections when a sheet isn't mounted.
 */
export const safeDismiss = async (name?: string) => {
  if (!name) return;
  try {
    await TrueSheet.dismiss(name);
  } catch (e) {
    // ignore - best effort dismissal
  }
};

/**
 * Safely present a TrueSheet by name, swallowing any error from the native layer.
 */
export const safePresent = async (name?: string) => {
  if (!name) return;
  try {
    await TrueSheet.present(name);
  } catch (e) {
    // ignore - best effort present
  }
};

export default {
  safeDismiss,
  safePresent,
};
