import { memo, useCallback, type Ref } from 'react';
import {
  Image,
  Pressable,
  Text,
  StyleSheet,
  View,
  type ViewProps,
  type ImageSourcePropType,
  type PressableProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabTriggerSlotProps } from 'expo-router/ui';

import { Colors } from '@/theme';
import { Typography, FontFamily } from '@/utils/components/typography';

/** Height of the tab bar content row (icons), excluding the bottom safe-area inset. */
export const TAB_BAR_CONTENT_HEIGHT = 49;

const ICON_SIZE = 28;

/**
 * Container for the custom JS tab bar. Rendered as the `asChild` child of expo-router's
 * `<TabList>`, so it receives the list's forwarded props (and must spread them). Fully
 * JS-rendered and solid/opaque — no native UITabBar, hence no iOS 26 Liquid Glass.
 */
function AppTabBarComponent({ children, style, ref, ...props }: ViewProps & { ref?: Ref<View> }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      ref={ref}
      style={[
        styles.bar,
        { height: TAB_BAR_CONTENT_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const AppTabBar = memo(AppTabBarComponent);
AppTabBar.displayName = 'AppTabBar';

type AppTabBarButtonProps = TabTriggerSlotProps & {
  source: ImageSourcePropType;
  activeTint: string;
  inactiveTint: string;
  badgeCount?: number;
  badgeColor?: string;
  /** Called when this tab's button is pressed while it is already focused (scroll-to-top). */
  scrollToTop?: () => void;
};

function AppTabBarButtonComponent({
  isFocused,
  onPress,
  onLongPress,
  href: _href,
  source,
  activeTint,
  inactiveTint,
  badgeCount = 0,
  badgeColor,
  accessibilityLabel,
  scrollToTop,
  ref,
}: AppTabBarButtonProps) {
  const tint = isFocused ? activeTint : inactiveTint;
  const showBadge = badgeCount > 0;

  const handlePress = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
      onPress?.(e);
      if (isFocused) scrollToTop?.();
    },
    [onPress, isFocused, scrollToTop]
  );

  return (
    <Pressable
      ref={ref}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
      hitSlop={8}
    >
      <View style={styles.iconWrapper}>
        <Image source={source} style={[styles.icon, { tintColor: tint }]} resizeMode="contain" />
        {showBadge ? (
          <View style={[styles.badge, badgeColor ? { backgroundColor: badgeColor } : null]}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const AppTabBarButton = memo(AppTabBarButtonComponent);
AppTabBarButton.displayName = 'AppTabBarButton';

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.black,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[800],
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_BAR_CONTENT_HEIGHT,
  },
  iconWrapper: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral[500],
  },
  badgeText: {
    color: Colors.neutral[0],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.semibold,
    lineHeight: 14,
  },
});
