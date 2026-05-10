/**
 * Explore search chrome layout. Keep in sync with `ExploreScreenStyles.searchContainer`
 * metrics (horizontal insets are separate).
 */
export const EXPLORE_SEARCH_LAYOUT = {
  /** `top` offset of the search bar inside the top `SafeAreaView` content */
  BAR_OFFSET_TOP: 10,
  /** Fixed row height for the search field */
  BAR_HEIGHT: 48,
  /** Space between the bottom of the search bar and the People / Feeds tabs */
  GAP_BELOW_BAR: 8,
} as const;

/**
 * Height of the search chrome inside the top safe-area container.
 * Used as a base for both overlay insets and list positioning calculations.
 */
export const exploreSearchChromeHeight =
  EXPLORE_SEARCH_LAYOUT.BAR_OFFSET_TOP +
  EXPLORE_SEARCH_LAYOUT.BAR_HEIGHT +
  EXPLORE_SEARCH_LAYOUT.GAP_BELOW_BAR;

export const getExploreTopChromeSpacerHeight = (): number => exploreSearchChromeHeight;
