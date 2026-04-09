import { ViewStyle } from 'react-native';

/**
 * Standardized shadow system for consistent depth across the app.
 */

export const Shadows = {
  /**
   * Small elevation - subtle shadows for secondary surfaces
   * Use for: hover states, secondary UI elements
   */
  small: {
    boxShadow: '0 2px 3px rgba(0,0,0,0.15)',
  } as ViewStyle,

  /**
   * Medium elevation - standard shadow for primary surfaces
   * Use for: cards, modals, floating action buttons
   */
  medium: {
    boxShadow: '0 4px 6px rgba(0,0,0,0.20)',
  } as ViewStyle,

  /**
   * Large elevation - prominent shadow for top-level surfaces
   * Use for: sheets, dialogs, overlays
   */
  large: {
    boxShadow: '0 8px 12px rgba(0,0,0,0.25)',
  } as ViewStyle,

  /**
   * Extra large elevation - most prominent shadow
   * Use for: full-screen modals, critical overlays
   */
  xlarge: {
    boxShadow: '0 16px 20px rgba(0,0,0,0.30)',
  } as ViewStyle,
};
