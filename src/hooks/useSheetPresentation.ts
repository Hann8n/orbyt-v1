import { useEffect, useRef } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { voidTrueSheet } from '../utils/components/truesheet';
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
        voidTrueSheet('present', name, TrueSheet.present(name));
      }
      // When hidden on first mount, do not call dismiss — the native TrueSheet may not
      // exist yet (avoids "Could not find TrueSheet instance" warnings).
      return;
    }

    if (visible && !wasVisibleRef.current) {
      voidTrueSheet('present', name, TrueSheet.present(name));
    } else if (!visible && wasVisibleRef.current) {
      voidTrueSheet('dismiss', name, TrueSheet.dismiss(name));
    }

    wasVisibleRef.current = visible;
  }, [visible, name]);

  useEffect(
    () => () => {
      // Only dismiss if we ever presented — avoids spurious warnings when hidden sheets unmount.
      if (wasVisibleRef.current) {
        voidTrueSheet('dismiss', name, TrueSheet.dismiss(name));
      }
    },
    [name]
  );

  useEffect(() => {
    registerSheet(name, {
      present: () => {
        voidTrueSheet('present', name, TrueSheet.present(name));
      },
      dismiss: () => {
        voidTrueSheet('dismiss', name, TrueSheet.dismiss(name));
      },
    });

    return () => {
      unregisterSheet(name);
    };
  }, [name]);
}
