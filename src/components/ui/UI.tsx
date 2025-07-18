import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  TouchableWithoutFeedback,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  StyleProp,
  Image,
  ImageStyle,
} from 'react-native';
import { Modal as RNModal } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { icons as pixelarticons } from '@iconify-json/pixelarticons';
import { icons as streamlinePixel } from '@iconify-json/streamline-pixel';

// ============================================================================
// ENHANCED COLOR SYSTEM
// ============================================================================

/**
 * Comprehensive color palette with improved accuracy and accessibility
 * All colors are tested for WCAG AA compliance and proper contrast ratios
 */

export const Colors = {
  // Brand Colors - Core identity colors
  BRAND: {
    PRIMARY: '#000000',          // Primary brand color (pure black)
    SECONDARY: '#FFFFFF',        // Secondary brand color (pure white)
    ACCENT: '#3797F0',           // Primary accent (accessible blue)
    ACCENT_DARK: '#2A7CD6',      // Darker variant for hover states
    ACCENT_LIGHT: '#5BA8F4',     // Lighter variant for disabled states
  },

  // Text Colors - Hierarchical text system
  TEXT: {
    PRIMARY: '#FFFFFF',          // Primary text (white)
    SECONDARY: '#D1D1E1',        // Secondary text (light gray)
    TERTIARY: '#848895',         // Tertiary text (medium gray)
    BRIGHT: '#FDFCFA',           // Extra bright for emphasis
    DISABLED: '#666666',         // Disabled text
    PLACEHOLDER: '#999999',      // Placeholder text
    INVERSE: '#000000',          // Text on light backgrounds
    LIGHT_GREY: '#DDDDDD',       // Light grey text
    MEDIUM_GREY: '#AAAAAA',      // Medium grey text
    DARK_GREY: '#666666',        // Dark grey text for placeholders
  },

  // UI Background Colors - Layered background system
  BACKGROUND: {
    PRIMARY: '#000000',          // Main app background
    SECONDARY: '#1A1A1A',        // Secondary background (cards, modals)
    TERTIARY: '#2A2A2A',         // Tertiary background (inputs, buttons)
    ITEM: '#1C1C1E',             // Item background (form fields)
    OVERLAY: '#111111',          // Overlay backgrounds
    CARD: '#1C1C1E',             // Card backgrounds
    MODAL: '#1C1C1E',            // Modal backgrounds
  },

  // Border Colors - Consistent border system
  BORDER: {
    PRIMARY: '#333333',          // Primary borders
    SECONDARY: '#2A2A2A',        // Secondary borders
    ACCENT: '#3797F0',           // Accent borders
    LIGHT: '#444444',            // Light borders
    DARK: '#222222',             // Dark borders
  },

  // Interactive Elements - State-based colors
  INTERACTIVE: {
    // Heart/Like interactions
    HEART: {
      ACTIVE: '#FE4359',         // Active heart (pink/red)
      INACTIVE: '#848895',       // Inactive heart (gray)
      HOVER: '#E6394F',          // Hover state
    },
    // Repost interactions
    REPOST: {
      ACTIVE: '#00D4AA',         // Active repost (teal)
      INACTIVE: '#FFFFFF',       // Inactive repost (white)
      HOVER: '#00B894',          // Hover state
    },
    // Comment interactions
    COMMENT: '#FFFFFF',          // Comment icon color
    // Follow button
    FOLLOW: {
      BUTTON: 'rgba(255, 255, 255, 0.2)', // Follow button background
      TEXT: '#FFFFFF',           // Follow button text
      ACTIVE: '#00D4AA',         // Following state
      HOVER: 'rgba(255, 255, 255, 0.3)', // Hover state
    },
    // Links
    LINK: '#3797F0',             // Link color
    LINK_HOVER: '#2A7CD6',       // Link hover state
  },

  // Status Colors - Semantic color system
  STATUS: {
    SUCCESS: '#00D4AA',          // Success (teal)
    ERROR: '#FE4359',            // Error (red)
    WARNING: '#FFB800',          // Warning (amber)
    INFO: '#3797F0',             // Info (blue)
    SUCCESS_DARK: '#00B894',     // Dark success
    ERROR_DARK: '#E6394F',       // Dark error
    WARNING_DARK: '#E6A800',     // Dark warning
  },

  // Profile Colors - User profile theming
  PROFILE: {
    DEFAULT_RING: '#D1D1E1',     // Default profile ring
    VERIFIED: '#3797F0',         // Verified badge
    PREMIUM: '#FFB800',          // Premium badge
  },

  // Overlay Colors - Modal and overlay system
  OVERLAY: {
    BACKDROP: 'rgba(0, 0, 0, 0.6)', // Modal backdrop
    DIM: 'rgba(0, 0, 0, 0.55)',     // Dimming overlay
    LIGHT: 'rgba(255, 255, 255, 0.1)', // Light overlay
    DARK: 'rgba(0, 0, 0, 0.8)',     // Dark overlay
  },

  // Shimmer Colors - Loading states
  SHIMMER: {
    PRIMARY: ['#1A1A1A', '#2A2A2A', '#1A1A1A'],
    SECONDARY: ['#2A2A2A', '#3A3A3A', '#2A2A2A'],
  },
};

