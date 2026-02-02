import { StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '../../utils/constants';
import { Colors } from './UI';

// Shared size configuration for AuthorItem and ChannelItem
export const itemSizeConfig = {
  small: {
    avatarSize: 32,
    textSize: 12,
    badgeTextSize: 12,
    nameFontSize: 14,
    handleFontSize: 11,
  },
  medium: {
    avatarSize: 40,
    textSize: 14,
    badgeTextSize: 14,
    nameFontSize: 16,
    handleFontSize: 13,
  },
  large: {
    avatarSize: 48,
    textSize: 16,
    badgeTextSize: 16,
    nameFontSize: 18,
    handleFontSize: 15,
  },
};

// Shared styles for AuthorItem and ChannelItem
export const sharedItemStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
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
    color: Colors.neutral[50],
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
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
