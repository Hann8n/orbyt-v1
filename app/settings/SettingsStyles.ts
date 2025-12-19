import { StyleSheet } from 'react-native';
import { Colors } from '../../src/components/ui/UI';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';
import { BORDER_RADIUS } from '../../src/utils/constants';

// Shared button styles for settings screens
export const settingsButtonStyles = StyleSheet.create({
  // Primary button style used across most settings screens
  primaryButton: {
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: hexToRGBA(Colors.gray, 0.28),
    overflow: 'hidden',
  },

  // Menu option style (used in SettingsScreen, ContentFiltersScreen) - matches ShareSheet/VerticalListSheet pattern
  menuOption: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },


  // Action button style (unblock, unmute, etc.)
  actionButton: {
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.FULL,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
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
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: hexToRGBA(Colors.gray, 0.28),
  },

  // Edit button style
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },

  // Category/Sort button style
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.gray,
  },

  // Category button style (larger)
  categoryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.darkGray,
    borderWidth: 2,
    borderColor: Colors.gray,
  },

  // Logout button style - matches cancel button pattern
  logoutButton: {
    backgroundColor: Colors.darkGray,
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
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
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
    borderRightWidth: 1,
    borderRightColor: Colors.mediumGray,
  },

  // Card item style (for lists)
  cardItem: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
  },

  // Channel item style
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },

  // Stats container style
  statsContainer: {
    backgroundColor: Colors.darkGray,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
});

// Shared text styles for settings screens
export const settingsTextStyles = StyleSheet.create({
  // Primary button text
  primaryButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },

  // Menu option text - matches VerticalListSheet pattern
  menuOptionText: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },

  // Menu option subtitle
  menuOptionSubtitle: {
    color: Colors.gray,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Firma-Regular',
    marginTop: 4,
  },

  // Action button text
  actionButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },

  // Section title text
  sectionTitle: {
    color: Colors.gray,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    paddingHorizontal: 30,
    paddingVertical: 12,
  },

  // Section title (larger)
  sectionTitleLarge: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },

  // Section description
  sectionDescription: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },

  // Stats text
  statsText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },

  // Loading text
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },

  // Empty state title
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },

  // Empty state description
  emptyDescription: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Filter button text
  filterButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Medium',
  },

  // Category button text
  categoryButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
    letterSpacing: 0.3,
  },

  // Logout button text - matches cancel button pattern
  logoutButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },

  // Edit button text
  editButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },

  // User display name
  userDisplayName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 2,
  },

  // User handle
  userHandle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },

  // Channel name
  channelName: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 4,
  },

  // Channel description
  channelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },

  // Member count
  memberCount: {
    color: Colors.gray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
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
    paddingHorizontal: 20,
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
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.gray,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Search input
  searchInput: {
    flex: 1,
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
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
    paddingHorizontal: 12,
  },
});

// Active state styles
export const settingsActiveStyles = StyleSheet.create({
  // Active filter button
  filterButtonActive: {
    backgroundColor: Colors.darkGray,
    borderColor: Colors.lightGray,
    borderWidth: 2,
  },

  // Active category button
  categoryButtonActive: {
    backgroundColor: Colors.lightGray,
    borderColor: Colors.white,
  },

  // Active category button text
  categoryButtonTextActive: {
    color: Colors.black,
    fontFamily: 'Firma-Bold',
  },

  // Active edit button
  editButtonActive: {
    backgroundColor: Colors.darkGray,
    borderColor: Colors.mediumGray,
  },

  // Active edit button text
  editButtonTextActive: {
    color: Colors.lightGreen,
  },

  // Active toggle button
  toggleButtonActive: {
    backgroundColor: Colors.lightGreen,
    borderRightColor: Colors.lightGreen,
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
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  // Medium avatar
  avatarMedium: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  // Large avatar
  avatarLarge: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.mediumGray,
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
