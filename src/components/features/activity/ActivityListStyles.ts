import { StyleSheet } from 'react-native';
import { BORDER_RADIUS, ICON_SIZES } from '@/utils/constants';
import { FontFamily, Typography, fontSizeFor } from '@/utils/components/typography';
import { Colors } from '@/theme';

/** Avatar column width on Chats + Notifications activity lists. */
const ACTIVITY_LIST_AVATAR_SIZE = 55;
/** Horizontal gap between avatar and title column. */
const ACTIVITY_LIST_AVATAR_GAP = 12;
/** Inset from list leading edge to start of title column (avatar + gap). */
export const ACTIVITY_LIST_TEXT_LEADING = ACTIVITY_LIST_AVATAR_SIZE + ACTIVITY_LIST_AVATAR_GAP;

/** Preview / secondary line body — shared by Chats and Notifications rows. */
const ACTIVITY_LIST_PREVIEW_FONT_SIZE = fontSizeFor(16.5);

/** Muted-conversation bell — between `ICON_SIZES.SMALL` and `MEDIUM`. */
export const ACTIVITY_LIST_MUTED_ICON_SIZE = 18;

/** Streak badge flame/fire icons. */
export const ACTIVITY_LIST_STREAK_ICON_SIZE = 14;

/** “You sent last” forward icon — matches `ICON_SIZES.SMALL`. */
export const ACTIVITY_LIST_SENT_BY_ME_ICON_SIZE = ICON_SIZES.SMALL;

/**
 * Shared list row chrome for Activity Chats + Notifications tabs.
 * Compose with local styles for tab-specific layout (e.g. thumbnail margin).
 */
export const activityListSharedStyles = StyleSheet.create({
  listContentContainer: {
    paddingHorizontal: 10,
  },
  profileImage: {
    width: ACTIVITY_LIST_AVATAR_SIZE,
    height: ACTIVITY_LIST_AVATAR_SIZE,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: ACTIVITY_LIST_AVATAR_GAP,
  },
  avatarFill: { width: '100%', height: '100%' },
  /** Main text column beside avatar; add `marginRight` when a thumbnail sits on the right. */
  mainColumn: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    minHeight: ACTIVITY_LIST_AVATAR_SIZE,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  namePressable: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  authorName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    marginBottom: 2,
    fontFamily: FontFamily.black,
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  actionTextAndTime: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minWidth: 0,
  },
  secondaryLineWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  actionText: {
    color: Colors.neutral[400],
    fontSize: ACTIVITY_LIST_PREVIEW_FONT_SIZE,
    fontFamily: FontFamily.medium,
  },
  timeText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    marginLeft: 4,
  },
  dividerInset: {
    height: 1,
    backgroundColor: Colors.neutral[900],
    marginLeft: ACTIVITY_LIST_TEXT_LEADING,
  },
});
