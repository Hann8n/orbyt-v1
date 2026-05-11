import { StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Typography, TextStyles } from '../../utils/components/typography';
import { Colors } from './UI';

/** Vertical padding for AuthorItem / ChannelItem rows (single source of truth). */
const ITEM_ROW_PADDING_VERTICAL = 16;

// Shared size configuration for AuthorItem and ChannelItem
export const itemSizeConfig = {
  /** Dense rows (e.g. chat embeds on video cards). */
  xsmall: {
    avatarSize: 28,
    textSize: Typography.sizes.caption,
    badgeTextSize: Typography.sizes.caption,
    nameFontSize: Typography.sizes.bodySmall,
    handleFontSize: Typography.sizes.caption,
  },
  small: {
    avatarSize: 32,
    textSize: Typography.sizes.bodySmall,
    badgeTextSize: Typography.sizes.bodySmall,
    nameFontSize: Typography.sizes.bodySmall,
    handleFontSize: Typography.sizes.caption,
  },
  medium: {
    avatarSize: 40,
    textSize: Typography.sizes.body,
    badgeTextSize: Typography.sizes.body,
    nameFontSize: Typography.sizes.body,
    handleFontSize: Typography.sizes.bodySmall,
  },
  large: {
    avatarSize: 48,
    textSize: Typography.sizes.subtitle,
    badgeTextSize: Typography.sizes.subtitle,
    nameFontSize: Typography.sizes.subtitle,
    handleFontSize: Typography.sizes.body,
  },
};

// Shared styles for AuthorItem and ChannelItem
export const sharedItemStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: ITEM_ROW_PADDING_VERTICAL,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.LARGE,
    marginBottom: 12,
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarContainer: {
    marginRight: 8,
  },
  accountInfoContainer: {
    flex: 1,
    paddingLeft: 4,
  },
  accountDisplayName: {
    ...TextStyles.profileHandle,
    color: Colors.neutral[50],
    marginBottom: 2,
  },
  accountArrow: {
    marginLeft: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  followButton: {
    width: 32,
    height: 32,
    borderWidth: 0,
    borderColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 10,
  },
});

/**
 * Flat list rows: no per-row card chrome (contrast with OptionsButton / default AuthorItem cards).
 * Use a hairline border under each row; clear `borderBottomWidth` on the last row via `style`.
 */
export const sharedListRowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 0,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.neutral[800],
  },
});
