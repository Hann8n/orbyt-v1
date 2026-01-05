declare let window: any;

import React, { memo, useCallback, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { ImageBackground } from 'expo-image';
import Animated, { type SharedValue, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, MoreFillIcon, Loading3FillIcon } from '../../ui/Icon';
import { useRouter } from 'expo-router';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import { Avatar } from '../../ui/UI';
import { Colors } from '../../ui/UI';
import { splitHandleSuffix } from '../../../utils/helpers';
import { TextWithLinks } from '../../ui/TextWithLinks';
import type { RichTextFacet } from '../../../utils/richTextParser';

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
  description?: string;
  facets?: RichTextFacet[];
  badge?: React.ReactNode;
  onAvatarPress?: () => void;
  onTitlePress?: () => void;
  avatarStyle?: 'circle' | 'rounded-square';
  hideAvatar?: boolean;
  avatarBlurRadius?: number;
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
  style?: any;
  contentStyle?: any;
  applySafeArea?: boolean;
  showShadowGradient?: boolean;
  minHeight?: number;
  contentPosition?: 'top' | 'center' | 'bottom' | 'space-between';
  hasTabs?: boolean; // Indicates if tab navigation is present (for hashtag feeds)
  reserveTopForOverlayButtons?: boolean; // Adds extra top padding so overlay buttons don't overlap content
  contentScrollProgress?: SharedValue<number>; // Optional shared value to fade header content (text/avatar/tabs) on scroll
}

