import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInput,
  StyleProp,
  ImageStyle,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { NativePressable } from './NativePressable';
import { SquircleNativePressable } from './Squircle';
import {
  buttonContentCenter,
  buttonDisabledOpacity,
  buttonIconTint,
  buttonLabelBase,
  buttonSizeContainer,
  buttonSizeLabel,
  buttonVariantContainer,
  buttonVariantLabel,
  retryGlassBackgroundRadius,
  retryPillContainer,
  retryPillLabel,
  shape,
} from './buttonPresets';
import { fontSizeFor } from '@/utils/components/typography';
import { Image } from 'expo-image';
import { Modal as RNModal } from 'react-native';
// SafeAreaView is imported elsewhere; no direct usage in this module
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Icon, { STROKE_WIDTH_THICK } from './Icon';
import {
  hexToRGBA,
  isColorDark,
  getContrastRatio,
  blendColors,
} from '../../utils/formatting/colors';
import { FontFamily, Typography } from '../../utils/components/typography';
import { BORDER_RADIUS } from '../../utils/constants';
import { SquircleView } from './Squircle';
import type { StatusView } from '../../services/api/types';
import { isLiveStatus } from '../../services/data/ProfileService';
import { Colors, ColorScale, NeutralScale } from '../../theme';

// Re-export Colors for backward compatibility
export { Colors };
export type { ColorScale, NeutralScale };

/**
 * Check if colors meet WCAG AA standard (4.5:1 contrast ratio)
 */
const meetsContrastGuidelines = (color1: string, color2: string): boolean => {
  return getContrastRatio(color1, color2) >= 4.5;
};

// Button Variants
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

export type ButtonSize = 'small' | 'medium' | 'large';

export type ButtonShape = 'pill' | 'rounded' | 'control' | 'compact';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  buttonShape?: ButtonShape;
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
  buttonShape = 'rounded',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
}) => {
  const buttonStyle = [
    buttonContentCenter,
    shape[buttonShape],
    buttonSizeContainer[size],
    buttonVariantContainer[variant],
    (disabled || loading) && buttonDisabledOpacity,
    style,
  ];
  const computedTextStyle = [buttonLabelBase, buttonSizeLabel[size], buttonVariantLabel[variant]];
  const iconColor = buttonIconTint[variant];

  return (
    <SquircleNativePressable style={buttonStyle} onPress={onPress} disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' ? Colors.neutral[200] : Colors.neutral[50]}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <React.Suspense fallback={<View style={styles.iconFallback} />}>
              <Icon
                name={icon}
                size={16}
                color={iconColor}
                style={styles.iconMarginRight}
                strokeWidth={STROKE_WIDTH_THICK}
              />
            </React.Suspense>
          )}
          <Text style={[computedTextStyle, textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <React.Suspense fallback={<View style={styles.iconFallback} />}>
              <Icon
                name={icon}
                size={16}
                color={iconColor}
                style={styles.iconMarginLeft}
                strokeWidth={STROKE_WIDTH_THICK}
              />
            </React.Suspense>
          )}
        </>
      )}
    </SquircleNativePressable>
  );
};

