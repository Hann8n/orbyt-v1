import { getVideoCardHeight } from '../../../utils/video/helpers';
import { isIosLiquidGlassAvailable } from '../../../stores/userStore';
import { FEED_VIEW_CONSTANTS } from './feedViewShared';

interface BuildListSnapViewportInput {
  screenWidth: number;
  screenHeight: number;
  legacyViewportHeight: number;
  bottomNavBarHeight: number;
}

export interface ListSnapViewportConfig {
  useLegacyLiquidGlassLayout: boolean;
  snapViewportHeight: number;
  cardHeightForList: number;
}

/**
 * List snapping viewport strategy:
 * - iOS + liquid glass keeps existing list layout/card sizing behavior.
 * - Android and iOS without liquid glass use a bounded viewport from
 *   top safe area to top of native tab bar, and cards match that height.
 */
export const buildListSnapViewport = ({
  screenWidth,
  screenHeight,
  legacyViewportHeight,
  bottomNavBarHeight,
}: BuildListSnapViewportInput): ListSnapViewportConfig => {
  const useLegacyLiquidGlassLayout = isIosLiquidGlassAvailable;
  const boundedViewportHeight = Math.max(0, screenHeight - bottomNavBarHeight);

  if (useLegacyLiquidGlassLayout) {
    return {
      useLegacyLiquidGlassLayout,
      snapViewportHeight: legacyViewportHeight,
      cardHeightForList: getVideoCardHeight(screenWidth, screenHeight),
    };
  }

  return {
    useLegacyLiquidGlassLayout,
    snapViewportHeight: boundedViewportHeight,
    // Keep card + separator equal to viewport to avoid clipping near the bottom edge.
    cardHeightForList: Math.max(0, boundedViewportHeight - FEED_VIEW_CONSTANTS.SEPARATOR_HEIGHT),
  };
};
