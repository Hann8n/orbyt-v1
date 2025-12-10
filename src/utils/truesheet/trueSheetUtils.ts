import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { presentSheet, dismissSheet } from '../bottomSheetRegistry';

/**
 * Safely dismiss a TrueSheet by name, swallowing any error from the native layer.
 * Useful to avoid unhandled promise rejections when a sheet isn't mounted.
 */
export const safeDismiss = async (name?: string) => {
  if (!name) return;
  try {
    // Try the legacy TrueSheet API first
    await TrueSheet.dismiss(name);
    return;
  } catch (e) {
    // ignore and fallback to registry
  }

  try {
    // Try the gorhom-based registry dismissal
    dismissSheet(name);
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
    // Try the legacy TrueSheet API first
    await TrueSheet.present(name);
    return;
  } catch (e) {
    // ignore and fallback to registry
  }

  try {
    // Try the gorhom-based registry present
    presentSheet(name);
  } catch (e) {
    // ignore - best effort present
  }
};

export default {
  safeDismiss,
  safePresent,
};
