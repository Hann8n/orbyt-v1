import type { TextStyle, ViewStyle } from 'react-native';
import { Colors, Shadows } from '@/theme';
import { BORDER_RADIUS } from '@/utils/constants';
import { hexToRGBA } from '@/utils/formatting/colors';
import { FontFamily, Typography, fontSizeFor, lineHeightFor } from '@/utils/components/typography';

export const buttonContentCenter: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
};

export const buttonContentRowBetween: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
};

export const buttonDisabledOpacity: ViewStyle = {
  opacity: 0.6,
};

export const shape = {
  pill: { borderRadius: BORDER_RADIUS.FULL, overflow: 'hidden' as const },
  rounded: { borderRadius: BORDER_RADIUS.LARGE, overflow: 'hidden' as const },
  control: { borderRadius: BORDER_RADIUS.MEDIUM, overflow: 'hidden' as const },
  compact: { borderRadius: BORDER_RADIUS.SMALL, overflow: 'hidden' as const },
};

export type ButtonVariantKey = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

export const buttonVariantContainer: Record<ButtonVariantKey, ViewStyle> = {
  primary: { backgroundColor: Colors.neutral[50] },
  secondary: { backgroundColor: hexToRGBA(Colors.neutral[300], 0.12) },
  outline: {
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.neutral[300],
  },
  ghost: { backgroundColor: Colors.transparent },
  danger: { backgroundColor: Colors.coral[950] },
  success: { backgroundColor: Colors.teal[500] },
};

export const buttonVariantLabel: Record<ButtonVariantKey, TextStyle> = {
  primary: { color: Colors.neutral[975] },
  secondary: { color: Colors.neutral[50] },
  outline: { color: Colors.neutral[200] },
  ghost: { color: Colors.neutral[50] },
  danger: { color: Colors.coral[300] },
  success: { color: Colors.neutral[50] },
};

export const buttonIconTint: Record<ButtonVariantKey, string> = {
  primary: Colors.neutral[975],
  secondary: Colors.neutral[50],
  outline: Colors.neutral[200],
  ghost: Colors.neutral[50],
  danger: Colors.coral[300],
  success: Colors.neutral[50],
};

export type ButtonSizeKey = 'small' | 'medium' | 'large';

export const buttonSizeContainer: Record<ButtonSizeKey, ViewStyle> = {
  small: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
  medium: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
  large: { paddingVertical: 16, paddingHorizontal: 24, minHeight: 52 },
};

export const buttonSizeLabel: Record<ButtonSizeKey, TextStyle> = {
  small: { fontSize: Typography.sizes.bodySmall },
  medium: { fontSize: Typography.sizes.subtitle },
  large: { fontSize: Typography.sizes.body },
};

export const buttonLabelBase: TextStyle = {
  fontFamily: FontFamily.medium,
  textAlign: 'center',
};

export const authCtaContainer: ViewStyle = {
  ...shape.pill,
  ...buttonContentRowBetween,
  backgroundColor: Colors.neutral[200],
  paddingVertical: 20,
  paddingHorizontal: 20,
  marginTop: 8,
  marginBottom: 0,
  minHeight: 64,
};

export const authCtaContainerActive: ViewStyle = {
  backgroundColor: Colors.teal[500],
};

export const authCtaLabel: TextStyle = {
  color: Colors.neutral[500],
  fontSize: Typography.sizes.title,
  lineHeight: Typography.lineHeights.title,
  fontFamily: FontFamily.semibold,
};

export const authCtaLabelActive: TextStyle = {
  color: Colors.neutral[975],
};

export const sheetFooterSecondaryContainer: ViewStyle = {
  ...shape.pill,
  ...buttonContentCenter,
  backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
  paddingVertical: 12,
  paddingHorizontal: 20,
  minHeight: 44,
  borderWidth: 0,
  borderColor: Colors.transparent,
};

export const sheetFooterSecondaryLabel: TextStyle = {
  color: Colors.neutral[50],
  fontSize: Typography.sizes.subtitle,
  textAlign: 'center',
  fontFamily: FontFamily.medium,
};

export const sheetFooterPrimaryContainer: ViewStyle = {
  ...sheetFooterSecondaryContainer,
  backgroundColor: Colors.neutral[50],
};

export const sheetFooterPrimaryLabel: TextStyle = {
  ...sheetFooterSecondaryLabel,
  color: Colors.neutral[975],
};

const modalActionContainer: ViewStyle = {
  ...shape.compact,
  ...buttonContentCenter,
  paddingVertical: 8,
  paddingHorizontal: 16,
};

export const modalActionSecondaryContainer: ViewStyle = {
  ...modalActionContainer,
  backgroundColor: Colors.overlay.white10,
};

export const modalActionPrimaryContainer: ViewStyle = {
  ...modalActionContainer,
  backgroundColor: Colors.neutral[50],
};

export const modalActionLabel: TextStyle = {
  color: Colors.neutral[50],
  fontSize: Typography.sizes.subtitle,
  fontFamily: FontFamily.medium,
};

export const modalActionPrimaryLabel: TextStyle = {
  ...modalActionLabel,
  color: Colors.neutral[975],
  fontFamily: FontFamily.bold,
};

export const toolbarNextContainer: ViewStyle = {
  ...shape.rounded,
  ...buttonContentCenter,
  backgroundColor: Colors.neutral[50],
  paddingVertical: 8,
  paddingHorizontal: 16,
  minWidth: 60,
  boxShadow: '0 2px 4px rgba(5,7,10,0.30)',
};

