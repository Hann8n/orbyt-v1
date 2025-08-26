declare let window: any;

import React, { memo, useCallback, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Text, Image, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, MoreFillIcon } from '../../ui/Icon';
import { useNavigation } from '@react-navigation/native';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import { Avatar } from '../../ui/UI';
import { Colors } from '../../ui/UI';
import { isSmallScreen, isTablet } from '../../../utils/helpers/screenSize';
import { TextWithLinks } from '../../ui/TextWithLinks';

// Types for the universal header system
export interface HeaderAction {
  id: string;
  label: string;
  icon?: string;
  customIcon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface HeaderContent {
  avatar?: string;
  title: string;
  onTitleChange?: (text: string) => void;
  subtitle?: string;
  description?: string;
  badge?: React.ReactNode;
  onAvatarPress?: () => void;
  onTitlePress?: () => void;
  isEditMode?: boolean;
  avatarStyle?: 'circle' | 'rounded-square';
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
  isLoading?: boolean;
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
  style?: any;
  contentStyle?: any;
  showGradient?: boolean;
  gradientType?: 'default' | 'channel';
  mixIcon?: {
    isInMix: boolean;
    isExcluded: boolean;
    onPress: () => void;
  };
  applySafeArea?: boolean;
}

// Memoized action button component for performance
const ActionButton = memo<{
  action: HeaderAction;
  textColor: string;
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
}>(({ action, textColor, backgroundColor, size = 'medium' }) => {
  const getButtonStyle = useCallback(() => {
    // Check if this is a following state (Following, Mutuals, etc.) or save button in edit mode
    const isFollowingState = action.label === 'Following' || action.label === 'Mutuals';
    const isSaveButton = action.id === 'save';
    
    const baseStyle = {
      backgroundColor: (isFollowingState || isSaveButton) ? textColor : hexToRGBA(textColor, 0.2),
      borderColor: (isFollowingState || isSaveButton) ? textColor : hexToRGBA(textColor, 0.3),
    };

    switch (action.variant) {
      case 'danger':
        return { ...baseStyle, backgroundColor: hexToRGBA('#ff4444', 0.2) };
      case 'secondary':
        return { 
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
      default:
        return baseStyle;
    }
  }, [action.variant, textColor, action.label, action.id]);

  const getButtonSize = useCallback(() => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: 12, paddingVertical: 6, minWidth: 70, height: 32 };
      case 'large':
        return { paddingHorizontal: 24, paddingVertical: 12, minWidth: 110, height: 48 };
      default:
        return { paddingHorizontal: 16, paddingVertical: 8, minWidth: 90, height: 44 };
    }
  }, [size]);

