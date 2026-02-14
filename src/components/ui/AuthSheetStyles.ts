import { StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';

/**
 * Shared styles for authentication sheets (LoginSheet, SignUpSheet)
 * Maintains consistent styling across auth flows
 */
export const authSheetStyles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    marginBottom: 4,
    paddingHorizontal: 20,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: 20,
    height: '100%',
    fontFamily: 'Figtree-Medium',
    letterSpacing: 0.25,
  },
  button: {
    backgroundColor: Colors.neutral[200],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    minHeight: 64,
  },
  buttonActive: {
    backgroundColor: Colors.teal[500],
  },
  buttonText: {
    color: Colors.neutral[500],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  buttonTextActive: {
    color: Colors.neutral[900],
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  loadingIcon: {
    marginRight: 8,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.coral[500] + '1A', // 10% opacity
    borderRadius: BORDER_RADIUS.SMALL,
  },
  errorText: {
    color: Colors.coral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
  },
  footerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  footerText: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
  },
  footerLink: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
    textDecorationLine: 'underline',
    lineHeight: 20,
  },
});
