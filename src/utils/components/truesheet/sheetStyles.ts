import { StyleSheet } from 'react-native';
import { Colors } from '../../../components/ui/UI';

/**
 * Shared styles for TrueSheet header and footer components.
 * Use these for consistency across all bottom sheets in the app.
 */
export const sheetStyles = StyleSheet.create({
  /**
   * Standard header container for TrueSheet header prop.
   * TrueSheet adds native spacing at top, so we use minimal top padding.
   */
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 15,
    paddingBottom: 20,
    paddingLeft: 20,
    paddingRight: 12,
  },

  /**
   * Header left section for icon + title combo
   */
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  /**
   * Standard header title text style
   */
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
    flex: 1,
  },

  /**
   * Header title with left margin (for when there's an icon)
   */
  headerTitleWithIcon: {
    marginLeft: 4,
  },

  /**
   * Spacer element to replace close button when hidden
   */
  closeButtonSpacer: {
    width: 30,
    height: 30,
  },

  /**
   * Standard footer container for TrueSheet footer prop.
   * Apply paddingBottom from useSafeAreaInsets() inline.
   */
  footerContainer: {
    backgroundColor: 'transparent',
  },

  /**
   * Container for cancel/close button in footer.
   * Standard padding for consistent spacing.
   */
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 12,
  },

  /**
   * Main content area padding
   */
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  /**
   * Description text container (below header)
   */
  descriptionContainer: {
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 15,
  },

  /**
   * Description text style
   */
  descriptionText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },

  /**
   * Info container for explanatory text
   */
  infoContainer: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },

  /**
   * Info text style
   */
  infoText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: 'Figtree-Regular',
  },

  /**
   * Highlighted text within info sections
   */
  highlightedText: {
    color: Colors.white,
    fontFamily: 'Figtree-Medium',
  },

  /**
   * Error container for error states
   */
  errorContainer: {
    padding: 30,
    alignItems: 'center',
  },

  /**
   * Error text style
   */
  errorText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
});

/**
 * Default TrueSheet props for consistency.
 * Spread these into your TrueSheet component.
 */
export const defaultSheetProps = {
  backgroundColor: Colors.black,
  grabber: false,
} as const;

/**
 * Calculate footer height for content padding.
 * This accounts for the cancel button and its padding.
 */
export const FOOTER_HEIGHT = {
  /** Standard footer with cancel button (paddingTop 12 + button height 44) */
  standard: 56,
  /** Footer without cancel button */
  none: 0,
} as const;