  return (
    <TouchableOpacity
      style={[styles.actionButton, getButtonStyle(), getButtonSize()]}
      onPress={action.onPress}
      disabled={action.disabled || action.loading}
      activeOpacity={0.7}
    >
      {action.loading ? (
        <ActivityIndicator 
          size="small" 
          color={(action.label === 'Following' || action.label === 'Mutuals' || action.id === 'save') ? backgroundColor : textColor} 
        />
      ) : (
        <View style={styles.actionContent}>
          <Text style={[styles.actionText, { 
            color: (action.label === 'Following' || action.label === 'Mutuals' || action.id === 'save') ? backgroundColor : textColor,
            fontFamily: (action.variant === 'secondary' || action.id === 'save') ? 'Firma-Bold' : 'Firma-SemiBold'
          }]}>
            {action.label}
          </Text>
          {action.customIcon ? (
            action.customIcon
          ) : action.icon ? (
            <Icon 
              name={action.icon} 
              size={16} 
              color={(action.label === 'Following' || action.label === 'Mutuals' || action.id === 'save') ? backgroundColor : textColor} 
              strokeWidth={2.5} 
            />
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
});

// Memoized custom action layout component
const CustomActionLayout = memo<{
  layout: CustomActionLayout;
  textColor: string;
  backgroundColor: string;
}>(({ layout, textColor, backgroundColor }) => {
  const renderMenuIcon = useCallback(() => {
    if (!layout.menuIcon) return null;
    
    return (
      <TouchableOpacity
        style={styles.menuIconButton}
        onPress={layout.menuIcon.onPress}
        activeOpacity={0.7}
      >
        <MoreFillIcon 
          size={layout.menuIcon.size || 24} 
          color={textColor} 
        />
      </TouchableOpacity>
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

// Memoized header content component
const HeaderContentComponent = memo<{
  content: HeaderContent;
  textColor: string;
  backgroundColor: string;
  isLoading?: boolean;
  skeleton?: React.ReactNode;
  customDescription?: React.ReactNode;
  mixIcon?: {
    isInMix: boolean;
    isExcluded: boolean;
    onPress: () => void;
  };
}>(({ content, textColor, backgroundColor, isLoading, skeleton, customDescription, mixIcon }) => {
  const navigation = useNavigation();

  const navigateToAuthorProfile = useCallback((handle: string) => {
    const clean = handle.trim();
    // Require a dot to resemble a valid Bluesky handle (e.g., name.bsky.social)
    if (!clean || !clean.includes('.')) return;
    
    let rootNav: any = navigation;
    while (rootNav?.getParent?.()) {
      rootNav = rootNav.getParent();
    }
    rootNav?.navigate?.('AuthorProfile', { handle: clean });
  }, [navigation]);

  if (isLoading && skeleton) {
    return skeleton;
  }

  // Create mix icon badge
  const mixIconBadge = mixIcon ? (
    <TouchableOpacity
      style={styles.mixIconContainer}
      onPress={mixIcon.onPress}
      activeOpacity={0.7}
    >
      <Icon 
        name="shuffle" 
        size={20} 
        color={
          mixIcon.isExcluded ? Colors.red : 
          (mixIcon.isInMix && !mixIcon.isExcluded ? Colors.lightGreen : hexToRGBA(textColor, 0.6))
        } 
      />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.contentContainer}>
            <View style={styles.avatarContainer}>
        <TouchableOpacity
          style={[
            styles.avatar, 
            content.avatarStyle === 'rounded-square' && styles.avatarRoundedSquare
          ]}
          onPress={content.onAvatarPress}
          activeOpacity={content.onAvatarPress ? 0.7 : 1}
        >
          <Avatar
            uri={content.avatar}
            type={content.avatarStyle === 'rounded-square' ? 'channel' : 'profile'}
            size={100}
            profileColors={{ backgroundColor, textColor, foregroundColor: textColor }}
            style={[
              styles.avatarImage,
              content.avatarStyle === 'rounded-square' && styles.avatarImageRoundedSquare,
              { borderWidth: 3 }
            ]}
          />
        </TouchableOpacity>
        {content.onAvatarPress && (
          <View style={styles.uploadSection}>
            <Text style={[styles.editSubheader, { color: hexToRGBA(textColor, 0.75) }]}>
              PROFILE PICTURE
            </Text>
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: hexToRGBA(textColor, 0.2),
                  borderColor: hexToRGBA(textColor, 0.3),
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  minWidth: 90,
                  height: 44,
                }
              ]}
              onPress={content.onAvatarPress}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionText, { color: textColor }]}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {content.isEditMode && (
        <View style={[styles.dividerContainer, { marginLeft: -20, marginRight: -20 }]}>
          <View style={[styles.divider, { backgroundColor: hexToRGBA(textColor, 0.2) }]} />
        </View>
      )}
      
      <View style={styles.textContainer}>
        {content.isEditMode && (
          <Text style={[styles.editSubheader, { color: hexToRGBA(textColor, 0.67) }]}>
            DISPLAY NAME
          </Text>
        )}
        {content.isEditMode ? (
          <TextInput
            style={[styles.title, styles.editTitle, { color: textColor, marginTop: 2 }]}
            value={content.title}
            placeholder="Enter display name..."
            placeholderTextColor={hexToRGBA(textColor, 0.5)}
            maxLength={64}
            onChangeText={content.onTitleChange}
          />
        ) : (
          <TouchableOpacity
            style={styles.titleRow}
            onPress={content.onTitlePress}
            activeOpacity={content.onTitlePress ? 0.7 : 1}
          >
            <Text style={[styles.title, { color: textColor }]}>
              {content.title}
            </Text>
            {mixIconBadge}
            {content.badge}
          </TouchableOpacity>
        )}
        
        {content.subtitle && (
          <TouchableOpacity
            style={styles.subtitleRow}
            onPress={content.onTitlePress}
            activeOpacity={content.onTitlePress ? 0.7 : 1}
          >
            <Text style={[styles.subtitle, { color: hexToRGBA(textColor, 0.67) }]} numberOfLines={1}>
              {content.subtitle}{content.onTitlePress ? ' ›' : ''}
            </Text>
          </TouchableOpacity>
        )}
        
        {customDescription || (content.description && (
          <TextWithLinks
            text={content.description}
            style={[styles.description, { color: hexToRGBA(textColor, 0.75) }]}
            onAuthorPress={navigateToAuthorProfile}
            parseUrls={true}
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
  isLoading = false,
  skeleton,
  children,
  style,
  contentStyle,
  showGradient = true,
  gradientType = 'default',
  mixIcon,
  applySafeArea = false,
}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isSmallDevice = isSmallScreen() || isTablet();

  const handleBackPress = useCallback(() => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  }, [onBackPress, navigation]);

  const headerStyle = useMemo(() => [
    styles.header,
    { 
      backgroundColor,
      ...(applySafeArea && { paddingTop: insets.top }),
    },
    style,
  ], [backgroundColor, style, applySafeArea, insets.top]);

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

  const gradientColors = useMemo((): [string, string, string] => {
    if (gradientType === 'channel') {
      // More intense gradient for channels to work better with light text, but still goes to 100% at bottom
      return ['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,1)'];
    }
    return ['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,1)'];
  }, [gradientType]);

  return (
    <Animated.View style={headerStyle} pointerEvents="box-none" collapsable={false}>
      {/* Fade to black gradient - conditionally visible */}
      {showGradient && (
        <LinearGradient
          colors={gradientColors}
          style={styles.fadeGradient}
          pointerEvents="none"
        />
      )}
      {/* Content container */}
      <Animated.View style={[styles.content, contentStyle]} pointerEvents="box-none" collapsable={false}>
        {/* Navigation and Action Buttons */}
        <View style={styles.topRow}>
        <View style={styles.leftSection}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.7}
            >
              <BackArrowIcon size={30} color={textColor} />
            </TouchableOpacity>
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

      {/* Header Content */}
      <HeaderContentComponent
        content={content}
        textColor={textColor}
        backgroundColor={backgroundColor}
        isLoading={isLoading}
        skeleton={skeleton}
        customDescription={customDescription}
        mixIcon={mixIcon}
      />

      {/* Additional Children */}
      {additionalChildren}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    position: 'relative',
    width: '100%',
    backgroundColor: 'transparent',
    minHeight: 120,
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
    gap: 4,
  },
  actionText: {
    fontFamily: 'Firma-SemiBold',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 17,
  },
  customActionsLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    gap: 20,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: BORDER_RADIUS.FULL,
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
    alignItems: 'center',
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
    fontSize: 28,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 15,
    fontFamily: 'Firma-Medium',
    fontSize: 18,
  },
  description: {
    marginTop: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Firma-Medium',
    fontSize: 16,
  },
  editAvatarOverlay: {
    position: 'absolute',
    top: '50%',
    right: -16,
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.FULL,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    transform: [{ translateY: -16 }],
  },
  uploadSection: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  uploadLabel: {
    fontFamily: 'Firma-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 4,
  },
  editAvatarButton: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  editAvatarOverlayRoundedSquare: {
    borderRadius: BORDER_RADIUS.LARGE,
    top: '50%',
    right: -16,
    transform: [{ translateY: -16 }],
  },
  content: {
    width: '100%',
    zIndex: 1,
  },
  fadeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '85%', // Extended gradient to cover more of the header
    zIndex: 0, // Above background but below UI elements
  },
  mixIconContainer: {
    marginLeft: 8,
  },
  dividerContainer: {
    marginTop: 6,
    marginBottom: 6,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  editSubheader: {
    fontFamily: 'Firma-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    marginTop: 12,
  },
  editTitle: {
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
  },
});

export default memo(UniversalHeader); 