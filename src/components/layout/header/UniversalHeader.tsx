import React, { memo, useCallback, useMemo, useLayoutEffect } from 'react';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import { BORDER_RADIUS, ICON_SIZES } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  TextLayoutEventData,
  Platform,
} from 'react-native';
import { Image, ImageBackground } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolateColor,
  Easing,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEffectiveTopInset } from '@/utils/device/screen';
import Icon, { BackArrowIcon, MoreFillIcon, STROKE_WIDTH_THICK } from '../../ui/Icon';
import { NativePressable } from '../../ui/NativePressable';
import { OutlinkIcon, GermDmIcon } from '../../ui/Icon';
import { useRouter } from 'expo-router';
import { buildFeedModalHref } from '@/utils/navigation/feedModalRoute';
import { useFeedModalTabSegment } from '@/utils/navigation/feedModalTabSegment';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { hexToRGBA, blendColors, getRelativeLuminance } from '../../../utils/formatting/colors';
import { Avatar } from '../../ui/UI';
import { Colors } from '../../../theme';
import { Typography, FontFamily } from '../../../utils/components/typography';
import { splitHandleSuffix } from '../../../utils/formatting/handles';
import { TextWithLinks } from '../../ui/TextWithLinks';
import type { RichTextFacet } from '../../../utils/types/richText';
import { useDetailHeaderScrollPresentation } from './useDetailHeaderScrollPresentation';

/**
 * Large header implementation for feeds and detail screens. ProfileHeader and ChannelHeader are
 * the primary “detail” entry points; scroll-linked dim/fade for those flows lives in
 * `useDetailHeaderScrollPresentation`.
 */

const GRADIENT_SHIM = require('../../../assets/embed-video-gradient-shim.png');
const TABBED_HEADER_BACKGROUND_CUTOFF = 20;

/** Single spec for follow ↔ unfollow: same duration, easing, and layout as the ink crossfade. */
const FOLLOW_PILL_TRANSITION_MS = 360;

const FOLLOW_PILL_LAYOUT_ANIMATION = LinearTransition.duration(FOLLOW_PILL_TRANSITION_MS).easing(
  Easing.inOut(Easing.cubic)
);

function cloneHeaderActionIconColor(node: React.ReactNode, color: string): React.ReactNode {
  if (
    React.isValidElement(node) &&
    typeof node.props === 'object' &&
    node.props !== null &&
    'color' in node.props
  ) {
    return React.cloneElement(node as React.ReactElement<{ color?: string }>, { color });
  }
  return node;
}

// Types for the universal header system
export interface HeaderAction {
  id: string;
  label: string;
  icon?: string;
  customIcon?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  active?: boolean; // For tracking active state of icon-only buttons (e.g., subscription button)
}

export interface HeaderContent {
  avatar?: string;
  title: string;
  customTitle?: React.ReactNode;
  subtitle?: string;
  subtitleSecondary?: string; // e.g., Joined date or secondary line
  onSubtitleSecondaryPress?: () => void; // Handler for subtitle secondary press
  /** Optional action link in subtitle area (e.g. Germ DM) */
  subtitleAction?: { label: string; onPress: () => void };
  description?: string;
  facets?: RichTextFacet[];
  badge?: React.ReactNode;
  onAvatarPress?: () => void;
  onTitlePress?: () => void;
  avatarStyle?: 'circle' | 'rounded-square';
  hideAvatar?: boolean;
  avatarBlurRadius?: number;
  status?: import('../../../services/api/types').StatusView; // Status for live indicator
  /** When set (e.g. live avatar), opens native menu instead of single onAvatarPress. */
  avatarMenuActions?: MenuAction[];
  onAvatarMenuAction?: (actionId: string) => void;
}

export interface CustomActionLayout {
  type: 'menu' | 'button' | 'button-group';
  position?: 'top-right' | 'top-left';
  menuIcon?: {
    name?: string;
    size?: number;
    onPress: () => void;
  };
  buttons?: HeaderAction[];
  buttonGroup?: {
    primary: HeaderAction;
    secondary?: HeaderAction;
  };
}

export interface UniversalHeaderProps {
  content: HeaderContent;
  actions?: HeaderAction[];
  customActions?: CustomActionLayout[];
  showBackButton?: boolean;
  onBackPress?: () => void;
  backgroundColor?: string;
  textColor?: string;
  backgroundImage?: string;
  isLoading?: boolean;
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  applySafeArea?: boolean;
  showShadowGradient?: boolean;
  minHeight?: number;
  contentPosition?: 'top' | 'center' | 'bottom' | 'space-between';
  hasTabs?: boolean; // Indicates if tab navigation is present (for hashtag feeds)
  reserveTopForOverlayButtons?: boolean; // Adds extra top padding so overlay buttons don't overlap content
  contentScrollProgress?: SharedValue<number>;
  /** See `useDetailHeaderScrollPresentation`. */
  contentScrollFadeDisabled?: boolean;
  /** See `useDetailHeaderScrollPresentation`. */
  scrollLinkedDimDisabled?: boolean;
}

