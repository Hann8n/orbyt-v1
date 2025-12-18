import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TouchableWithoutFeedback,

  ScrollView,
  TextInput,
  Alert,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Modal as RNModal } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon, { Loading3FillIcon } from './Icon';
import { hexToRGBA, isColorDark, getContrastRatio } from '../../utils/formatting/colorUtils';
import Typography, { TypographyText } from '../../utils/helpers/typography';
import { BORDER_RADIUS } from '../../utils/constants';


// ============================================================================
// SIMPLIFIED COLOR SYSTEM (12 Core Colors)
// ============================================================================

/**
 * Streamlined color palette with 12 core colors that can be reused across all contexts
 * All colors are tested for WCAG AA compliance and proper contrast ratios
 */

export const Colors = {
  // Basic Colors
  black: '#000000',
  white: '#f3f5fe',
  red: '#FE4359',
  green: '#00D4AA',
  blue: '#6366F1', // Vibrant purple-blue
  yellow: '#FFD700', // Bright gold/yellow
  purple: '#8B5CF6',
  orange: '#FF6B35',
  gray: '#818896', // Base gray
  
  // Gray Shades (lightest to darkest)
  lightGray: '#ccd7e9',
  mediumGray: '#3E414B',
  darkGray: '#181c22',
  mutedGray: '#9a9eb9', // Muted blue-gray
  
  // Blue/Purple Shades
  lightBlue: '#00E5FF', // Bright cyan
  darkBlue: '#20004C', // New dark purple
  
  // Green Shades
  lightGreen: '#00FFA3', // Bright mint green
  darkGreen: '#021C14', // New dark green
  
  // Red Shades
  lightRed: '#FF6B9D', // Pink-red
  darkRed: '#3C000D', // New dark red
  
  // Yellow/Orange Shades
  lightYellow: '#FFEB3B', // Bright yellow
  darkYellow: '#2A2000', // Dark yellow (matches hue of other dark colors)

  // Additional vibrant colors
  neonPink: '#FF0080', // Hot pink
  neonPurple: '#ce3bff', // Neon purple
  electricBlue: '#00BFFF', // Electric blue
  vibrantTeal: '#00E6CC', // Bright teal
  glowGreen: '#39FF14', // Neon green
  cosmicPurple: '#9D4EDD', // Deep purple
  sunsetOrange: '#FF4500', // Bright orange
  bluesky: '#0385ff', // Bluesky brand color
  blurple: '#4528ea', // Blurple color
  
  // Feedback button colors
  interestedLight: '#d77e12', // Light orange
  interestedDark: '#260e00', // Dark orange
  notInterestedLight: '#010c3f', // Light blue
  notInterestedDark: '#000d3c', // Dark blue
  dislikeBackground: '#050945', // Deep navy for "less" background
  dislikeIconBlue: '#37a8ff', // Electric blue for "less" icon

  
  // Overlay Colors
  overlayBlack50: 'rgba(0, 0, 0, 0.5)',
  overlayBlack60: 'rgba(0, 0, 0, 0.6)',
  overlayWhite10: 'rgba(255, 255, 255, 0.1)',
  overlayWhite30: 'rgba(255, 255, 255, 0.3)',
  overlayWhite80: 'rgba(255, 255, 255, 0.8)',

  // Legacy alias blocks removed. Use direct colors from this object instead.

  INTERACTIVE: {
    HEART: {
      ACTIVE: '#FE4359',     // red
      INACTIVE: '#ccd7e9',   // gray
    },
    REPOST: {
      ACTIVE: '#00D4AA',     // green
      INACTIVE: '#FFFFFF',   // white
    },
    COMMENT: '#FFFFFF',      // white
  },

  STATUS: {
    SUCCESS: '#00D4AA',      // green
    ERROR: '#FE4359',        // red
    WARNING: '#FFD700',      // yellow
    INFO: '#6366F1',         // blue
  },

  PROFILE: {
    DEFAULT_RING: '#ccd7e9', // lightGray
  },

  SHIMMER: {
    PRIMARY: ['#181c22', '#3E414B', '#181c22'], // darkGray → mediumGray → darkGray for improved contrast on dark backgrounds
  },
};

// ============================================================================
// COLOR UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if colors meet WCAG AA standard (4.5:1 contrast ratio)
 */