// Memoized action button component for performance
const ActionButton = memo<{
  action: HeaderAction;
  textColor: string;
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
}>(({ action, textColor, backgroundColor, size = 'medium' }) => {
  const hasFilledBackground = useMemo(() => {
    const isFollowingState = action.label === 'Following' || action.label === 'Mutuals';
    const isIconOnlyFollowingState = (action.id === 'follow' && !action.label);
    const isSaveButton = action.id === 'save';
    const isActiveSubscription = action.id === 'subscription' && action.active;
    return isFollowingState || isIconOnlyFollowingState || isSaveButton || isActiveSubscription;
  }, [action.label, action.id, action.active]);

  // Freeze hasFilledBackground when press starts to prevent flash during async state updates
  const frozenHasFilledBackgroundRef = useRef<boolean | null>(null);

  const getButtonStyle = useCallback((pressed: boolean = false, frozenValue: boolean | null = null) => {
    const label = (action.label || '').toLowerCase();
    const isEdit = action.id === 'edit' || label.includes('edit');
    const isFollowButton = action.id === 'follow' || label === 'follow' || label === 'following' || label === 'mutuals';
    const isSubscribeButton = action.id === 'subscription';
    
    // Use frozen value if provided (during press), otherwise use current value
    const baselineFilled = frozenValue !== null ? frozenValue : hasFilledBackground;
    // When pressed, show opposite state by inverting baseline; when not pressed, use current value
    const showFilledState = pressed ? !baselineFilled : hasFilledBackground;
    
    const baseStyle = {
      backgroundColor: showFilledState ? textColor : hexToRGBA(textColor, 0.2),
      borderColor: showFilledState ? textColor : hexToRGBA(textColor, 0.3),
      ...((isEdit || isFollowButton || isSubscribeButton) && { borderWidth: 0 }),
    };

    switch (action.variant) {
      case 'danger':
        return { ...baseStyle, backgroundColor: pressed ? hexToRGBA('#ff4444', 0.4) : hexToRGBA('#ff4444', 0.2) };
      case 'secondary':
        return { 
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
      default:
        return baseStyle;
    }
  }, [action.variant, textColor, backgroundColor, action.label, action.id, hasFilledBackground]);

  const getContentColor = useCallback((pressed: boolean = false, frozenValue: boolean | null = null) => {
    // Use frozen value if provided (during press), otherwise use current value
    const baselineFilled = frozenValue !== null ? frozenValue : hasFilledBackground;
    // When pressed, show opposite state by inverting baseline
    const showFilledState = pressed ? !baselineFilled : hasFilledBackground;
    return showFilledState ? backgroundColor : textColor;
  }, [textColor, backgroundColor, hasFilledBackground]);

  const getButtonSize = useCallback(() => {
    const isFollowButton = action.id === 'follow';
    
    // Follow button with label should match the combined width of following + gap + subscribed buttons
    // Following button: 50px, gap: 8px, subscribed button: 50px = 108px total
    if (isFollowButton && action.label) {
      switch (size) {
        case 'small':
          return { width: 84, height: 32, borderRadius: 100 }; // 40 + 8 + 40
        case 'large':
          return { width: 120, height: 48, borderRadius: 100 }; // 56 + 8 + 56
        default:
          return { width: 108, height: 44, borderRadius: 100 }; // 50 + 8 + 50
      }
    }
    
    // Icon-only buttons should be circular/pill-shaped
    if (!action.label) {
      switch (size) {
        case 'small':
          return { width: 40, height: 32, borderRadius: 100 };
        case 'large':
          return { width: 56, height: 48, borderRadius: 100 };
        default:
          return { width: 50, height: 44, borderRadius: 100 };
      }
    }
    
    switch (size) {
      case 'small':
        return { paddingHorizontal: 12, paddingVertical: 6, minWidth: 70, height: 32 };
      case 'large':
        return { paddingHorizontal: 24, paddingVertical: 12, minWidth: 110, height: 48 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 8, minWidth: 90, height: 44 };
    }
  }, [size, action.label, action.id]);

  const renderContent = useCallback((pressed: boolean, frozenValue: boolean | null = null) => {
    const contentColor = getContentColor(pressed, frozenValue);
    
    if (action.loading) {
      return (
        <Loading3FillIcon 
          size={24} 
          color={contentColor} 
        />
      );
    }
    
    if (action.label) {
      return (
        <View style={styles.actionContent} pointerEvents="none">
          <Text style={[styles.actionText, { 
            color: contentColor,
            fontFamily: (action.variant === 'secondary' || action.id === 'save') ? 'Firma-Bold' : 'Firma-SemiBold'
          }]}>
            {action.label}
          </Text>
          {action.customIcon ? (
            React.isValidElement(action.customIcon) && action.customIcon.props && typeof action.customIcon.props === 'object' && 'color' in action.customIcon.props
              ? React.cloneElement(action.customIcon as React.ReactElement<any>, { color: contentColor })
              : action.customIcon
          ) : action.icon ? (
            <Icon 
              name={action.icon} 
              size={16} 
              color={contentColor} 
              strokeWidth={2.5} 
            />
          ) : null}
        </View>
      );
    }
    
    // Icon-only button
    return (
      <View style={styles.iconOnlyContent} pointerEvents="none">
        {action.customIcon ? (
          React.isValidElement(action.customIcon) && action.customIcon.props && typeof action.customIcon.props === 'object' && 'color' in action.customIcon.props
            ? React.cloneElement(action.customIcon as React.ReactElement<any>, { color: contentColor })
            : action.customIcon
        ) : action.icon ? (
          <Icon 
            name={action.icon} 
            size={20} 
            color={contentColor} 
            strokeWidth={2.5} 
          />
        ) : null}
      </View>
    );
  }, [action, getContentColor]);

  return (
    <Pressable
      style={({ pressed }) => {
        const frozenValue = frozenHasFilledBackgroundRef.current;
        return [styles.actionButton, getButtonStyle(pressed, frozenValue), getButtonSize()];
      }}
      onPressIn={() => {
        // Freeze the current state when press starts
        frozenHasFilledBackgroundRef.current = hasFilledBackground ?? false;
      }}
      onPressOut={() => {
        // Clear frozen value when press ends
        frozenHasFilledBackgroundRef.current = null;
      }}
      onPress={action.onPress}
      onLongPress={action.onLongPress}
      delayLongPress={action.delayLongPress}
      disabled={action.disabled || action.loading}
    >
      {({ pressed }) => {
        const frozenValue = frozenHasFilledBackgroundRef.current;
        return renderContent(pressed, frozenValue);
      }}
    </Pressable>
  );
});

// Re-exported for use in overlay layouts (e.g., profile screen) to keep visuals 1:1
export const HeaderActionButton = ActionButton;

// Memoized custom action layout component
const CustomActionLayout = memo<{
  layout: CustomActionLayout;
  textColor: string;
  backgroundColor: string;
}>(({ layout, textColor, backgroundColor }) => {
  const renderMenuIcon = useCallback(() => {
    if (!layout.menuIcon) return null;
    
    return (
      <Pressable
        style={styles.menuIconButton}
        onPress={layout.menuIcon.onPress}
      >
        <MoreFillIcon 
          size={layout.menuIcon.size || 24} 
          color={textColor} 
        />
      </Pressable>
    );
  }, [layout.menuIcon, textColor]);

  const renderButtons = useCallback(() => {
    if (layout.type === 'button' && layout.buttons) {
      return (
        <View style={styles.buttonContainer}>
          {layout.buttons.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              textColor={textColor}
              backgroundColor={backgroundColor}
            />
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

// Inline title that places badges exactly at the end of the last line
const InlineTitleWithBadges: React.FC<{
  title: string;
  titleStyle: any;
  badges?: React.ReactNode[];
}> = ({ title, titleStyle, badges = [] }) => {
  const [lines, setLines] = React.useState<Array<{ x: number; y: number; width: number; height: number }>>([]);

  const handleTextLayout = useCallback((e: any) => {
    const l = e?.nativeEvent?.lines || [];
    if (l.length) setLines(l.map((ln: any) => ({ x: ln.x, y: ln.y, width: ln.width, height: ln.height })));
  }, []);

  const last = lines.length ? lines[lines.length - 1] : null;
  const spacing = 0; // spacing is controlled by VerificationBadge
  const badgeTop = last ? last.y : 0; // align container to line top
  const badgeLeft = last ? last.x + last.width + spacing : 0;

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
            { left: badgeLeft, top: badgeTop, height: last.height, justifyContent: 'center' }
          ]}
        > 
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
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
  const navigation = useRouter();

  const navigateToAuthorProfile = useCallback((handle: string) => {
    const clean = handle.trim();
    // Require a dot to resemble a valid Bluesky handle (e.g., name.bsky.social)
    if (!clean || !clean.includes('.')) return;
    
    navigation.push(`/profile/${clean}`);
  }, [navigation]);

  const navigateToHashtagFeed = useCallback((hashtag: string) => {
    navigation.push({
      pathname: '/(modals)/feed',
      params: {
        feedOption: `hashtag:${hashtag}`,
        backgroundColor: '#000000',
        searchQuery: `#${hashtag}`,
      }
    });
  }, [navigation]);

  // Don't render empty content
  if (!content.title && !content.avatar && !content.customTitle) {
    return null;
  }

  return (
    <View style={styles.contentContainer}>
            <View style={styles.avatarContainer}>
        <Pressable
          style={[
            styles.avatar, 
            content.avatarStyle === 'rounded-square' && styles.avatarRoundedSquare,
            content.hideAvatar && styles.hiddenAvatar
          ]}
          onPress={content.onAvatarPress}
        >
          {!content.hideAvatar && (
            <Avatar
              uri={content.avatar}
              type={content.avatarStyle === 'rounded-square' ? 'channel' : 'profile'}
              size={120}
              profileColors={{ backgroundColor, textColor, foregroundColor: textColor }}
              showRing={true}
              blurRadius={content.avatarBlurRadius}
            />
          )}
        </Pressable>
      </View>
      
      <View style={[styles.textContainer, (!customDescription && !content.description) && { marginBottom: 0 }]}>
        <Pressable
          style={styles.titleRow}
          onPress={content.onTitlePress}
        >
            {content.customTitle ? (
              <View style={styles.titleRow}>
                {content.customTitle}
                {content.badge && (
                  <View style={{ marginLeft: 6 }}>
                    {content.badge}
                  </View>
                )}
              </View>
            ) : (
              <InlineTitleWithBadges 
                title={content.title}
                titleStyle={[styles.title, { color: textColor }]}
                badges={[content.badge as React.ReactNode]}
              />
            )}
          </Pressable>
        
        {!!content.subtitle && (() => {
          const { handleBase: subtitleBase, handleSuffix: subtitleSuffix } = splitHandleSuffix(content.subtitle);
          
          return (
            <Pressable
              style={styles.subtitleRow}
              onPress={content.onTitlePress}
            >
              <View style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <Text
                  style={[styles.subtitle, { color: textColor }]}
                  numberOfLines={1}
                >
                  {subtitleBase}
                  {subtitleSuffix && (
                    <Text style={{ color: hexToRGBA(textColor, 0.70) }}>
                      {subtitleSuffix}
                    </Text>
                  )}
                  {content.onTitlePress ? ' ›' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })()}
        
        {customDescription || (content.description && (
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

// Main universal header component
const UniversalHeader: React.FC<UniversalHeaderProps> = ({
  content,
  actions = [],
  customActions = [],
  showBackButton = false,
  onBackPress,
  backgroundColor = '#000',
  textColor = '#fff',
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
}) => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();

  const handleBackPress = useCallback(() => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.back();
    }
  }, [onBackPress, navigation]);

  const headerStyle = useMemo(() => {
    const baseTopPadding = 12;
    const overlayExtraPadding = reserveTopForOverlayButtons ? 48 : 0;
    const safeAreaTop = applySafeArea ? insets.top : 0;

    return [
      styles.header,
      { 
        backgroundColor: backgroundImage ? 'transparent' : backgroundColor,
        paddingTop: safeAreaTop + baseTopPadding + overlayExtraPadding,
      },
      minHeight && { minHeight },
      style,
    ];
  }, [backgroundColor, backgroundImage, style, applySafeArea, insets.top, minHeight, reserveTopForOverlayButtons]);

  // Memoize image source to prevent flickering - same approach as Avatar component
  const imageSource = useMemo(() => {
    return backgroundImage ? { uri: backgroundImage } : null;
  }, [backgroundImage]);

  // Calculate background container style to extend beyond padding
  // If tabs are present (hashtag feed), stop the background before them (approximately 70px for tab area)
  const backgroundContainerStyle = useMemo(() => [
    styles.backgroundImageContainer,
    {
      top: applySafeArea ? -insets.top : 0,
      ...(hasTabs && { bottom: 70 }), // Stop before tab navigation
    }
  ], [applySafeArea, insets.top, hasTabs]);

  const backgroundOverlayStyle = useMemo(() => [
    styles.backgroundOverlay,
    {
      top: applySafeArea ? -insets.top : 0,
      ...(hasTabs && { bottom: 70 }), // Stop before tab navigation
    }
  ], [applySafeArea, insets.top, hasTabs]);

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
        {/* Dark overlay for text readability - fully black at bottom, lighter in center, fades to 10% at top */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 1.0)']}
          locations={[0, 0.5, 1]}
          style={backgroundOverlayStyle}
          pointerEvents="none"
        />
      </>
    );
  }, [backgroundImage, imageSource, backgroundContainerStyle, backgroundOverlayStyle]);

  // Extract custom description from children
  const customDescription = useMemo(() => {
    if (!children) return null;
    
    // If children is an array, look for the first element that might be a description
    if (Array.isArray(children)) {
      return children.find(child => 
        React.isValidElement(child) && 
        child.type && 
        typeof child.type === 'function' &&
        (child.type.name === 'TextWithLinks' || (child.props as any)?.style?.fontFamily === 'Firma-Regular')
      );
    }
    
    // If children is a single element, check if it's a description
    if (React.isValidElement(children) && 
        children.type && 
        typeof children.type === 'function' &&
        (children.type.name === 'TextWithLinks' || (children.props as any)?.style?.fontFamily === 'Firma-Regular')) {
      return children;
    }
    
    return null;
  }, [children]);

  // Filter out description from children for additional content
  const additionalChildren = useMemo(() => {
    if (!children) return null;
    
    if (Array.isArray(children)) {
      return children.filter(child => 
        !React.isValidElement(child) || 
        !child.type || 
        typeof child.type !== 'function' ||
        (child.type.name !== 'TextWithLinks' && (child.props as any)?.style?.fontFamily !== 'Firma-Regular')
      );
    }
    
    if (React.isValidElement(children) && 
        children.type && 
        typeof children.type === 'function' &&
        (children.type.name === 'TextWithLinks' || (children.props as any)?.style?.fontFamily === 'Firma-Regular')) {
      return null;
    }
    
    return children;
  }, [children]);

  const contentContainerStyle = useMemo(() => [
    styles.content,
    contentPosition === 'center' && styles.contentCenter,
    contentPosition === 'bottom' && styles.contentBottom,
    contentPosition === 'space-between' && styles.contentSpaceBetween,
    contentStyle,
  ], [contentPosition, contentStyle]);

  // Optional animated style to fade out header content (text/image/tabs) with shared scroll progress
  const contentAnimatedStyle = useAnimatedStyle(() => {
    const progress = contentScrollProgress?.value ?? 0;
    // More gradual fade: keep fully visible until 50% scroll, then fade to 0 over remaining 50%
    const opacity = interpolate(progress, [0, 0.5, 1], [1, 1, 0.02], Extrapolate.CLAMP);
    return { opacity };
  }, [contentScrollProgress]);

  const headerContent = (
    <>
      {/* Navigation and Action Buttons - Always at top, independent of content position */}
      {(showBackButton || actions.length > 0 || customActions.length > 0) && (
        <View style={styles.topRow}>
          <View style={styles.leftSection}>
            {showBackButton && (
              <Pressable
                style={styles.backButton}
                onPress={handleBackPress}
              >
                <BackArrowIcon size={30} color={textColor} />
              </Pressable>
            )}
          </View>
          
          <View style={styles.rightSection}>
            {actions.length > 0 && (
              <View style={styles.actionsContainer}>
                {actions.map((action) => (
                  <ActionButton
                    key={action.id}
                    action={action}
                    textColor={textColor}
                    backgroundColor={backgroundColor}
                  />
                ))}
              </View>
            )}

            {/* Custom Action Layouts */}
            {customActions.map((layout, index) => (
              <CustomActionLayout
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
      
      {/* Black shadow gradient at bottom - under all UI */}
      {showShadowGradient && (
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
          style={styles.shadowGradient}
          pointerEvents="none"
        />
      )}
    </>
  );

  return (
    <Animated.View style={headerStyle} pointerEvents="box-none" collapsable={false}>
      {backgroundImageComponent}
      {headerContent}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    position: 'relative',
    width: '100%',
    backgroundColor: 'transparent',
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
  actionButton: {
    borderRadius: BORDER_RADIUS.FULL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: 'center',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconOnlyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Firma-SemiBold',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 17,
  },
  glassContainer: {
    borderRadius: BORDER_RADIUS.FULL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassTouchable: {
    borderRadius: BORDER_RADIUS.FULL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    width: '100%',
    height: '100%',
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
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.FULL,
  },
  avatarImageRoundedSquare: {
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  chevronContainer: {
    marginLeft: 4,
  },
  title: {
    fontFamily: 'Firma-Black',
    fontWeight: 'bold',
    fontSize: 30,
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 0,
    marginBottom: 15,
    fontFamily: 'Firma-Medium',
    fontSize: 18,
  },
  subtitleSecondary: {
    marginTop: 0,
    marginBottom: 15,
    fontFamily: 'Firma-Regular',
    fontSize: 14,
  },
  description: {
    marginTop: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Firma-Medium',
    fontSize: 17,
  },
  content: {
    width: '100%',
    zIndex: 1,
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
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
    zIndex: 0,
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
  },
});

export default memo(UniversalHeader); 