// Memoized action button component for performance
const ActionButton = memo<{
  action: HeaderAction;
  textColor: string;
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
  preferLiquidGlass?: boolean;
}>(({ action, textColor, backgroundColor, size = 'medium', preferLiquidGlass = false }) => {
  const hasFilledBackground = useMemo(() => {
    const isIconOnlyFollowingState = action.id === 'follow' && !action.label;
    const isSaveButton = action.id === 'save';
    const isActiveSubscription = action.id === 'subscription' && action.active;
    const isExplicitlyActive = action.active === true;
    return isIconOnlyFollowingState || isSaveButton || isActiveSubscription || isExplicitlyActive;
  }, [action.label, action.id, action.active]);

  // 0 = unfollowed appearance, 1 = followed (filled pill / inverted ink)
  const animationProgress = useSharedValue(hasFilledBackground ? 1 : 0);

  useLayoutEffect(() => {
    animationProgress.value = withTiming(hasFilledBackground ? 1 : 0, {
      duration: FOLLOW_PILL_TRANSITION_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [hasFilledBackground, animationProgress]);

  // Animated style for smooth background color transition
  const animatedButtonStyle = useAnimatedStyle(() => {
    'worklet';
    const unfilledBg = blendColors(backgroundColor, textColor, 0.2);
    const filledBg = textColor;
    return {
      backgroundColor: interpolateColor(animationProgress.value, [0, 1], [unfilledBg, filledBg]),
      opacity: action.disabled ? 0.4 : 1,
    };
  }, [textColor, backgroundColor, action.disabled]);

  // Content crossfade (UI thread): linear blend so reversing direction mirrors the same curve in time.
  const unfilledContentOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: 1 - animationProgress.value };
  });

  const filledContentOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: animationProgress.value };
  });

  const canUseLiquidGlass =
    preferLiquidGlass &&
    Platform.OS === 'ios' &&
    isLiquidGlassAvailable() &&
    action.variant !== 'danger' &&
    action.variant !== 'secondary';

  const getButtonStyle = useCallback(() => {
    const showFilledState = hasFilledBackground;

    const baseStyle = {
      backgroundColor: canUseLiquidGlass
        ? Colors.transparent
        : showFilledState
          ? textColor
          : blendColors(backgroundColor, textColor, 0.2),
      opacity: action.disabled ? 0.4 : 1,
    };

    switch (action.variant) {
      case 'danger':
        return {
          ...baseStyle,
          backgroundColor: blendColors(backgroundColor, Colors.coral[500], 0.2),
        };
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          opacity: action.disabled ? 0.4 : 1,
        };
      default:
        return baseStyle;
    }
  }, [
    action.variant,
    action.disabled,
    textColor,
    backgroundColor,
    hasFilledBackground,
    canUseLiquidGlass,
  ]);

  const getLiquidGlassTintColor = useCallback(() => {
    const isActive = hasFilledBackground;
    const activeTint = textColor;
    const inactiveTint = hexToRGBA(Colors.black, 0.12);
    return isActive ? activeTint : inactiveTint;
  }, [hasFilledBackground, textColor]);

  const getContentColor = useCallback(() => {
    if (canUseLiquidGlass) {
      const isActive = hasFilledBackground;
      const activeContent = backgroundColor;
      const inactiveContent = textColor;
      return isActive ? activeContent : inactiveContent;
    }
    const showFilledState = hasFilledBackground;
    return showFilledState ? backgroundColor : textColor;
  }, [textColor, backgroundColor, hasFilledBackground, canUseLiquidGlass]);

  const getButtonSize = useCallback(() => {
    const hasLabel = !!action.label;
    const hasIcon = !!(action.customIcon || action.icon);
    const isFollowLeadingIcon = action.id === 'follow' && !!action.customIcon && hasLabel;

    // Icon-only — fixed footprint, full pill radius
    if (!hasLabel) {
      switch (size) {
        case 'small':
          return { width: 40, height: 32, borderRadius: 100 };
        case 'large':
          return { width: 56, height: 48, borderRadius: 100 };
        default:
          return { width: 50, height: 44, borderRadius: 100 };
      }
    }

    // Labeled, text-only (e.g. Edit profile) — same pill heights as icon variants
    if (!hasIcon) {
      switch (size) {
        case 'small':
          return {
            paddingHorizontal: 12,
            paddingVertical: 6,
            minWidth: 72,
            height: 32,
            borderRadius: 100,
          };
        case 'large':
          return {
            paddingHorizontal: 24,
            paddingVertical: 12,
            minWidth: 112,
            height: 48,
            borderRadius: 100,
          };
        default:
          return {
            paddingHorizontal: 16,
            paddingVertical: 8,
            minWidth: 92,
            height: 44,
            borderRadius: 100,
          };
      }
    }

    // Follow + leading custom icon — slightly asymmetric padding for the cap icon
    if (isFollowLeadingIcon) {
      switch (size) {
        case 'small':
          return {
            paddingLeft: 7,
            paddingRight: 10,
            minWidth: 84,
            height: 32,
            borderRadius: 100,
          };
        case 'large':
          return {
            paddingLeft: 14,
            paddingRight: 16,
            minWidth: 120,
            height: 48,
            borderRadius: 100,
          };
        default:
          return {
            paddingLeft: 10,
            paddingRight: 12,
            minWidth: 108,
            height: 44,
            borderRadius: 100,
          };
      }
    }

    // Labeled + trailing icon (e.g. delete) — symmetric pill, matches row spacing used on Follow
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 10,
          minWidth: 88,
          height: 32,
          borderRadius: 100,
        };
      case 'large':
        return {
          paddingHorizontal: 20,
          minWidth: 124,
          height: 48,
          borderRadius: 100,
        };
      default:
        return {
          paddingHorizontal: 14,
          minWidth: 104,
          height: 44,
          borderRadius: 100,
        };
    }
  }, [size, action]);

  const renderLabeledActionRow = useCallback(
    (contentColor: string, textStyle: StyleProp<TextStyle>) => {
      const labelText = (align: 'left' | 'center'): React.ReactElement => (
        <Text
          style={[
            textStyle,
            align === 'left' ? styles.actionPillLabel : styles.actionPillLabelCentered,
            { color: contentColor },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {action.label}
        </Text>
      );

      if (action.id === 'follow' && action.customIcon) {
        return (
          <View style={styles.labeledActionRow} pointerEvents="none">
            <View style={styles.labeledActionLeadingIconCap}>
              {cloneHeaderActionIconColor(action.customIcon, contentColor)}
            </View>
            {labelText('left')}
          </View>
        );
      }

      if (action.customIcon || action.icon) {
        return (
          <View style={styles.labeledActionRow} pointerEvents="none">
            {labelText('left')}
            {action.customIcon ? (
              cloneHeaderActionIconColor(action.customIcon, contentColor)
            ) : action.icon ? (
              <Icon
                name={action.icon}
                size={16}
                color={contentColor}
                strokeWidth={STROKE_WIDTH_THICK}
              />
            ) : null}
          </View>
        );
      }

      return (
        <View style={styles.labeledActionTextOnlyRow} pointerEvents="none">
          {labelText('center')}
        </View>
      );
    },
    [action]
  );

  const renderContent = useCallback(() => {
    const contentColor = getContentColor();

    if (action.loading) {
      return <ActivityIndicator size="small" color={contentColor} />;
    }

    if (action.label) {
      const textStyle =
        action.variant === 'secondary' || action.id === 'save'
          ? styles.actionTextBold
          : styles.actionText;
      return renderLabeledActionRow(contentColor, textStyle);
    }

    return (
      <View style={styles.iconOnlyContent} pointerEvents="none">
        {action.customIcon ? (
          cloneHeaderActionIconColor(action.customIcon, contentColor)
        ) : action.icon ? (
          <Icon
            name={action.icon}
            size={20}
            color={contentColor}
            strokeWidth={STROKE_WIDTH_THICK}
          />
        ) : null}
      </View>
    );
  }, [action, getContentColor, renderLabeledActionRow]);

  // Only apply animated follow fill in non-glass mode.
  const isFollowButton = action.id === 'follow';
  const shouldAnimate =
    !canUseLiquidGlass &&
    isFollowButton &&
    action.variant !== 'danger' &&
    action.variant !== 'secondary';

  const followCrossfadeContent = shouldAnimate
    ? (() => {
        const textStyle =
          action.variant === 'secondary' || action.id === 'save'
            ? styles.actionTextBold
            : styles.actionText;
        const unfilledColor = textColor;
        const filledColor = backgroundColor;
        const content = action.loading ? (
          <ActivityIndicator size="small" color={unfilledColor} />
        ) : action.label ? (
          renderLabeledActionRow(unfilledColor, textStyle)
        ) : (
          <View style={styles.iconOnlyContent} pointerEvents="none">
            {action.customIcon ? (
              cloneHeaderActionIconColor(action.customIcon, unfilledColor)
            ) : action.icon ? (
              <Icon
                name={action.icon}
                size={20}
                color={unfilledColor}
                strokeWidth={STROKE_WIDTH_THICK}
              />
            ) : null}
          </View>
        );
        const contentFilled = action.loading ? (
          <ActivityIndicator size="small" color={filledColor} />
        ) : action.label ? (
          renderLabeledActionRow(filledColor, textStyle)
        ) : (
          <View style={styles.iconOnlyContent} pointerEvents="none">
            {action.customIcon ? (
              cloneHeaderActionIconColor(action.customIcon, filledColor)
            ) : action.icon ? (
              <Icon
                name={action.icon}
                size={20}
                color={filledColor}
                strokeWidth={STROKE_WIDTH_THICK}
              />
            ) : null}
          </View>
        );
        return (
          <View style={styles.followContentCrossfade} pointerEvents="none">
            <View style={styles.followContentSizer} pointerEvents="none">
              {content}
            </View>
            <Animated.View style={[styles.followContentLayer, unfilledContentOpacityStyle]}>
              {content}
            </Animated.View>
            <Animated.View style={[styles.followContentLayer, filledContentOpacityStyle]}>
              {contentFilled}
            </Animated.View>
          </View>
        );
      })()
    : null;

  // Follow pill: background must live inside NativePressable so iOS activeOpacity dimms the whole pill,
  // not only icon/text (profile overlay and elsewhere use non-glass animated follow).
  if (shouldAnimate) {
    const sizeStyle = getButtonSize();
    const pillRadius = 'borderRadius' in sizeStyle ? sizeStyle.borderRadius : BORDER_RADIUS.FULL;
    return (
      <Animated.View
        layout={FOLLOW_PILL_LAYOUT_ANIMATION}
        collapsable={false}
        style={[styles.actionButton, sizeStyle]}
      >
        <NativePressable
          style={[
            StyleSheet.absoluteFillObject,
            {
              overflow: 'hidden',
              borderRadius: pillRadius,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
          onPress={action.onPress}
          onLongPress={action.onLongPress}
          delayLongPress={action.delayLongPress}
          disabled={action.disabled || action.loading}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, animatedButtonStyle]}
          />
          {followCrossfadeContent}
        </NativePressable>
      </Animated.View>
    );
  }

  return (
    <NativePressable
      style={[
        styles.actionButton,
        canUseLiquidGlass && styles.actionButtonNoShadow,
        getButtonStyle(),
        getButtonSize(),
      ]}
      onPress={action.onPress}
      onLongPress={action.onLongPress}
      delayLongPress={action.delayLongPress}
      disabled={action.disabled || action.loading}
    >
      <>
        {canUseLiquidGlass && (
          <GlassView
            style={styles.actionButtonGlassBackground}
            glassEffectStyle="clear"
            tintColor={getLiquidGlassTintColor()}
          />
        )}
        {renderContent()}
      </>
    </NativePressable>
  );
});
ActionButton.displayName = 'ActionButton';

// Re-exported for use in overlay layouts (e.g., profile screen) to keep visuals 1:1
export const HeaderActionButton = ActionButton;

// Memoized custom action layout component
const CustomActionLayoutComponent = memo<{
  layout: CustomActionLayout;
  textColor: string;
  backgroundColor: string;
}>(({ layout, textColor, backgroundColor }) => {
  const renderMenuIcon = useCallback(() => {
    if (!layout.menuIcon) return null;

    return (
      <NativePressable
        style={styles.menuIconButton}
        onPress={layout.menuIcon.onPress}
        androidRippleBorderless
      >
        <MoreFillIcon size={layout.menuIcon.size || 24} color={textColor} />
      </NativePressable>
    );
  }, [layout.menuIcon, textColor]);

  const renderButtons = useCallback(() => {
    if (layout.type === 'button' && layout.buttons) {
      const n = layout.buttons.length;
      return (
        <View style={styles.buttonContainer}>
          {layout.buttons.map((action, index) => (
            <View
              key={action.id}
              style={[
                styles.headerActionStackSlot,
                { zIndex: n - index, elevation: (n - index) * 2 },
              ]}
            >
              <ActionButton
                action={action}
                textColor={textColor}
                backgroundColor={backgroundColor}
              />
            </View>
          ))}
        </View>
      );
    }

    if (layout.type === 'button-group' && layout.buttonGroup) {
      return (
        <View style={styles.buttonGroupContainer}>
          {layout.buttonGroup.secondary && (
            <ActionButton
              action={layout.buttonGroup.secondary}
              textColor={textColor}
              backgroundColor={backgroundColor}
              size="medium"
            />
          )}
          <ActionButton
            action={layout.buttonGroup.primary}
            textColor={textColor}
            backgroundColor={backgroundColor}
            size="medium"
          />
        </View>
      );
    }

    return null;
  }, [layout, textColor, backgroundColor]);

  const containerStyle = useMemo(() => {
    const baseStyle = styles.customActionsLayout;
    if (layout.position === 'top-left') {
      return [baseStyle, styles.customActionsLayoutLeft];
    }
    return baseStyle;
  }, [layout.position]);

  return (
    <View style={containerStyle}>
      {renderMenuIcon()}
      {renderButtons()}
    </View>
  );
});
CustomActionLayoutComponent.displayName = 'CustomActionLayoutComponent';

// Inline title that places badges exactly at the end of the last line
const InlineTitleWithBadges: React.FC<{
  title: string;
  titleStyle: TextStyle;
  badges?: React.ReactNode[];
}> = ({ title, titleStyle, badges = [] }) => {
  const [lines, setLines] = React.useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([]);

  const handleTextLayout = useCallback((e: { nativeEvent: TextLayoutEventData }) => {
    const l = e?.nativeEvent?.lines || [];
    if (l.length) setLines(l.map(ln => ({ x: ln.x, y: ln.y, width: ln.width, height: ln.height })));
  }, []);

  const last = lines.length ? lines[lines.length - 1] : null;
  const badgeTop = last ? last.y : 0; // align container to line top
  const badgeLeft = last ? last.x + last.width : 0;

  return (
    <View style={styles.inlineTitleContainer}>
      <Text style={titleStyle} onTextLayout={handleTextLayout}>
        {title}
      </Text>
      {last && badges && badges.filter(Boolean).length > 0 && (
        <View
          pointerEvents="box-none"
          style={[
            styles.inlineBadgesContainer,
            styles.inlineBadgesContainerCentered,
            { left: badgeLeft, top: badgeTop, height: last.height },
          ]}
        >
          <View style={styles.inlineBadgesRow}>
            {badges.map((node, idx) => (
              <React.Fragment key={`badge-${idx}`}>{node}</React.Fragment>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// Memoized header content component
const HeaderContentComponent = memo<{
  content: HeaderContent;
  textColor: string;
  backgroundColor: string;
  customDescription?: React.ReactNode;
}>(({ content, textColor, backgroundColor, customDescription }) => {
  const router = useRouter();
  const feedModalTab = useFeedModalTabSegment();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

  const navigateToAuthorProfile = useCallback(
    (identifier: string) => {
      const clean = (identifier || '').trim();
      if (!clean) return;

      goToProfile(clean);
    },
    [goToProfile]
  );

  const navigateToHashtagFeed = useCallback(
    (hashtag: string) => {
      router.navigate(
        buildFeedModalHref(
          {
            feedOption: `hashtag:${hashtag}`,
            backgroundColor: Colors.black,
            secondaryColor: Colors.neutral[50],
            initialIndex: '0',
            initialPostUri: '',
          },
          feedModalTab
        )
      );
    },
    [router, feedModalTab]
  );

  // Don't render empty content
  if (!content.title && !content.avatar && !content.customTitle) {
    return null;
  }

  const avatarMenuActions = content.avatarMenuActions;
  const useAvatarMenu = Boolean(avatarMenuActions && avatarMenuActions.length > 0);

  const avatarPressable = (
    <NativePressable
      style={[
        styles.avatar,
        content.avatarStyle === 'rounded-square' && styles.avatarRoundedSquare,
        content.hideAvatar && styles.hiddenAvatar,
      ]}
      onPress={useAvatarMenu ? undefined : content.onAvatarPress}
    >
      {!content.hideAvatar && (
        <Avatar
          uri={content.avatar}
          type={content.avatarStyle === 'rounded-square' ? 'channel' : 'profile'}
          size={120}
          profileColors={{ backgroundColor, textColor, foregroundColor: textColor }}
          showRing={true}
          blurRadius={content.avatarBlurRadius}
          status={content.status}
        />
      )}
    </NativePressable>
  );

  return (
    <View style={styles.contentContainer}>
      <View style={styles.avatarContainer}>
        {useAvatarMenu && avatarMenuActions ? (
          <MenuView
            title=""
            actions={avatarMenuActions}
            shouldOpenOnLongPress={false}
            themeVariant="dark"
            isAnchoredToRight={false}
            onPressAction={({ nativeEvent }: { nativeEvent: { event?: string } }) => {
              const id = nativeEvent?.event;
              if (id) content.onAvatarMenuAction?.(id);
            }}
          >
            {avatarPressable}
          </MenuView>
        ) : (
          avatarPressable
        )}
      </View>

      <View
        style={[
          styles.textContainer,
          !customDescription && !content.description && styles.textContainerNoMargin,
        ]}
      >
        {(() => {
          const titleRowInner = content.customTitle ? (
            <View style={styles.titleRow}>
              {content.customTitle}
              {content.badge && <View style={styles.badgeMargin}>{content.badge}</View>}
            </View>
          ) : (
            <InlineTitleWithBadges
              title={content.title}
              titleStyle={{ ...styles.title, color: textColor }}
              badges={[content.badge as React.ReactNode]}
            />
          );
          return content.onTitlePress ? (
            <NativePressable style={styles.titleRow} onPress={content.onTitlePress}>
              {titleRowInner}
            </NativePressable>
          ) : (
            <View style={styles.titleRow}>{titleRowInner}</View>
          );
        })()}

        {!!content.subtitle &&
          (() => {
            const { handleBase: subtitleBase, handleSuffix: subtitleSuffix } = splitHandleSuffix(
              content.subtitle
            );

            const subtitleColumn = (
              <View style={styles.subtitleColumn}>
                <Text style={[styles.subtitle, { color: textColor }]} numberOfLines={1}>
                  {subtitleBase}
                  {subtitleSuffix && (
                    <Text style={{ color: hexToRGBA(textColor, 0.7) }}>{subtitleSuffix}</Text>
                  )}
                  {content.onTitlePress ? ' ›' : ''}
                </Text>
                {!!content.subtitleAction && (
                  <NativePressable
                    onPress={content.subtitleAction.onPress}
                    style={[
                      styles.subtitleActionPill,
                      {
                        backgroundColor: blendColors(
                          backgroundColor,
                          textColor,
                          0.1 + 0.15 * getRelativeLuminance(textColor)
                        ),
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.germCircleButton,
                        styles.subtitleActionLeadingIcon,
                        { backgroundColor: Colors.brand.germBrandGreen },
                      ]}
                    >
                      <GermDmIcon size={ICON_SIZES.SMALL} color={Colors.black} />
                    </View>
                    <Text
                      style={[styles.subtitleActionLabel, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {content.subtitleAction.label}
                    </Text>
                  </NativePressable>
                )}
                {!!content.subtitleSecondary && (
                  <NativePressable
                    onPress={content.onSubtitleSecondaryPress}
                    disabled={!content.onSubtitleSecondaryPress}
                  >
                    <View
                      style={[
                        styles.subtitleSecondaryPill,
                        { backgroundColor: hexToRGBA(textColor, 0.15) },
                      ]}
                    >
                      <View style={[styles.germCircleButtonSecondary, { backgroundColor: Colors.brand.germBrandGreen }]}>
                        <GermDmIcon size={ICON_SIZES.SMALL} color={Colors.black} />
                      </View>
                      <Text
                        style={[styles.subtitleSecondary, { color: hexToRGBA(textColor, 0.8) }]}
                        numberOfLines={1}
                      >
                        {(() => {
                          // Split "Blocked by [list name]" to make list name bold
                          const text = content.subtitleSecondary || '';
                          const parts = text.split(/(Blocked by )/);
                          if (parts.length === 3) {
                            return (
                              <>
                                <Text
                                  style={[
                                    styles.subtitleSecondaryRegular,
                                    { color: hexToRGBA(textColor, 0.8) },
                                  ]}
                                >
                                  {parts[1]}
                                </Text>
                                <Text
                                  style={[
                                    styles.subtitleSecondaryBold,
                                    { color: hexToRGBA(textColor, 0.8) },
                                  ]}
                                >
                                  {parts[2]}
                                </Text>
                              </>
                            );
                          }
                          return text;
                        })()}
                      </Text>
                      <OutlinkIcon size={16} color={hexToRGBA(textColor, 0.8)} />
                    </View>
                  </NativePressable>
                )}
              </View>
            );

            return content.onTitlePress ? (
              <NativePressable style={styles.subtitleRow} onPress={content.onTitlePress}>
                {subtitleColumn}
              </NativePressable>
            ) : (
              <View style={styles.subtitleRow}>{subtitleColumn}</View>
            );
          })()}

        {customDescription ||
          (content.description && (
            <TextWithLinks
              text={content.description}
              style={[styles.description, { color: textColor }]}
              onAuthorPress={navigateToAuthorProfile}
              onHashtagPress={navigateToHashtagFeed}
              facets={content.facets}
            />
          ))}
      </View>
    </View>
  );
});
HeaderContentComponent.displayName = 'HeaderContentComponent';

// Main universal header component
const UniversalHeader: React.FC<UniversalHeaderProps> = ({
  content,
  actions = [],
  customActions = [],
  showBackButton = false,
  onBackPress,
  backgroundColor = Colors.black,
  textColor = Colors.neutral[50],
  backgroundImage,
  children,
  style,
  contentStyle,
  applySafeArea = false,
  showShadowGradient = true,
  minHeight,
  contentPosition = 'top',
  hasTabs = false,
  reserveTopForOverlayButtons = false,
  contentScrollProgress,
  contentScrollFadeDisabled = false,
  scrollLinkedDimDisabled = false,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = getEffectiveTopInset(insets.top);

  const handleBackPress = useCallback(() => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  }, [onBackPress, router]);

  const headerStyle = useMemo((): ViewStyle[] => {
    const baseTopPadding = 12;
    const overlayExtraPadding = reserveTopForOverlayButtons ? 48 : 0;
    const safeAreaTop = applySafeArea ? topInset : 0;

    const baseStyles: ViewStyle[] = [
      styles.header,
      {
        backgroundColor: backgroundImage ? 'transparent' : backgroundColor,
        paddingTop: safeAreaTop + baseTopPadding + overlayExtraPadding,
      },
    ];
    if (minHeight) {
      baseStyles.push({ minHeight });
    }
    if (style) {
      baseStyles.push(StyleSheet.flatten(style) as ViewStyle);
    }
    return baseStyles;
  }, [
    backgroundColor,
    backgroundImage,
    style,
    applySafeArea,
    topInset,
    minHeight,
    reserveTopForOverlayButtons,
  ]);

  // Memoize image source to prevent flickering - same approach as Avatar component
  const imageSource = useMemo(() => {
    return backgroundImage ? { uri: backgroundImage } : null;
  }, [backgroundImage]);

  // Calculate background container style to extend beyond padding
  // If tabs are present (hashtag feed), stop the background before them (approximately 70px for tab area)
  const backgroundContainerStyle = useMemo(
    () => [
      styles.backgroundImageContainer,
      {
        top: applySafeArea ? -topInset : 0,
        // Keep a slight overlap behind tabbed nav to avoid a hard visual seam.
        ...(hasTabs && { bottom: TABBED_HEADER_BACKGROUND_CUTOFF }),
      },
    ],
    [applySafeArea, topInset, hasTabs]
  );

  const backgroundOverlayStyle = useMemo(
    () => [
      styles.backgroundOverlay,
      {
        top: applySafeArea ? -topInset : 0,
        // Keep a slight overlap behind tabbed nav to avoid a hard visual seam.
        ...(hasTabs && { bottom: TABBED_HEADER_BACKGROUND_CUTOFF }),
      },
    ],
    [applySafeArea, topInset, hasTabs]
  );

  const shadowGradientStyle = useMemo(
    () => [
      styles.shadowGradient,
      {
        top: applySafeArea ? -topInset : 0,
        // Keep a slight overlap behind tabbed nav to avoid a hard visual seam.
        ...(hasTabs && { bottom: TABBED_HEADER_BACKGROUND_CUTOFF }),
      },
    ],
    [applySafeArea, topInset, hasTabs]
  );

  // Memoize background image component separately to prevent recreation on viewMode changes
  const backgroundImageComponent = useMemo(() => {
    if (!backgroundImage || !imageSource) return null;

    return (
      <>
        <View style={backgroundContainerStyle} pointerEvents="none">
          <ImageBackground
            source={imageSource}
            style={styles.backgroundImage}
            imageStyle={styles.backgroundImageStyle}
            contentFit="cover"
            transition={0}
          />
        </View>
        {/* Dark overlay for text readability - shim gradient (dark at bottom) */}
        <View style={backgroundOverlayStyle} pointerEvents="none">
          <Image
            source={GRADIENT_SHIM}
            style={[StyleSheet.absoluteFill, styles.gradientShim]}
            contentFit="cover"
          />
          {hasTabs && (
            <Image source={GRADIENT_SHIM} style={styles.tabbedBottomSeamFade} contentFit="fill" />
          )}
        </View>
      </>
    );
  }, [backgroundImage, imageSource, backgroundContainerStyle, backgroundOverlayStyle, hasTabs]);

  // Extract custom description from children
  const customDescription = useMemo(() => {
    if (!children) return null;

    // If children is an array, look for the first element that might be a description
    if (Array.isArray(children)) {
      return children.find(
        child =>
          React.isValidElement(child) &&
          child.type &&
          typeof child.type === 'function' &&
          (child.type.name === 'TextWithLinks' ||
            (child.props as { style?: { fontFamily?: string } })?.style?.fontFamily ===
              'Figtree-Regular')
      );
    }

    // If children is a single element, check if it's a description
    if (
      React.isValidElement(children) &&
      children.type &&
      typeof children.type === 'function' &&
      (children.type.name === 'TextWithLinks' ||
        (children.props as { style?: { fontFamily?: string } })?.style?.fontFamily ===
          'Figtree-Regular')
    ) {
      return children;
    }

    return null;
  }, [children]);

  // Filter out description from children for additional content
  const additionalChildren = useMemo(() => {
    if (!children) return null;

    if (Array.isArray(children)) {
      return children.filter(
        child =>
          !React.isValidElement(child) ||
          !child.type ||
          typeof child.type !== 'function' ||
          (child.type.name !== 'TextWithLinks' &&
            (child.props as { style?: { fontFamily?: string } })?.style?.fontFamily !==
              'Figtree-Regular')
      );
    }

    if (
      React.isValidElement(children) &&
      children.type &&
      typeof children.type === 'function' &&
      (children.type.name === 'TextWithLinks' ||
        (children.props as { style?: { fontFamily?: string } })?.style?.fontFamily ===
          'Figtree-Regular')
    ) {
      return null;
    }

    return children;
  }, [children]);

  const contentContainerStyle = useMemo((): ViewStyle[] => {
    const baseStyles: ViewStyle[] = [styles.content];
    if (contentPosition === 'center') {
      baseStyles.push(styles.contentCenter);
    }
    if (contentPosition === 'bottom') {
      baseStyles.push(styles.contentBottom);
    }
    if (contentPosition === 'space-between') {
      baseStyles.push(styles.contentSpaceBetween);
    }
    if (contentStyle) {
      baseStyles.push(StyleSheet.flatten(contentStyle) as ViewStyle);
    }
    return baseStyles;
  }, [contentPosition, contentStyle]);

  const { contentAnimatedStyle, scrollDimAnimatedStyle } = useDetailHeaderScrollPresentation({
    contentScrollProgress,
    contentScrollFadeDisabled,
    scrollLinkedDimDisabled,
  });

  const headerContent = (
    <>
      {/* Navigation and Action Buttons - Always at top, independent of content position */}
      {(showBackButton || actions.length > 0 || customActions.length > 0) && (
        <View style={styles.topRow}>
          <View style={styles.leftSection}>
            {showBackButton && (
              <NativePressable style={styles.backButton} onPress={handleBackPress}>
                <BackArrowIcon size={30} color={textColor} />
              </NativePressable>
            )}
          </View>

          <View style={styles.rightSection}>
            {actions.length > 0 && (
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => {
                  const n = actions.length;
                  return (
                    <View
                      key={action.id}
                      style={[
                        styles.headerActionStackSlot,
                        { zIndex: n - index, elevation: (n - index) * 2 },
                      ]}
                    >
                      <ActionButton
                        action={action}
                        textColor={textColor}
                        backgroundColor={backgroundColor}
                      />
                    </View>
                  );
                })}
              </View>
            )}

            {/* Custom Action Layouts */}
            {customActions.map((layout, index) => (
              <CustomActionLayoutComponent
                key={`custom-action-${index}`}
                layout={layout}
                textColor={textColor}
                backgroundColor={backgroundColor}
              />
            ))}
          </View>
        </View>
      )}

      {/* Content container - Positioned based on contentPosition prop */}
      <Animated.View
        style={[contentContainerStyle, contentAnimatedStyle]}
        pointerEvents="box-none"
        collapsable={false}
      >
        {/* Header Content */}
        <HeaderContentComponent
          content={content}
          textColor={textColor}
          backgroundColor={backgroundColor}
          customDescription={customDescription}
        />

        {/* Additional Children */}
        {additionalChildren}
      </Animated.View>
    </>
  );

  return (
    <Animated.View style={headerStyle} pointerEvents="box-none" collapsable={false}>
      {backgroundImageComponent}
      {/* Shadow gradient shim - always visible, positioned just above background image */}
      {showShadowGradient && (
        <View style={shadowGradientStyle} pointerEvents="none">
          <Image
            source={GRADIENT_SHIM}
            style={[StyleSheet.absoluteFill, styles.gradientShim]}
            contentFit="cover"
          />
        </View>
      )}
      {headerContent}
      <Animated.View style={[scrollDimAnimatedStyle, { zIndex: 3 }]} collapsable={false} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    position: 'relative',
    width: '100%',
    backgroundColor: Colors.transparent,
    minHeight: 120,
    overflow: 'visible',
    flexDirection: 'column',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    minHeight: 40,
    // Add layout stability to prevent jitter
    zIndex: 2,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
    zIndex: 1,
  },
  /** Earlier actions (e.g. follow) paint above later siblings during width layout animation. */
  headerActionStackSlot: {
    position: 'relative',
  },
  actionButton: {
    borderRadius: BORDER_RADIUS.FULL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: 'center',
  },
  actionButtonNoShadow: {
    borderRadius: BORDER_RADIUS.FULL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: Colors.transparent,
    shadowColor: Colors.transparent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  followContentCrossfade: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followContentSizer: {
    opacity: 0,
  },
  followContentLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Labeled actions with an icon (leading or trailing) share row spacing. */
  labeledActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    maxWidth: '100%',
  },
  labeledActionLeadingIconCap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -2,
  },
  labeledActionTextOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  actionPillLabel: {
    textAlign: 'left',
    flexShrink: 1,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  actionPillLabelCentered: {
    textAlign: 'center',
    flexShrink: 1,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  iconOnlyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
    fontSize: 17,
  },
  actionTextBold: {
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
    fontSize: 17,
  },
  actionButtonGlassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  inlineBadgesContainerCentered: {
    justifyContent: 'center',
  },
  customActionsLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
  },
  customActionsLayoutLeft: {
    left: 20,
    right: 'auto',
  },
  menuIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonGroupContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  contentContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: -4,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 0,
  },
  hiddenAvatar: {
    opacity: 0,
    pointerEvents: 'none',
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRoundedSquare: {
    borderRadius: BORDER_RADIUS.LARGE,
  },
  textContainer: {
    width: '100%',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
  },
  inlineTitleContainer: {
    position: 'relative',
    flexShrink: 1,
  },
  inlineBadgesContainer: {
    position: 'absolute',
  },
  inlineBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  badgeMargin: {
    marginLeft: 6,
  },
  textContainerNoMargin: {
    marginBottom: 0,
  },
  subtitleColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: 'Figtree-Black',
    fontSize: 30,
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 0,
    marginBottom: 15,
    fontFamily: 'Figtree-Medium',
    fontSize: 18,
  },
  subtitleSecondaryPill: {
    marginTop: 4,
    marginBottom: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.FULL,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtitleActionPill: {
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.FULL,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleActionLeadingIcon: {
    marginRight: 4,
  },
  subtitleActionTrailingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 0,
    marginRight: -4,
    marginVertical: -6,
  },
  subtitleActionLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.bodySmall,
  },
  germCircleButton: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.FULL,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    marginRight: 4,
    marginTop: -3,
    marginBottom: -3,
  },
  germCircleButtonSecondary: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.FULL,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  subtitleSecondary: {
    fontSize: 14,
    letterSpacing: 0,
  },
  subtitleSecondaryRegular: {
    fontFamily: 'Figtree-Medium',
    fontSize: 14,
    letterSpacing: 0,
  },
  subtitleSecondaryBold: {
    fontFamily: 'Figtree-Bold',
    fontSize: 14,
    letterSpacing: 0,
  },
  description: {
    marginTop: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Figtree-Medium',
    fontSize: 17,
  },
  content: {
    width: '100%',
    zIndex: 2,
    flex: 1,
  },
  contentCenter: {
    justifyContent: 'center',
  },
  contentBottom: {
    justifyContent: 'flex-end',
  },
  contentSpaceBetween: {
    justifyContent: 'space-between',
  },
  shadowGradient: {
    position: 'absolute',
    top: 0,
    left: -20,
    right: -20,
    bottom: 0,
    zIndex: 1,
    overflow: 'hidden',
  },
  gradientShim: {
    transform: [{ scaleY: -1 }],
    opacity: 1.0,
  },
  tabbedBottomSeamFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
    transform: [{ scaleY: -1 }],
    opacity: 0.9,
  },
  backgroundImageContainer: {
    position: 'absolute',
    top: 0,
    left: -20,
    right: -20,
    bottom: 0,
    zIndex: 0,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    // contentFit is set as a prop on ImageBackground, not in style
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: -20,
    right: -20,
    bottom: 0,
    zIndex: 1,
    overflow: 'hidden',
  },
});

export default memo(UniversalHeader);