export const meetsContrastGuidelines = (color1: string, color2: string): boolean => {
  return getContrastRatio(color1, color2) >= 4.5;
};

// ============================================================================
// STANDARDIZED COMPONENTS
// ============================================================================

// Button Variants
export type ButtonVariant = 
  | 'primary' 
  | 'secondary' 
  | 'outline' 
  | 'ghost' 
  | 'danger' 
  | 'success';

export type ButtonSize = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
}) => {
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.MEDIUM,
      borderWidth: 1,
    };

    const sizeStyles: Record<ButtonSize, ViewStyle> = {
      small: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
      medium: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
      large: { paddingVertical: 16, paddingHorizontal: 24, minHeight: 52 },
    };

    const variantStyles: Record<ButtonVariant, ViewStyle> = {
      primary: {
        backgroundColor: Colors.lightGray,
        borderColor: Colors.lightGray,
      },
              secondary: {
          backgroundColor: Colors.mediumGray,
          borderColor: Colors.gray,
        },
      outline: {
        backgroundColor: 'transparent',
        borderColor: Colors.lightGray,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
      danger: {
        backgroundColor: Colors.red,
        borderColor: Colors.red,
      },
      success: {
        backgroundColor: Colors.green,
        borderColor: Colors.green,
      },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
      opacity: disabled ? 0.6 : 1,
    };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontFamily: 'Firma-Medium',
      fontWeight: '600',
    };

    const sizeStyles: Record<ButtonSize, TextStyle> = {
      small: { fontSize: 14 },
      medium: { fontSize: 16 },
      large: { fontSize: 18 },
    };

    const variantStyles: Record<ButtonVariant, TextStyle> = {
      primary: { color: Colors.white },
      secondary: { color: Colors.white },
      outline: { color: Colors.lightGray },
      ghost: { color: Colors.white },
      danger: { color: Colors.white },
      success: { color: Colors.white },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  return (
    <Pressable
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <Loading3FillIcon 
          size={24} 
          color={variant === 'outline' ? Colors.lightGray : Colors.white} 
        />
      ) : (
        <>
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'left' && (
            <React.Suspense fallback={<View style={{ width: 16, height: 16 }} />}>
              <Icon name={icon} size={16} color={getTextStyle().color as string} style={{ marginLeft: 8 }} strokeWidth={2.5} />
            </React.Suspense>
          )}
          {icon && iconPosition === 'right' && (
            <React.Suspense fallback={<View style={{ width: 16, height: 16 }} />}>
              <Icon name={icon} size={16} color={getTextStyle().color as string} style={{ marginLeft: 8 }} strokeWidth={2.5} />
            </React.Suspense>
          )}
        </>
      )}
    </Pressable>
  );
};

// Icon Component


// Avatar Component
export type AvatarType = 'profile' | 'channel' | 'user';

