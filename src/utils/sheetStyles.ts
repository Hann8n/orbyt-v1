import { StyleSheet } from 'react-native';
import { Colors } from '../../components/ui/UI';
import { BORDER_RADIUS } from './constants';
import { hexToRGBA } from './formatting/colorUtils';

/**
 * Shared styles for bottom sheet components
 * Used by various info sheets and modal components
 */
export const sheetStyles = StyleSheet.create({
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  cancelButton: {
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});