// Retry Button Component - consistent styling across the app
interface RetryButtonProps {
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const RetryButton: React.FC<RetryButtonProps> = ({ onPress, style, textStyle }) => {
  const { t } = useTranslation();
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const buttonContent = (
    <View style={retryButtonStyles.buttonContent} pointerEvents="none">
      <Text style={[retryButtonStyles.text, textStyle]} pointerEvents="none">
        {t('errors.tryAgain')}
      </Text>
    </View>
  );

  return (
    <SquircleNativePressable
      style={[retryPillContainer, !useLiquidGlass && retryButtonStyles.whiteButton, style]}
      onPress={onPress}
    >
      {useLiquidGlass ? (
        <>
          <GlassView
            style={[StyleSheet.absoluteFillObject, retryGlassBackgroundRadius]}
            glassEffectStyle="clear"
            tintColor="rgba(255, 255, 255, 1)"
            isInteractive
          />
          {buttonContent}
        </>
      ) : (
        buttonContent
      )}
    </SquircleNativePressable>
  );
};

const retryButtonStyles = StyleSheet.create({
  buttonContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteButton: {
    backgroundColor: Colors.neutral[50],
  },
  text: retryPillLabel,
});

/** Matches {@link RetryButton} — use for secondary actions (e.g. Go back) on error / empty states. */
interface GoBackButtonProps {
  onPress: () => void;
  style?: ViewStyle;
}

const GoBackButton: React.FC<GoBackButtonProps> = ({ onPress, style }) => {
  const { t } = useTranslation();
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const buttonContent = (
    <View style={goBackButtonStyles.buttonContent} pointerEvents="none">
      <Text style={goBackButtonStyles.text} pointerEvents="none">
        {t('common.goBack')}
      </Text>
    </View>
  );

  return (
    <SquircleNativePressable
      style={[retryPillContainer, !useLiquidGlass && goBackButtonStyles.whiteButton, style]}
      onPress={onPress}
    >
      {useLiquidGlass ? (
        <>
          <GlassView
            style={[StyleSheet.absoluteFillObject, retryGlassBackgroundRadius]}
            glassEffectStyle="clear"
            tintColor="rgba(255, 255, 255, 1)"
            isInteractive
          />
          {buttonContent}
        </>
      ) : (
        buttonContent
      )}
    </SquircleNativePressable>
  );
};

const goBackButtonStyles = StyleSheet.create({
  buttonContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteButton: {
    backgroundColor: Colors.neutral[50],
  },
  text: retryPillLabel,
});

// Icon Component

// Avatar Component
export type AvatarType = 'profile' | 'channel' | 'user';

const DEFAULT_AVATAR_SOURCE = require('../../assets/Default-avatar.png');

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
  status?: StatusView; // Status from API - used to determine if live
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
  fallbackIconColor = Colors.neutral[200],
  fallbackIconSize,
  ringColor,
  showRing = false,
  status,
  profileColors,
}) => {
  const { t } = useTranslation();
  const isLive = isLiveStatus(status);
  const iconSize = fallbackIconSize || Math.max(size * 0.6, 20);
  const [hasImageError, setHasImageError] = React.useState<boolean>(false);

  React.useEffect(() => {
    setHasImageError(false);
  }, [uri]);

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
  // When live, automatically show ring in red
  const shouldShowRing = type === 'channel' ? false : showRing || isLive;
  // Slightly thicker ring for larger avatars (profile screen)
  // Make ring thicker when live
  const baseRingWidth = shouldShowRing ? (size >= 100 ? 3.0 : 2.0) : 0;
  const ringWidth = isLive ? baseRingWidth * 1.5 : baseRingWidth; // 50% thicker when live
  const innerSize = size - ringWidth * 2;
  const innerBorderRadius = type === 'channel' ? size * 0.25 : innerSize * 0.5;

  // Determine ring color: red if live, otherwise use provided color or default
  const finalRingColor = isLive
    ? Colors.coral[500]
    : ringColor || profileColors?.textColor || Colors.neutral[200];

  // Memoize containerStyle to prevent unnecessary re-renders
  // Use padding + backgroundColor instead of borderWidth/borderColor to avoid
  // the sub-pixel gap that border rendering causes between the ring and the image.
  const containerStyle: ViewStyle = React.useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius,
      padding: shouldShowRing ? ringWidth : 0,
      backgroundColor: shouldShowRing ? finalRingColor : Colors.transparent,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'visible', // Allows LIVE badge to show outside bounds
    }),
    [size, borderRadius, shouldShowRing, ringWidth, finalRingColor]
  );

  const fallbackInnerBgColor = profileColors?.backgroundColor || Colors.neutral[925];

  // LIVE badge style - stepped scaling for consistent appearance at all sizes
  const calculateLiveBadgeDimensions = (avatarSize: number) => {
    // Use stepped sizing similar to VerificationBadge for consistency
    let fontSize: number;
    let paddingH: number;
    let paddingV: number;
    let borderRadius: number;
    let letterSpacing: number;

    if (avatarSize <= 24) {
      fontSize = fontSizeFor(7);
      paddingH = 2;
      paddingV = 1;
      borderRadius = 3;
      letterSpacing = 0.3;
    } else if (avatarSize <= 32) {
      fontSize = fontSizeFor(8);
      paddingH = 2.5;
      paddingV = 1;
      borderRadius = 3.5;
      letterSpacing = 0.35;
    } else if (avatarSize <= 40) {
      fontSize = fontSizeFor(9);
      paddingH = 3;
      paddingV = 1.5;
      borderRadius = 4;
      letterSpacing = 0.4;
    } else if (avatarSize <= 48) {
      fontSize = fontSizeFor(10);
      paddingH = 3.5;
      paddingV = 1.5;
      borderRadius = 4.5;
      letterSpacing = 0.45;
    } else if (avatarSize <= 56) {
      fontSize = fontSizeFor(11);
      paddingH = 4;
      paddingV = 2;
      borderRadius = 5;
      letterSpacing = 0.5;
    } else if (avatarSize <= 64) {
      fontSize = fontSizeFor(12);
      paddingH = 4.5;
      paddingV = 2;
      borderRadius = 5.5;
      letterSpacing = 0.55;
    } else if (avatarSize <= 80) {
      fontSize = fontSizeFor(13);
      paddingH = 5;
      paddingV = 2.5;
      borderRadius = 6;
      letterSpacing = 0.6;
    } else if (avatarSize <= 100) {
      fontSize = fontSizeFor(14);
      paddingH = 6;
      paddingV = 3;
      borderRadius = 7;
      letterSpacing = 0.65;
    } else {
      // For very large avatars (100+)
      fontSize = fontSizeFor(15);
      paddingH = 7;
      paddingV = 3;
      borderRadius = 8;
      letterSpacing = 0.7;
    }

    return {
      fontSize,
      paddingH,
      paddingV,
      borderRadius,
      letterSpacing,
    };
  };

  const badgeDimensions = calculateLiveBadgeDimensions(size);

  // Calculate badge bottom offset to center with ring
  // Ring center at bottom is at ringWidth/2 from bottom
  // Badge center should align with ring center
  // Badge height = fontSize + paddingV * 2
  // Badge center from bottom = bottom + (fontSize + paddingV * 2) / 2
  // Setting: bottom + (fontSize + paddingV * 2) / 2 = ringWidth / 2
  // Therefore: bottom = (ringWidth - fontSize - paddingV * 2) / 2
  // Add size-based adjustment to bring badge closer on smaller avatars
  const badgeHeight = badgeDimensions.fontSize + badgeDimensions.paddingV * 2;
  const baseOffset = (ringWidth - badgeHeight) / 2;

  // Adjust for smaller avatars to bring badge closer in
  // Smaller avatars get additional offset to position badge closer to avatar edge
  let sizeAdjustment = 0;
  if (size <= 32) {
    sizeAdjustment = 1.5; // Closer for very small avatars
  } else if (size <= 40) {
    sizeAdjustment = 1;
  } else if (size <= 48) {
    sizeAdjustment = 0.5;
  }

  const badgeBottomOffset = baseOffset + sizeAdjustment;
  // Keep the LIVE pill inside layout bounds (negative bottom would paint below the root and get clipped).
  const liveOverflowBelow = isLive ? Math.max(0, -badgeBottomOffset) : 0;
  const rootHeight = size + liveOverflowBelow;

  const liveBadgeStyle: ViewStyle = {
    position: 'absolute',
    bottom: Math.max(0, badgeBottomOffset),
    alignSelf: 'center',
    backgroundColor: Colors.coral[500],
    paddingHorizontal: badgeDimensions.paddingH,
    paddingVertical: badgeDimensions.paddingV,
    borderRadius: badgeDimensions.borderRadius,
    minWidth: badgeDimensions.fontSize * 2.8, // Proportional min width for "LIVE" text
    alignItems: 'center',
    justifyContent: 'center',
  };

  const liveBadgeTextStyle: TextStyle = {
    color: Colors.neutral[50],
    fontSize: badgeDimensions.fontSize,
    fontFamily: FontFamily.black,
    fontWeight: '900',
    letterSpacing: badgeDimensions.letterSpacing,
  };

  const imageStyle: ImageStyle = {
    width: innerSize,
    height: innerSize,
    borderRadius: innerBorderRadius,
  };

  const remoteAvatarClipStyle = React.useMemo(
    (): ViewStyle => ({
      width: innerSize,
      height: innerSize,
      borderRadius: innerBorderRadius,
      overflow: 'hidden',
    }),
    [innerSize, innerBorderRadius]
  );

  // Normalize style: avoid accidentally passing strings which React treats as children
  const styleSanitized =
    typeof style === 'object' || typeof style === 'undefined'
      ? (style as StyleProp<ViewStyle>)
      : undefined;

  const shouldRenderRemoteImage = !!uri && !hasImageError;
  const remoteImagePriority = shouldRenderRemoteImage
    ? type === 'channel' && (uri.toLowerCase().endsWith('.gif') || uri.includes('.gif?'))
      ? 'low'
      : 'normal'
    : 'normal';

  const mediaContent = shouldRenderRemoteImage ? (
    <View style={remoteAvatarClipStyle}>
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFillObject, imageStyle]}
        placeholder={DEFAULT_AVATAR_SOURCE}
        placeholderContentFit="cover"
        contentFit="cover"
        blurRadius={blurRadius || 0}
        cachePolicy="memory-disk"
        priority={remoteImagePriority}
        transition={200}
        allowDownscaling={true}
        recyclingKey={uri}
        onError={() => {
          setHasImageError(true);
        }}
      />
    </View>
  ) : fallbackIcon ? (
    <View
      style={[
        {
          width: innerSize,
          height: innerSize,
          borderRadius: innerBorderRadius,
          backgroundColor: fallbackInnerBgColor,
        },
        styles.centerContent,
      ]}
    >
      <Icon name={fallbackIcon} size={iconSize} color={fallbackIconColor} />
    </View>
  ) : (
    <Image
      source={DEFAULT_AVATAR_SOURCE}
      style={imageStyle}
      contentFit="cover"
      cachePolicy="memory"
      priority="high"
    />
  );

  return (
    <View style={[{ width: size, height: rootHeight }, styleSanitized]}>
      <View style={containerStyle}>{mediaContent}</View>
      {isLive && (
        <View style={liveBadgeStyle}>
          <Text style={liveBadgeTextStyle}>{t('profile.live')}</Text>
        </View>
      )}
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

const Card: React.FC<CardProps> = ({
  children,
  style,
  padding = 16,
  margin = 0,
  backgroundColor = Colors.neutral[925],
}) => {
  return (
    <SquircleView
      style={[
        {
          backgroundColor,
          borderRadius: BORDER_RADIUS.MEDIUM,
          padding,
          margin,
        },
        styles.cardBorder,
        style,
      ]}
    >
      {children}
    </SquircleView>
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

const EMPTY_MODAL_ACTIONS = Object.freeze([] as NonNullable<ModalProps['actions']>);

const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  actions = EMPTY_MODAL_ACTIONS,
  showCloseButton = true,
  style,
}) => {
  // Currently reserved for future header close button; read to satisfy type checker
  void showCloseButton;
  const keyedActions = React.useMemo(() => {
    const occurrences = new Map<string, number>();
    return actions.map(action => {
      const variant = action.variant ?? 'primary';
      const baseKey = `modal-action-${action.label}-${variant}`;
      const occurrence = occurrences.get(baseKey) ?? 0;
      occurrences.set(baseKey, occurrence + 1);
      return { action, key: `${baseKey}-${occurrence}` };
    });
  }, [actions]);

  return (
    <RNModal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <NativePressable style={styles.modalBackdrop} onPress={onClose}>
        <NativePressable onPress={e => e.stopPropagation()}>
          <Card style={[styles.modalContainer, style]}>
            {title && <Text style={styles.modalTitle}>{title}</Text>}
            {subtitle && <Text style={styles.modalSubtitle}>{subtitle}</Text>}

            <View style={styles.modalContent}>{children}</View>

            {actions.length > 0 && (
              <View style={styles.modalActions}>
                {keyedActions.map(({ action, key }, idx) => (
                  <Button
                    key={key}
                    title={action.label}
                    onPress={action.onPress}
                    variant={action.variant || 'primary'}
                    style={idx > 0 ? styles.modalActionMargin : undefined}
                  />
                ))}
              </View>
            )}
          </Card>
        </NativePressable>
      </NativePressable>
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
  nativeID?: string;
}

const InputComponent: React.FC<InputProps> = ({
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
  nativeID,
}) => {
  // Determine textContentType and autoComplete based on keyboardType
  const textContentType = secureTextEntry
    ? 'password'
    : keyboardType === 'email-address'
      ? 'emailAddress'
      : keyboardType === 'phone-pad'
        ? 'telephoneNumber'
        : 'none';

  const autoComplete = secureTextEntry
    ? 'password'
    : keyboardType === 'email-address'
      ? 'email'
      : keyboardType === 'phone-pad'
        ? 'tel'
        : 'off';

  return (
    <View style={[styles.inputContainer, style]}>
      <View style={styles.inputWrapper}>
        {icon && (
          <NativePressable
            style={styles.inputIcon}
            onPress={onIconPress}
            disabled={!onIconPress}
            androidRippleBorderless
          >
            <React.Suspense fallback={<View style={styles.iconFallbackLarge} />}>
              <Icon name={icon} size={20} color={Colors.neutral[500]} />
            </React.Suspense>
          </NativePressable>
        )}
        <TextInput
          nativeID={nativeID}
          style={[styles.input, textStyle, icon && styles.inputWithIcon]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.neutral[200]}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          importantForAutofill="yes"
          multiline={multiline}
          numberOfLines={numberOfLines}
          caretHidden={false}
        />
      </View>
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
};
InputComponent.displayName = 'Input';
const Input = React.memo(InputComponent);

// Loading Component
interface LoadingProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  style?: ViewStyle;
}

export const Loading: React.FC<LoadingProps> = ({
  size = 'large',
  color = Colors.neutral[200],
  text,
  style,
}) => {
  return (
    <View style={[styles.loadingContainer, style]}>
      <ActivityIndicator size={size === 'small' ? 'small' : 'large'} color={color} />
      {text && <Text style={styles.loadingText}>{text}</Text>}
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

const Divider: React.FC<DividerProps> = ({
  color = Colors.neutral[500],
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

const Badge: React.FC<BadgeProps> = ({ text, variant, size, style }) => {
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
      primary: { backgroundColor: Colors.neutral[200] },
      secondary: { backgroundColor: Colors.neutral[600] },
      success: { backgroundColor: Colors.teal[500] },
      error: { backgroundColor: Colors.coral[500] },
      warning: { backgroundColor: Colors.amber[500] },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontFamily: FontFamily.medium,
      fontWeight: '600',
      color: Colors.neutral[50],
    };

    const sizeStyles: Record<BadgeProps['size'], TextStyle> = {
      small: { fontSize: Typography.sizes.caption },
      medium: { fontSize: Typography.sizes.bodySmall },
      large: { fontSize: Typography.sizes.subtitle },
    };

    return {
      ...baseStyle,
      ...sizeStyles[size],
    };
  };

  return (
    <SquircleView style={[getBadgeStyle(), style]}>
      <Text style={getTextStyle()}>{text}</Text>
    </SquircleView>
  );
};

const styles = StyleSheet.create({
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay.black60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    fontFamily: FontFamily.bold,
    marginBottom: 8,
  },
  modalSubtitle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
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
    backgroundColor: Colors.neutral[925],
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 1,
    borderColor: Colors.neutral[500],
    paddingHorizontal: 16,
    minHeight: 48,
  },
  input: {
    flex: 1,
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
    paddingVertical: 12,
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
  inputIcon: {
    padding: 8,
  },
  inputError: {
    color: Colors.coral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
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
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
    marginTop: 12,
  },
  iconFallback: {
    width: 16,
    height: 16,
  },
  iconFallbackLarge: {
    width: 20,
    height: 20,
  },
  iconMarginLeft: {
    marginLeft: 8,
  },
  iconMarginRight: {
    marginRight: 8,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBorder: {
    borderWidth: 1,
    borderColor: Colors.neutral[500],
    boxShadow: '0 2px 8px rgba(204,215,233,0.1)',
  },
  modalActionMargin: {
    marginLeft: 8,
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  Colors,
  Button,
  RetryButton,
  GoBackButton,
  Card,
  Modal,
  Input,
  Loading,
  Divider,
  Badge,
  Avatar,
  hexToRGBA,
  blendColors,
  isColorDark,
  getContrastRatio,
  meetsContrastGuidelines,
  Typography,
};

export { default as Icon } from './Icon';
