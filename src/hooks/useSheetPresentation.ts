import { useEffect, useRef } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { registerSheet, unregisterSheet } from '../utils/navigation';

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
  const hasMountedRef = useRef(false);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      wasVisibleRef.current = visible;
      if (visible) {
        TrueSheet.present(name).catch(() => {});
      } else {
        // Ensure native sheet is closed on first mount/reload when JS state says hidden.
        TrueSheet.dismiss(name).catch(() => {});
      }
      return;
    }

    if (visible && !wasVisibleRef.current) {
      TrueSheet.present(name).catch(() => {});
    } else if (!visible && wasVisibleRef.current) {
      TrueSheet.dismiss(name).catch(() => {});
    }

    wasVisibleRef.current = visible;
  }, [visible, name]);

  useEffect(
    () => () => {
      // Defensive cleanup: if a sheet component unmounts while visible, force native dismissal.
      TrueSheet.dismiss(name).catch(() => {});
    },
    [name]
  );

  useEffect(() => {
    registerSheet(name, {
      present: () => {
        TrueSheet.present(name).catch(() => {});
      },
      dismiss: () => {
        TrueSheet.dismiss(name).catch(() => {});
      },
    });

    return () => {
      unregisterSheet(name);
    };
  }, [name]);
}