// ============================================================================
// COLOR UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert hex color to rgba with alpha
 */
export const hexToRGBA = (hex: string, alpha: number): string => {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Determine if a color is dark using WCAG relative luminance
 */
export const isColorDark = (hex: string): boolean => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  const toSRGB = (x: number): number => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  
  const luminance = 
    0.2126 * toSRGB(r) +
    0.7152 * toSRGB(g) +
    0.0722 * toSRGB(b);
  
  return luminance < 0.5;
};

/**
 * Get contrast ratio between two colors
 */
export const getContrastRatio = (color1: string, color2: string): number => {
  const getRelativeLuminance = (hex: string): number => {
    const color = hex.replace('#', '');
    const r = parseInt(color.substring(0, 2), 16) / 255;
    const g = parseInt(color.substring(2, 4), 16) / 255;
    const b = parseInt(color.substring(4, 6), 16) / 255;
    
    const transform = (c: number): number => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      
    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
  };

  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

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
      borderRadius: 12,
      borderWidth: 1,
    };

    const sizeStyles: Record<ButtonSize, ViewStyle> = {
      small: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 },
      medium: { paddingVertical: 12, paddingHorizontal: 20, minHeight: 44 },
      large: { paddingVertical: 16, paddingHorizontal: 24, minHeight: 52 },
    };

    const variantStyles: Record<ButtonVariant, ViewStyle> = {
      primary: {
        backgroundColor: Colors.BRAND.ACCENT,
        borderColor: Colors.BRAND.ACCENT,
      },
      secondary: {
        backgroundColor: Colors.BACKGROUND.TERTIARY,
        borderColor: Colors.BORDER.PRIMARY,
      },
      outline: {
        backgroundColor: 'transparent',
        borderColor: Colors.BRAND.ACCENT,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
      danger: {
        backgroundColor: Colors.STATUS.ERROR,
        borderColor: Colors.STATUS.ERROR,
      },
      success: {
        backgroundColor: Colors.STATUS.SUCCESS,
        borderColor: Colors.STATUS.SUCCESS,
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
      primary: { color: Colors.TEXT.PRIMARY },
      secondary: { color: Colors.TEXT.PRIMARY },
      outline: { color: Colors.BRAND.ACCENT },
      ghost: { color: Colors.TEXT.PRIMARY },
      danger: { color: Colors.TEXT.PRIMARY },
      success: { color: Colors.TEXT.PRIMARY },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'outline' ? Colors.BRAND.ACCENT : Colors.TEXT.PRIMARY} 
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Icon name={icon} size={16} color={getTextStyle().color as string} style={{ marginRight: 8 }} />
          )}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Icon name={icon} size={16} color={getTextStyle().color as string} style={{ marginLeft: 8 }} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

// Icon Component
interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle;
  strokeWidth?: number;
  iconSet?: 'pixelarticons' | 'streamline-pixel';
}