export const toolbarNextLabel: TextStyle = {
  color: Colors.black,
  fontSize: fontSizeFor(17),
  fontFamily: FontFamily.bold,
  fontWeight: '600',
  includeFontPadding: false,
};

const headerChromePill: ViewStyle = {
  ...shape.pill,
  ...buttonContentCenter,
  paddingVertical: 8,
  paddingHorizontal: 16,
  minHeight: 36,
  minWidth: 72,
};

export const headerCancelContainer: ViewStyle = {
  ...headerChromePill,
  backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
};

/** Shared typography for edit-modal style header pills (Cancel / Save); only color differs per side. */
const headerChromeLabelBase: TextStyle = {
  fontSize: fontSizeFor(17),
  lineHeight: lineHeightFor(fontSizeFor(17)),
  fontFamily: FontFamily.semibold,
  textAlign: 'center',
  includeFontPadding: false,
};

/**
 * Inner slot for header chrome pills so text and icon rows share the same vertical metrics.
 * Without this, a short icon (e.g. check) yields a shorter inner layout and the squircle can clip the pill.
 */
export const headerChromePillInnerSlot: ViewStyle = {
  minHeight: lineHeightFor(fontSizeFor(17)),
  justifyContent: 'center',
  alignItems: 'center',
};

export const headerCancelLabel: TextStyle = {
  ...headerChromeLabelBase,
  color: Colors.neutral[50],
};

export const headerSaveContainer: ViewStyle = {
  ...headerChromePill,
  backgroundColor: Colors.neutral[50],
  minWidth: 60,
};

export const headerSaveLabel: TextStyle = {
  ...headerChromeLabelBase,
  color: Colors.neutral[975],
};

export const headerSaveLabelMuted: TextStyle = {
  color: hexToRGBA(Colors.neutral[975], 0.25),
};

/** Edit profile avatar upload chip; background from caller (`blendColors`). */
export const editProfileUploadButtonContainer: ViewStyle = {
  ...shape.rounded,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 20,
  paddingVertical: 10,
  minWidth: 80,
};

/** Pairs with `editProfileUploadButtonContainer`; set `color` from profile text color. */
export const editProfileUploadButtonLabel: TextStyle = {
  fontFamily: FontFamily.bold,
  fontSize: Typography.sizes.body,
  textAlign: 'center',
  includeFontPadding: false,
};

export const retryPillContainer: ViewStyle = {
  ...shape.pill,
  ...buttonContentCenter,
  paddingVertical: 12,
  paddingHorizontal: 24,
  marginTop: 20,
  minHeight: 44,
  ...Shadows.large,
};

export const retryPillLabel: TextStyle = {
  color: Colors.neutral[975],
  fontSize: Typography.sizes.subtitle,
  fontFamily: FontFamily.semibold,
};

export const retryGlassBackgroundRadius: ViewStyle = {
  borderRadius: BORDER_RADIUS.FULL,
};

export const settingsPrimaryRowContainer: ViewStyle = {
  ...shape.rounded,
  backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
  paddingVertical: 20,
  paddingHorizontal: 20,
  marginBottom: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  overflow: 'hidden',
};

export const settingsMenuOptionRowContainer: ViewStyle = {
  ...shape.rounded,
  backgroundColor: Colors.neutral[900],
  paddingVertical: 20,
  paddingHorizontal: 20,
  marginHorizontal: 16,
  marginBottom: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  overflow: 'hidden',
  borderWidth: 0,
  borderColor: Colors.transparent,
};

export const settingsCompactActionContainer: ViewStyle = {
  borderWidth: 0,
  borderColor: Colors.transparent,
  paddingVertical: 8,
  paddingHorizontal: 16,
  ...shape.pill,
  minWidth: 80,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
  shadowColor: Colors.neutral[975],
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
  elevation: 2,
};

export const settingsIconSquareContainer: ViewStyle = {
  width: 40,
  height: 40,
  ...shape.rounded,
  backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
  alignItems: 'center',
  justifyContent: 'center',
};

export const settingsEditChipContainer: ViewStyle = {
  paddingHorizontal: 16,
  paddingVertical: 8,
  ...shape.control,
  backgroundColor: Colors.neutral[925],
};

export const settingsFilterChipContainer: ViewStyle = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  marginRight: 8,
  ...shape.control,
  backgroundColor: Colors.neutral[925],
};

export const settingsCategoryChipContainer: ViewStyle = {
  paddingHorizontal: 18,
  paddingVertical: 10,
  marginRight: 8,
  ...shape.rounded,
  backgroundColor: Colors.neutral[925],
};

export const settingsLogoutPillContainer: ViewStyle = {
  ...shape.pill,
  ...buttonContentCenter,
  backgroundColor: Colors.neutral[925],
  paddingVertical: 12,
  paddingHorizontal: 20,
  minHeight: 44,
  overflow: 'hidden',
};

export const settingsToggleGroupContainer: ViewStyle = {
  flexDirection: 'row',
  backgroundColor: Colors.neutral[925],
  ...shape.control,
  flexShrink: 0,
  width: 180,
  overflow: 'hidden',
};

export const settingsToggleItemContainer: ViewStyle = {
  flex: 1,
  paddingHorizontal: 14,
  paddingVertical: 12,
  alignItems: 'center',
  justifyContent: 'center',
};
