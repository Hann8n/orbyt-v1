/**
 * Consolidated Global Modal Hooks
 * Now uses Zustand store for better performance
 * These hooks provide compatibility layer for existing code
 */

import {
  useAccountSwitcher,
  useCommentSection as useCommentSectionStore,
  useShareSheet as useShareSheetStore,
} from '../stores/modalStore';

// ============================================================================
// HOOKS - Now proxying to Zustand store
// ============================================================================

export const useGlobalAccountSwitcher = useAccountSwitcher;
export const useGlobalCommentSection = useCommentSectionStore;
export const useGlobalShareSheet = useShareSheetStore;