interface AvatarProps {
  uri?: string;
  type?: AvatarType;
  size?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
  blurRadius?: number;
  fallbackIcon?: string;
  fallbackIconColor?: string;
  fallbackIconSize?: number;
  ringColor?: string;
  showRing?: boolean; // Show ring border (default: false, no ring)
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
    textColor: string;
  };
}

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  type = 'profile',
  size = 40,
  style,
  blurRadius,
  fallbackIcon,
  fallbackIconColor = Colors.lightGray,
  fallbackIconSize,
  ringColor,
  showRing = false,
  profileColors,
}) => {
  const defaultFallbackIcon = type === 'channel' ? 'device-tv' : 'user';
  const iconSize = fallbackIconSize || Math.max(size * 0.6, 20);
  
  const getBorderRadius = () => {
    switch (type) {
      case 'channel':
        // Scale border radius proportionally with avatar size
        // Using ~25% of size for less rounding (10px for 40px avatar)
        return size * 0.25;
      case 'profile':
      case 'user':
      default:
        return size * 0.5; // 50% of size for profiles (circular)
    }
  };

  const borderRadius = getBorderRadius();
  // Channel avatars never show borders
  const shouldShowRing = type === 'channel' ? false : showRing;
  // Slightly thicker ring for larger avatars (profile screen)
  const ringWidth = shouldShowRing ? (size >= 100 ? 3.0 : 2.0) : 0;
  // No separation when no ring - separation only exists between image and ring
  const separation = 0;
  const innerSize = size - (ringWidth * 2) - (separation * 2);
  const innerBorderRadius = type === 'channel' ? size * 0.25 : innerSize * 0.5;

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius,
    borderWidth: shouldShowRing ? ringWidth : 0,
    borderColor: shouldShowRing ? (ringColor || (profileColors?.textColor || Colors.lightGray)) : 'transparent',
    padding: separation,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: shouldShowRing ? Colors.black : 'transparent',
    overflow: 'hidden',
  };

  const imageStyle: ImageStyle = {
    width: innerSize,
    height: innerSize,
    borderRadius: innerBorderRadius,
  };

  // Normalize style: avoid accidentally passing strings which React treats as children
  const styleSanitized = typeof style === 'object' || typeof style === 'undefined' ? (style as StyleProp<ViewStyle>) : undefined;

  if (uri) {
    return (
      <View style={[containerStyle, styleSanitized]}> 
        <Image
          source={{ uri }}
          style={imageStyle}
          contentFit="cover"
          blurRadius={blurRadius || 0}
          cachePolicy="memory-disk"
          priority="normal"
          transition={200}
        />
      </View>
    );
  }

  // Use fallback icon if provided, otherwise use default avatar image
  if (fallbackIcon) {
    // Import Icon component dynamically to avoid circular dependency
    const { default: Icon } = require('./Icon');
    return (
      <View style={[containerStyle, styleSanitized, { 
        backgroundColor: profileColors?.backgroundColor || Colors.darkGray,
        borderWidth: 0, // Remove border for colored backgrounds
        padding: 0, // Remove padding for colored backgrounds
      }]}>
        <View style={{
          width: size,
          height: size,
          borderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Icon 
            name={fallbackIcon} 
            size={iconSize} 
            color={fallbackIconColor} 
          />
        </View>
      </View>
    );
  }

  // Use default avatar image if no uri is provided
  return (
    <View style={[containerStyle, styleSanitized]}> 
      <Image
        source={require('../../assets/Default-avatar.png')}
        style={imageStyle}
        contentFit="cover"
        cachePolicy="memory"
        priority="high"
      />
    </View>
  );
};

// Card Component
interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  margin?: number;
  backgroundColor?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  padding = 16,
  margin = 0,
  backgroundColor = Colors.darkGray,
}) => {
  return (
    <View
      style={[
        {
          backgroundColor,
          borderRadius: BORDER_RADIUS.MEDIUM,
          padding,
          margin,
          borderWidth: 1,
          borderColor: Colors.gray,
          shadowColor: Colors.lightGray,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

// Modal Component
interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
  }[];
  showCloseButton?: boolean;
  style?: ViewStyle;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  actions = [],
  showCloseButton = true,
  style,
}) => {
  return (
    <RNModal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable 
        style={styles.modalBackdrop} 
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <Card style={[styles.modalContainer, style]}>
            {title && (
              <Text style={styles.modalTitle}>{title}</Text>
            )}
            {subtitle && (
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            )}
            
            <View style={styles.modalContent}>
              {children}
            </View>
            
            {actions.length > 0 && (
              <View style={styles.modalActions}>
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    title={action.label}
                    onPress={action.onPress}
                    variant={action.variant || 'primary'}
                    style={index > 0 ? { marginLeft: 8 } : undefined}
                  />
                ))}
              </View>
            )}
          </Card>
        </TouchableWithoutFeedback>
      </Pressable>
    </RNModal>
  );
};

