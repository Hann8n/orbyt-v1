import { useEffect } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

/**
 * Custom hook to handle TrueSheet presentation based on visibility state.
 * Centralizes the logic for presenting sheets when visible prop changes.
 *
 * @param visible - Whether the sheet should be visible
 * @param name - Unique name of the sheet to present
 *
 * @example
 * ```tsx
 * const MySheet = ({ visible, onDismiss, name = 'my-sheet' }) => {
 *   useSheetPresentation(visible, name);
 *   // ... rest of component
 * }
 * ```
 */
export function useSheetPresentation(visible: boolean, name: string): void {
  useEffect(() => {
    if (visible) {
      TrueSheet.present(name);
    }
  }, [visible, name]);
}
