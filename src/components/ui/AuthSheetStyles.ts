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
 * Shared styles for authentication sheets (LoginSheet, SignUpSheet)
 * Maintains consistent styling across auth flows
 */
export const authSheetStyles = StyleSheet.create({
  inputContainer: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    marginBottom: 4,
    height: 56,
    overflow: 'hidden',
  },
  inputContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
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
    padding: 12,
    backgroundColor: hexToRGBA(Colors.coral[500], 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
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