// Input Component
interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
  error?: string;
  icon?: string;
  onIconPress?: () => void;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  multiline = false,
  numberOfLines = 1,
  style,
  textStyle,
  error,
  icon,
  onIconPress,
}) => {
  return (
    <View style={[styles.inputContainer, style]}>
      <View style={styles.inputWrapper}>
        {icon && (
          <Pressable
            style={styles.inputIcon}
            onPress={onIconPress}
            disabled={!onIconPress}
          >
            <React.Suspense fallback={<View style={{ width: 20, height: 20 }} />}>
              <Icon name={icon} size={20} color={Colors.gray} />
            </React.Suspense>
          </Pressable>
        )}
        <TextInput
          style={[
            styles.input,
            textStyle,
            icon && styles.inputWithIcon,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
                     placeholderTextColor={Colors.lightGray}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
      </View>
      {error && (
        <Text style={styles.inputError}>{error}</Text>
      )}
    </View>
  );
};

// Loading Component
interface LoadingProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  style?: ViewStyle;
}

export const Loading: React.FC<LoadingProps> = ({
  size = 'large',
  color = Colors.lightGray,
  text,
  style,
}) => {
  const iconSize = size === 'small' ? 24 : 48;
  return (
    <View style={[styles.loadingContainer, style]}>
      <Loading3FillIcon size={iconSize} color={color} />
      {text && (
        <Text style={styles.loadingText}>{text}</Text>
      )}
    </View>
  );
};

// Divider Component
interface DividerProps {
  color?: string;
  thickness?: number;
  margin?: number;
  style?: ViewStyle;
}

export const Divider: React.FC<DividerProps> = ({
  color = Colors.gray,
  thickness = 1,
  margin = 16,
  style,
}) => {
  return (
    <View
      style={[
        {
          height: thickness,
          backgroundColor: color,
          marginVertical: margin,
        },
        style,
      ]}
    />
  );
};

// Badge Component
interface BadgeProps {
  text: string;
  variant: 'primary' | 'secondary' | 'success' | 'error' | 'warning';
  size: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  text,
  variant,
  size,
  style,
}) => {
  const getBadgeStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: BORDER_RADIUS.MEDIUM,
      alignItems: 'center',
      justifyContent: 'center',
    };

    const sizeStyles: Record<BadgeProps['size'], ViewStyle> = {
      small: { paddingHorizontal: 8, paddingVertical: 4, minHeight: 20 },
      medium: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 24 },
      large: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 28 },
    };

    const variantStyles: Record<BadgeProps['variant'], ViewStyle> = {
      primary: { backgroundColor: Colors.lightGray },
      secondary: { backgroundColor: Colors.mediumGray },
      success: { backgroundColor: Colors.green },
      error: { backgroundColor: Colors.red },
      warning: { backgroundColor: Colors.yellow },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontFamily: 'Firma-Medium',
      fontWeight: '600',
      color: Colors.white,
    };

    const sizeStyles: Record<BadgeProps['size'], TextStyle> = {
      small: { fontSize: 12 },
      medium: { fontSize: 14 },
      large: { fontSize: 16 },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
    };
  };

  return (
    <View style={[getBadgeStyle(), style]}>
      <Text style={getTextStyle()}>{text}</Text>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlayBlack60, // Changed from BACKDROP to BLACK_60
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
  },
      modalTitle: {
      color: Colors.white,
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
  },
      modalSubtitle: {
      color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    marginBottom: 16,
  },
  modalContent: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },

  // Input styles
  inputContainer: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.gray,
    paddingHorizontal: 16,
    minHeight: 48,
  },
      input: {
      flex: 1,
      color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    paddingVertical: 12,
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
  inputIcon: {
    padding: 8,
  },
  inputError: {
    color: Colors.red,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    marginLeft: 4,
  },

  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
});

// ============================================================================
// COMMON STYLE UTILITIES
// ============================================================================

/**
 * Common style patterns to avoid duplication across components
 */
export const CommonStyles = StyleSheet.create({
  // Position utilities
  absoluteFill: StyleSheet.absoluteFillObject,
  absolute: {
    position: 'absolute',
  },
  
  // Flex utilities
  flexRow: {
    flexDirection: 'row',
  },
  flexColumn: {
    flexDirection: 'column',
  },
  flexCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  
  // Overlay utilities
  overlayDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayBlack50,
  },
  overlayLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayWhite10,
  },
  
  // Common spacing
  padding: {
    padding: 16,
  },
  paddingHorizontal: {
    paddingHorizontal: 16,
  },
  paddingVertical: {
    paddingVertical: 16,
  },
  margin: {
    margin: 16,
  },
  marginHorizontal: {
    marginHorizontal: 16,
  },
  marginVertical: {
    marginVertical: 16,
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  Colors,
  Button,
  Card,
  Modal,
  Input,
  Loading,
  Divider,
  Badge,
  Avatar,
  CommonStyles,
  hexToRGBA,
  isColorDark,
  getContrastRatio,
  meetsContrastGuidelines,
  Typography,
};

export { default as Icon } from './Icon'; 
export { TypographyText };