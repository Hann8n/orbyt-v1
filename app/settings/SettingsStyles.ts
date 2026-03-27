import { StyleSheet } from 'react-native';
import { Colors } from '@/theme';
import { hexToRGBA } from '@/utils/formatting/colors';
import { BORDER_RADIUS } from '@/utils/constants';
import { FontFamily, Typography } from '@/utils/components/typography';

// Shared button styles for settings screens
export const settingsButtonStyles = StyleSheet.create({
  // Primary button style used across most settings screens
  primaryButton: {
    backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },

  // Menu option style (used in SettingsScreen, ContentFiltersScreen) - matches ShareSheet/VerticalListSheet pattern
  menuOption: {
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: Colors.transparent,
  },

  // Action button style (unblock, unmute, etc.)
  actionButton: {
    borderWidth: 0,
    borderColor: Colors.transparent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.FULL,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  // Small action button (clear, delete, etc.)
  smallActionButton: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: hexToRGBA(Colors.neutral[300], 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Edit button style
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.neutral[900],
  },

  // Category/Sort button style
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.neutral[900],
  },

  // Category button style (larger)
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.neutral[900],
  },

  // Logout button style - matches cancel button (compact footer style)
  logoutButton: {
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
  },

  // Toggle button group style
  toggleButtonGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    flexShrink: 0,
    width: 180,
    overflow: 'hidden',
  },

  // Individual toggle button
  toggleButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card item style (for lists)
  cardItem: {
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.neutral[500],
  },

  // Channel item style
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.neutral[600],
  },

  // Stats container style
  statsContainer: {
    backgroundColor: Colors.neutral[900],
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.neutral[500],
  },
});

// Shared text styles for settings screens
export const settingsTextStyles = StyleSheet.create({
  // Primary button text
  primaryButtonText: {
    color: Colors.neutral[200],
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },

  // Menu option text - matches VerticalListSheet pattern
  menuOptionText: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },

  // Menu option subtitle
  menuOptionSubtitle: {
    color: Colors.neutral[500],
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Figtree-Regular',
    marginTop: 4,
  },

  // Action button text
  actionButtonText: {
    color: Colors.neutral[50],
    fontSize: 15,
    fontFamily: 'Figtree-SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },

  // Section title text
  sectionTitle: {
    color: Colors.neutral[500],
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    paddingHorizontal: 30,
    paddingVertical: 12,
    letterSpacing: 0.5,
  },

  // Label inside a grouped section (e.g. "Read state")
  groupedLabelText: {
    color: Colors.neutral[500],
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
  },

  // Section title (larger)
  sectionTitleLarge: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 8,
  },

  // Section description
  sectionDescription: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
  },

  // Stats text
  statsText: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
  },

  // Loading text
  loadingText: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    marginTop: 12,
  },

  // Empty state title
  emptyTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },

  // Empty state description
  emptyDescription: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Filter button text
  filterButtonText: {
    color: Colors.neutral[50],
    fontSize: 12,
    fontFamily: 'Figtree-Medium',
  },

  // Category button text
  categoryButtonText: {
    color: Colors.neutral[50],
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
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
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },

  // User display name
  userDisplayName: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 2,
  },

  // User handle
  userHandle: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
  },

  // Channel name
  channelName: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 4,
  },

  // Channel description
  channelDescription: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    marginBottom: 4,
  },

  // Member count
  memberCount: {
    color: Colors.neutral[500],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
  },
});

// Shared layout styles
export const settingsLayoutStyles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },

  // Safe area
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },

  // Content container
  contentContainer: {
    paddingBottom: 40,
  },

  // Content container with standard settings padding (5px)
  contentContainerWithPadding: {
    paddingBottom: 20,
    paddingHorizontal: 0, // Remove horizontal padding to match other sheets
  },

  // List container
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
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

  // Grouped list (iOS Settings style): one card per section, rows inside
  groupedSection: {
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
    overflow: 'hidden',
    marginBottom: 24,
  },
  groupedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[800],
  },
  groupedRowLast: {
    borderBottomWidth: 0,
  },
  groupedRowLabel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
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

  // Search container
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  // Search input container
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.neutral[500],
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Search input
  searchInput: {
    flex: 1,
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    paddingVertical: 12,
    paddingLeft: 12,
  },

  // Filter container
  filterContainer: {
    marginBottom: 12,
    marginHorizontal: -20,
  },

  // Filter content
  filterContent: {
    paddingHorizontal: 20,
  },

  // Category container
  categoryContainer: {
    marginBottom: 8,
    marginHorizontal: -20,
  },

  // Category content
  categoryContent: {
    paddingHorizontal: 20,
  },

  // Separator
  separator: {
    height: 12,
  },

  // Logout section - matches cancel button container pattern
  logoutSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
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

  // Active category button text
  categoryButtonTextActive: {
    color: Colors.black,
    fontFamily: 'Figtree-Bold',
  },

  // Active edit button
  editButtonActive: {
    backgroundColor: Colors.neutral[900],
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
