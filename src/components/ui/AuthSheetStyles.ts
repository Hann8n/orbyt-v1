import { StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';
import { FontFamily, Typography } from '../../utils/components/typography';
import { hexToRGBA } from '../../utils/formatting/colors';
import { inputTextDefaults } from '../../utils/styling/platformText';
import {
  authCtaContainer,
  authCtaContainerActive,
  authCtaLabel,
  authCtaLabelActive,
  buttonContentCenter,
  buttonContentRowBetween,
} from './buttonPresets';

/**
 * Inner padding at the start of the auth handle row (@ / avatar). Smaller than the end so the
 * leading mark isn’t pushed too far in.
 */
export const AUTH_INPUT_CONTENT_PADDING_START = 12;
/** Inner padding at the end of the auth handle row (text field). */
const AUTH_INPUT_CONTENT_PADDING_END = 20;

/** Handle/PDS row height. */
const AUTH_INPUT_ROW_HEIGHT = 56;

/**
 * Shared styles for authentication modals (login-sign-in, login-sign-up routes)
 * Maintains consistent styling across auth flows
 */
export const authSheetStyles = StyleSheet.create({
  inputContainer: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginBottom: 4,
    height: AUTH_INPUT_ROW_HEIGHT,
    overflow: 'hidden',
  },
  inputContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: AUTH_INPUT_CONTENT_PADDING_START,
    paddingRight: AUTH_INPUT_CONTENT_PADDING_END,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: Typography.sizes.h3,
    lineHeight: Typography.lineHeights.h3,
    height: '100%',
    fontFamily: FontFamily.medium,
    letterSpacing: 0.25,
    ...inputTextDefaults,
  },
  button: authCtaContainer,
  buttonActive: authCtaContainerActive,
  buttonText: authCtaLabel,
  buttonTextActive: authCtaLabelActive,
  buttonContent: buttonContentCenter,
  buttonContentRow: buttonContentRowBetween,
  loadingIcon: {
    marginRight: 8,
  },
  errorContainer: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: hexToRGBA(Colors.coral[500], 0.1),
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
  },
  errorText: {
    color: Colors.coral[500],
    fontSize: Typography.sizes.bodySmall,
    lineHeight: Typography.lineHeights.bodySmall,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  footerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 24,
  },
  footerText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.body,
  },
  footerLink: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.semibold,
    textDecorationLine: 'underline',
    lineHeight: Typography.lineHeights.body,
  },
});