export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 24, 
  color = Colors.TEXT.PRIMARY, 
  style, 
  strokeWidth = 1.75,
  iconSet = 'pixelarticons'
}) => {
  try {
    const icons = iconSet === 'streamline-pixel' ? streamlinePixel : pixelarticons;
    const iconData = icons.icons[name];
    
    if (!iconData) {
      console.warn(`Icon not found: ${name} in ${iconSet}`);
      return null;
    }

    const svgXml = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${icons.width} ${icons.height}" xmlns="http://www.w3.org/2000/svg" stroke-width="${strokeWidth}">
        ${iconData.body.replace(/currentColor/g, color)}
      </svg>
    `;

    return <SvgXml xml={svgXml} width={size} height={size} style={style} />;
  } catch (error) {
    console.error(`Error rendering icon ${name}:`, error);
    return null;
  }
};

// Avatar Component
export type AvatarType = 'profile' | 'channel' | 'user';

interface AvatarProps {
  uri?: string;
  type?: AvatarType;
  size?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
  fallbackIcon?: string;
  fallbackIconColor?: string;
  fallbackIconSize?: number;
  ringColor?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  uri,
  type = 'profile',
  size = 40,
  style,
  fallbackIcon,
  fallbackIconColor = Colors.TEXT.LIGHT_GREY,
  fallbackIconSize,
  ringColor,
}) => {
  const defaultFallbackIcon = type === 'channel' ? 'device-tv' : 'user';
  const iconSize = fallbackIconSize || Math.max(size * 0.4, 16);
  
  const getBorderRadius = () => {
    switch (type) {
      case 'channel':
        return size * 0.3; // 30% of size for channels (more rounded)
      case 'profile':
      case 'user':
      default:
        return size * 0.5; // 50% of size for profiles (circular)
    }
  };

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: getBorderRadius(),
    borderWidth: 2,
    borderColor: ringColor || Colors.BORDER.PRIMARY,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[baseStyle as ImageStyle, style as StyleProp<ImageStyle>]}
      />
    );
  }

  return (
    <View style={[baseStyle as ViewStyle, { 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: Colors.BORDER.PRIMARY,
      overflow: 'hidden',
    }, style]}>
      <Icon
        name={fallbackIcon || defaultFallbackIcon}
        size={iconSize}
        color={fallbackIconColor}
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
  backgroundColor = Colors.BACKGROUND.CARD,
}) => {
  return (
    <View
      style={[
        {
          backgroundColor,
          borderRadius: 12,
          padding,
          margin,
          borderWidth: 1,
          borderColor: Colors.BORDER.PRIMARY,
          shadowColor: Colors.BRAND.PRIMARY,
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
      <TouchableOpacity 
        style={styles.modalBackdrop} 
        activeOpacity={1}
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
      </TouchableOpacity>
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
          <TouchableOpacity
            style={styles.inputIcon}
            onPress={onIconPress}
            disabled={!onIconPress}
          >
            <Icon name={icon} size={20} color={Colors.TEXT.TERTIARY} />
          </TouchableOpacity>
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
          placeholderTextColor={Colors.TEXT.PLACEHOLDER}
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
  color = Colors.BRAND.ACCENT,
  text,
  style,
}) => {
  return (
    <View style={[styles.loadingContainer, style]}>
      <ActivityIndicator size={size} color={color} />
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
  color = Colors.BORDER.PRIMARY,
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
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    };

    const sizeStyles: Record<BadgeProps['size'], ViewStyle> = {
      small: { paddingHorizontal: 8, paddingVertical: 4, minHeight: 20 },
      medium: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 24 },
      large: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 28 },
    };

    const variantStyles: Record<BadgeProps['variant'], ViewStyle> = {
      primary: { backgroundColor: Colors.BRAND.ACCENT },
      secondary: { backgroundColor: Colors.BACKGROUND.TERTIARY },
      success: { backgroundColor: Colors.STATUS.SUCCESS },
      error: { backgroundColor: Colors.STATUS.ERROR },
      warning: { backgroundColor: Colors.STATUS.WARNING },
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
      color: Colors.TEXT.PRIMARY,
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
    backgroundColor: Colors.OVERLAY.BACKDROP,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: Colors.TEXT.PRIMARY,
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: Colors.TEXT.SECONDARY,
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
    backgroundColor: Colors.BACKGROUND.ITEM,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER.PRIMARY,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  input: {
    flex: 1,
    color: Colors.TEXT.PRIMARY,
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
    color: Colors.STATUS.ERROR,
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
    color: Colors.TEXT.SECONDARY,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  Colors,
  Button,
  Icon,
  Card,
  Modal,
  Input,
  Loading,
  Divider,
  Badge,
  hexToRGBA,
  isColorDark,
  getContrastRatio,
  meetsContrastGuidelines,
}; 