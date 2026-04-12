import { StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '@/utils/constants';
import { Colors, Shadows } from '@/theme';
import { androidTextFix } from '@/utils/styling/platformText';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';

export const exploreScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },

  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  searchSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  searchResultsSafeArea: {
    flex: 1,
  },
  flexOne: {
    flex: 1,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },

  searchContainer: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    zIndex: 10,
    ...Shadows.medium,
  },
  searchContainerLiquidGlass: {
    backgroundColor: Colors.transparent,
  },
  searchContainerTintedWhite: {
    // Non-glass fallback that matches the same shape metrics as liquid glass.
    backgroundColor: Colors.neutral[50],
  },
  searchContainerGlassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  searchBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  searchIconContainer: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.black,
    fontSize: Typography.sizes.h3,
    fontFamily: FontFamily.medium,
    paddingVertical: 12,
    textAlign: 'left',
    textAlignVertical: 'center',
    ...androidTextFix,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorItemStyle: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelItemStyle: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  channelImage: {
    marginRight: 12,
  },
  channelsGridContainer: {
    paddingBottom: 20,
  },
  specialRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  gridItemsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridChannelWrapper: {
    // Wrapper for grid channel items
  },
  gridChannelItem: {},
  gridChannelThumbnail: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
  },
  gridChannelImage: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  gridChannelGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  gridChannelCornerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 120,
    height: 120,
    transform: [{ scaleY: -1 }], // Flip vertically to move gradient from top-left to bottom-left
  },
  gridChannelNameOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  gridChannelName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.bold,
  },
  horizontalChannelButton: {
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    position: 'relative',
  },
  horizontalChannelThumbnail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    alignItems: 'flex-end', // Align content to right
    justifyContent: 'flex-start', // Align to top
  },
  horizontalChannelImage: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  horizontalChannelLabelContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    paddingRight: 8,
  },
  horizontalChannelLabel: {
    color: Colors.neutral[50],
    fontSize: fontSizeFor(22),
    fontFamily: FontFamily.bold,
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  orbytSlash: {
    fontFamily: FontFamily.semibold,
  },
  channelName: {
    color: Colors.neutral[50],
    fontSize: fontSizeFor(17),
    fontFamily: FontFamily.bold,
    flexShrink: 1,
  },
  sectionHeader: {
    paddingHorizontal: 10,
    paddingTop: 15,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
  },

  spotlightContainer: {
    marginBottom: 7,
  },
  spotlightScrollContainer: {
    paddingHorizontal: 10,
    paddingRight: 40, // Extra padding on the right to allow scrolling off screen
  },
  spotlightVideoItem: {
    width: 90,
    marginRight: 7,
  },
  /** iOS zoom: fills `Pressable` bounds (match thumbnail height). */
  spotlightAppleZoomSourceInner: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  spotlightVideoThumbnailContainer: {
    position: 'relative',
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden' as const,
  },
  spotlightVideoThumbnail: {
    width: 90,
    height: 160, // 9:16 aspect ratio (90 * 16/9)
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden' as const,
    position: 'relative',
    zIndex: 1,
  },
  spotlightVideoThumbnailPlaceholder: {
    width: 90,
    height: 160, // 9:16 aspect ratio (90 * 16/9)
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[925],
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightWarningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.overlay.black70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  spotlightWarningText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.overline,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  emptyTabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTabText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
  },

  searchTabsContainer: {
    alignSelf: 'stretch',
    width: '100%',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 15,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 16,
    backgroundColor: Colors.black,
  },
  indicatorItem: {
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  searchResultsContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  pagerView: {
    flex: 1,
  },
  pagerPage: {
    flex: 1,
  },

  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainerFull: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  loadingContainerTop: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 24,
  },
  searchContentWrapper: {
    flex: 1,
  },
  androidPaddingTop: {
    paddingTop: 0,
  },
  searchBarPressable: {
    zIndex: 30,
  },
  headerSpacerFill: {
    width: '100%',
  },
  searchIconMirror: {
    transform: [{ scale: 1.2 }, { scaleX: -1 }],
  },
  topGradientExploreHeight: {
    height: 58,
  },
  exploreSearchResultsTopInset: {
    width: '100%',
  },
  popularNowImage: {
    alignSelf: 'flex-end',
    marginRight: -50,
  },
  latestImage: {
    borderRadius: 0,
  },
});
