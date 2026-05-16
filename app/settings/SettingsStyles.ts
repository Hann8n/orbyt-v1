import { StyleSheet } from 'react-native';
import { Colors } from '@/theme';
import { BORDER_RADIUS, LAYOUT_INSETS } from '@/utils/constants';

/** Deepest settings chrome (matches `DEFAULT_SHEET_PROPS.backgroundColor`). */
const SETTINGS_SURFACE_BG = Colors.neutral[975];
/** Raised rows / cards on settings surface (matches `OptionsButton` fill). */
const SETTINGS_ELEVATED_BG = Colors.neutral[925];
import { FontFamily, Typography } from '@/utils/components/typography';
import {
  settingsCategoryChipContainer,
  settingsCompactActionContainer,
  settingsEditChipContainer,
  settingsFilterChipContainer,
  settingsIconSquareContainer,
  settingsLogoutPillContainer,
  settingsMenuOptionRowContainer,
  settingsPrimaryRowContainer,
  settingsToggleGroupContainer,
  settingsToggleItemContainer,
} from '@/components/ui/buttonPresets';

// Shared button styles for settings screens
export const settingsButtonStyles = StyleSheet.create({
  primaryButton: settingsPrimaryRowContainer,

  menuOption: settingsMenuOptionRowContainer,

  actionButton: settingsCompactActionContainer,

  smallActionButton: settingsIconSquareContainer,

  editButton: settingsEditChipContainer,

  filterButton: settingsFilterChipContainer,

  categoryButton: settingsCategoryChipContainer,

  logoutButton: settingsLogoutPillContainer,

  toggleButtonGroup: settingsToggleGroupContainer,

  toggleButton: settingsToggleItemContainer,

  // Card item style (for lists)
  cardItem: {
    backgroundColor: SETTINGS_ELEVATED_BG,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
  },

  // Channel item style
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SETTINGS_ELEVATED_BG,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
  },

  // Stats container style
  statsContainer: {
    backgroundColor: SETTINGS_ELEVATED_BG,
    marginHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
  },
});

// Shared text styles for settings screens
export const settingsTextStyles = StyleSheet.create({
  // Primary button text
  primaryButtonText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.title,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
  },

  // Menu option text - matches VerticalListSheet pattern
  menuOptionText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
  },

  // Menu option subtitle
  menuOptionSubtitle: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.caption,
    fontWeight: '400',
    fontFamily: FontFamily.regular,
    marginTop: 4,
  },

  // Action button text
  actionButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Section title text (muted header on 975 surface; matches sheet secondary copy)
  sectionTitle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
    paddingHorizontal: 0,
    paddingVertical: 12,
    letterSpacing: 0.5,
  },

  groupedLabelText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
  },

  // Section title (larger)
  sectionTitleLarge: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
    marginBottom: 8,
  },

  // Section description (matches sheet body description: neutral[200] on 975)
  sectionDescription: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.bodySmall,
  },

  // Stats text
  statsText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },

  // Loading text
  loadingText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
    marginTop: 12,
  },

  // Empty state title
  emptyTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
    marginTop: 16,
    marginBottom: 8,
  },

  // Empty state description
  emptyDescription: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    lineHeight: Typography.lineHeights.subtitle,
  },

  // Filter button text
  filterButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
  },

  // Category button text
  categoryButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
    letterSpacing: 0.3,
  },

  // Logout button text - matches cancel button (compact footer style)
  logoutButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    textAlign: 'center',
    fontFamily: FontFamily.semibold,
  },

  // Edit button text
  editButtonText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
  },

  // User display name
  userDisplayName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
    marginBottom: 2,
  },

  // User handle
  userHandle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
  },

  // Channel name
  channelName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontWeight: '600',
    fontFamily: FontFamily.semibold,
    marginBottom: 4,
  },

  // Channel description
  channelDescription: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    marginBottom: 4,
  },

  // Member count
  memberCount: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
  },
});

// Shared layout styles
export const settingsLayoutStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SETTINGS_SURFACE_BG,
  },

  safeArea: {
    flex: 1,
    backgroundColor: SETTINGS_SURFACE_BG,
  },

  // Content container
  contentContainer: {
    paddingBottom: 40,
  },

  // Content container with standard settings padding (5px)
  contentContainerWithPadding: {
    paddingBottom: 20,
    paddingHorizontal: 0,
  },

  /** Root settings scroll: same horizontal inset as sheet body (`VerticalListSheet`). */
  settingsRootScrollContent: {
    paddingBottom: 20,
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
  },

  listContainer: {
    flexGrow: 1,
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    paddingTop: 16,
  },

  // List container (no padding)
  listContainerNoPadding: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
  },

  // Section
  section: {
    marginTop: 0,
    marginBottom: 12,
  },

  // Grouped list (iOS-style card); rows use hairline separators
  groupedSection: {
    backgroundColor: SETTINGS_ELEVATED_BG,
    borderRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
    marginBottom: 24,
  },
  groupedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.neutral[800],
  },
  groupedRowLast: {
    borderBottomWidth: 0,
  },
  groupedRowLabel: {
    paddingVertical: 10,
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[800],
    marginTop: 4,
  },

  // Section with standard settings padding (5px)
  sectionWithPadding: {
    marginTop: 12,
    paddingHorizontal: 5,
  },

  // Loading container
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty container
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 120,
  },

  searchContainer: {
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    paddingVertical: 16,
  },

  // Search input container (matches SendToPicker search row)
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[800],
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
    paddingVertical: 11,
    minHeight: 46,
    marginBottom: 16,
  },

  // Search input
  searchInput: {
    flex: 1,
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
    paddingVertical: 12,
    paddingLeft: 12,
  },

  filterContainer: {
    marginBottom: 12,
    marginHorizontal: -LAYOUT_INSETS.SHEET_CONTENT,
  },

  filterContent: {
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
  },

  categoryContainer: {
    marginBottom: 8,
    marginHorizontal: -LAYOUT_INSETS.SHEET_CONTENT,
  },

  categoryContent: {
    paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT,
  },

  // Separator
  separator: {
    height: 12,
  },

  logoutSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: LAYOUT_INSETS.SHEET_FOOTER,
  },
});

// Active state styles
export const settingsActiveStyles = StyleSheet.create({
  // Active filter button
  filterButtonActive: {
    backgroundColor: Colors.neutral[200],
  },

  // Active category button
  categoryButtonActive: {
    backgroundColor: Colors.neutral[200],
  },

  categoryButtonTextActive: {
    color: Colors.neutral[975],
    fontFamily: FontFamily.bold,
  },

  editButtonActive: {
    backgroundColor: SETTINGS_ELEVATED_BG,
  },

  // Active edit button text
  editButtonTextActive: {
    color: Colors.teal[300],
  },

  // Active toggle button
  toggleButtonActive: {
    backgroundColor: Colors.teal[300],
  },

  // Disabled button
  buttonDisabled: {
    opacity: 0.7,
  },
});

// Avatar styles
export const settingsAvatarStyles = StyleSheet.create({
  // Small avatar
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.neutral[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  // Medium avatar
  avatarMedium: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.neutral[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  // Large avatar
  avatarLarge: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[600],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  // Avatar image
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.LARGE,
  },
});

export default {
  button: settingsButtonStyles,
  text: settingsTextStyles,
  layout: settingsLayoutStyles,
  active: settingsActiveStyles,
  avatar: settingsAvatarStyles,
};
