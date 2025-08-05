import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Text, Image, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../../ui/Icon';
import { useNavigation } from '@react-navigation/native';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import { Avatar } from '../../ui/UI';
import { useHeaderVisibility } from '../../../hooks/useHeaderVisibility';

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
    name: string;
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
  showGradient?: boolean;
  gradientType?: 'default' | 'channel';
  mixIcon?: {
    isInMix: boolean;
    isExcluded: boolean;
    onPress: () => void;
  };
}

// Memoized action button component for performance
const ActionButton = memo<{
  action: HeaderAction;
  textColor: string;
  backgroundColor: string;
  size?: 'small' | 'medium' | 'large';
}>(({ action, textColor, backgroundColor, size = 'medium' }) => {
  const getButtonStyle = useCallback(() => {
    // Check if this is a following state (Following, Mutuals, etc.)
    const isFollowingState = action.label === 'Following' || action.label === 'Mutuals';
    
    const baseStyle = {
      backgroundColor: isFollowingState ? textColor : hexToRGBA(textColor, 0.2),
      borderColor: isFollowingState ? textColor : hexToRGBA(textColor, 0.3),
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
  }, [action.variant, textColor, action.label]);

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
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.actionContent}>
          <Text style={[styles.actionText, { 
            color: (action.label === 'Following' || action.label === 'Mutuals') ? backgroundColor : textColor 
          }]}>
            {action.label}
          </Text>
          {action.customIcon ? (
            action.customIcon
          ) : action.icon ? (
            <Icon 
              name={action.icon} 
              size={16} 
              color={(action.label === 'Following' || action.label === 'Mutuals') ? backgroundColor : textColor} 
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
        <Icon 
          name={layout.menuIcon.name} 
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
              size="small"
            />
          )}
          <ActionButton
            action={layout.buttonGroup.primary}
            textColor={textColor}
            backgroundColor={backgroundColor}
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
          mixIcon.isExcluded ? '#FE4359' : 
          mixIcon.isInMix && !mixIcon.isExcluded ? '#4CAF50' : 
          hexToRGBA(textColor, 0.6)
        } 
      />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.contentContainer}>
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
          size={80}
          profileColors={{ backgroundColor, textColor, foregroundColor: textColor }}
          style={[
            styles.avatarImage,
            content.avatarStyle === 'rounded-square' && styles.avatarImageRoundedSquare
          ]}
        />
        {content.onAvatarPress && (
          <View style={[
            styles.editAvatarOverlay, 
            { backgroundColor: hexToRGBA(textColor, 0.8) },
            content.avatarStyle === 'rounded-square' && styles.editAvatarOverlayRoundedSquare
          ]}>
            <Icon name="camera" size={20} color={backgroundColor} />
          </View>
        )}
      </TouchableOpacity>
      
      <View style={styles.textContainer}>
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
        
        {content.subtitle && (
          <TouchableOpacity
            style={styles.subtitleRow}
            onPress={content.onTitlePress}
            activeOpacity={content.onTitlePress ? 0.7 : 1}
          >
            <Text style={[styles.subtitle, { color: hexToRGBA(textColor, 0.67) }]}>
              {content.subtitle}
            </Text>
            {content.onTitlePress && (
              <View style={styles.chevronContainer}>
                <Icon name="chevron-right" size={16} color={hexToRGBA(textColor, 0.67)} />
              </View>
            )}
          </TouchableOpacity>
        )}
        
        {customDescription || (content.description && (
          <Text style={[styles.description, { color: hexToRGBA(textColor, 0.87) }]}>
            {content.description}
          </Text>
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
  showGradient = true,
  gradientType = 'default',
  mixIcon,
}) => {
  const navigation = useNavigation();
  const headerVisibility = useHeaderVisibility();
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handleBackPress = useCallback(() => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  }, [onBackPress, navigation]);

  const headerStyle = useMemo(() => [
    styles.header,
    { backgroundColor },
    style,
  ], [backgroundColor, style]);

  // Animate opacity based on header visibility (excluding shadow)
  useEffect(() => {
    const toValue = headerVisibility.isSnappedToTop ? 1 : 0;
    Animated.timing(opacityAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [headerVisibility.isSnappedToTop, opacityAnim]);

  const animatedHeaderStyle = useMemo(() => [
    headerStyle,
    {
      opacity: opacityAnim,
    },
  ], [headerStyle, opacityAnim]);

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
      // Lighter gradient for channels to work better with light text, but still goes to 100% at bottom
      return ['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,1)'];
    }
    return ['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,1)'];
  }, [gradientType]);

  return (
    <View style={headerStyle}>
      {/* Fade to black gradient - conditionally visible */}
      {showGradient && (
        <LinearGradient
          colors={gradientColors}
          style={styles.fadeGradient}
          pointerEvents="none"
        />
      )}
      {/* Animated content container */}
      <Animated.View style={[styles.animatedContent, { opacity: opacityAnim }]}>
        {/* Navigation and Action Buttons */}
        <View style={styles.topRow}>
        <View style={styles.leftSection}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
              activeOpacity={0.7}
            >
              <Icon name="arrow-left" size={30} color={textColor} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    position: 'relative',
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    minHeight: 40,
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
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
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
    fontSize: 15,
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
  },
  contentContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: -4,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRoundedSquare: {
    borderRadius: 16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  avatarImageRoundedSquare: {
    borderRadius: 14,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  title: {
    fontFamily: 'Firma-Black',
    fontWeight: 'bold',
    fontSize: 24,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: 'Firma-Medium',
    fontSize: 17,
  },
  description: {
    marginTop: 12,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontFamily: 'Firma-Regular',
    fontSize: 16,
  },
  editAvatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  editAvatarOverlayRoundedSquare: {
    borderRadius: 16,
  },
  animatedContent: {
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
});

export default memo(UniversalHeader); 