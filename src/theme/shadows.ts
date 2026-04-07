import { ViewStyle } from 'react-native';
import { Colors } from './colors';

/**
 * Standardized shadow system for consistent depth across the app.
 * Each shadow is defined for both iOS and Android platforms.
 */

export const Shadows = {
  /**
   * Small elevation - subtle shadows for secondary surfaces
   * Use for: hover states, secondary UI elements
   */
  small: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  } as ViewStyle,

  /**
   * Medium elevation - standard shadow for primary surfaces
   * Use for: cards, modals, floating action buttons
   */
  medium: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  } as ViewStyle,

  /**
   * Large elevation - prominent shadow for top-level surfaces
   * Use for: sheets, dialogs, overlays
   */
  large: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  } as ViewStyle,

  /**
   * Extra large elevation - most prominent shadow
   * Use for: full-screen modals, critical overlays
   */
  xlarge: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  } as ViewStyle,
};

export type ShadowKey = keyof typeof Shadows;
