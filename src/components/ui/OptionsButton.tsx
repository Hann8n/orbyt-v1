import React, { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  ViewStyle,
  TextStyle,
  StyleSheet,
  StyleProp,
} from 'react-native';
import Icon, { OutlinkIcon } from './Icon';
import { Colors } from './UI';
import { BORDER_RADIUS } from '../../utils/constants';
import { hexToRGBA } from '../../utils/formatting/colors';

// Define styles inline to avoid import path issues
const ROW_MIN_HEIGHT = 64; // paddingVertical 40 + standard right-slot 24

const buttonStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 0,
  },
  menuOption: {
    backgroundColor: Colors.neutral[900], // neutral.900 - with blue tint
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
});

const textStyles = StyleSheet.create({
  menuOptionText: {
    color: Colors.neutral[50], // neutral.50 - Orbyt White
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  menuOptionSubtitle: {
    color: Colors.neutral[500], // neutral.500
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Figtree-Regular',
    marginTop: 4,
  },
});

export type OptionsButtonLinkType = 'internal' | 'external' | 'none';

interface OptionsButtonProps {
  label: string;
  subtitle?: string;
  description?: string;
  onPress?: () => void;
  /** Auto-sets icon: internal = chevron, external = arrow-up-outlink, none = no icon */
  linkType?: OptionsButtonLinkType;
  showChevron?: boolean;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  rightIcon?: React.ReactNode;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export const OptionsButton: React.FC<OptionsButtonProps> = ({
  label,
  subtitle,
  description,
  onPress,
  linkType,
  showChevron = false,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  rightIcon,
  leftContent,
  rightContent,
  destructive = false,
  disabled = false,
  loading = false,
  style,
  textStyle,
  containerStyle,
}) => {
  // Extract color from textStyle prop
  const customTextColor = useMemo(() => {
    if (!textStyle) return null;
    if (Array.isArray(textStyle)) {
      // Check all items in array, last one takes priority
      for (let i = textStyle.length - 1; i >= 0; i--) {
        const style = textStyle[i];
        if (style && typeof style === 'object' && 'color' in style) {
          return style.color as string;
        }
      }
    } else if (typeof textStyle === 'object' && 'color' in textStyle) {
      return textStyle.color as string;
    }
    return null;
  }, [textStyle]);

  const getBackgroundColor = () => {
    if (disabled) {
      return hexToRGBA(Colors.neutral[900], 0.5); // neutral.900 @ 50%
    }
    if (destructive) return Colors.coral[950]; // coral.950 - darkest coral
    return Colors.neutral[900]; // neutral.900 - dark background with blue tint
  };

  const getTextColor = () => {
    if (disabled) {
      return hexToRGBA(Colors.neutral[50], 0.4); // neutral.50 @ 40%
    }
    if (destructive) return Colors.coral[300]; // coral.300 - vibrant salmon-coral text
    // Use custom text color if provided
    if (customTextColor) {
      return customTextColor;
    }
    return Colors.neutral[50]; // neutral.50 - Orbyt White
  };

  const getChevronColor = () => {
    return Colors.neutral[200]; // neutral.200 - light gray
  };

  const effective = (() => {
    if (showSwitch) return { showChevron: false, rightIcon: undefined as React.ReactNode };
    if (rightIcon != null) return { showChevron: false, rightIcon };
    if (linkType === 'internal') return { showChevron: true, rightIcon: undefined };
    if (linkType === 'external')
      return { showChevron: false, rightIcon: <OutlinkIcon size={24} color={getChevronColor()} /> };
    if (linkType === 'none') return { showChevron: false, rightIcon: undefined };
    return { showChevron, rightIcon: rightIcon ?? undefined };
  })();
  const effectiveShowChevron = effective.showChevron;
  const effectiveRightIcon = effective.rightIcon;

  const buttonContent = (
    <View
      style={[
        buttonStyles.menuOption,
        { backgroundColor: getBackgroundColor() },
        containerStyle,
        style,
      ]}
    >
      {leftContent ? (
        leftContent
      ) : (
        <View style={{ flexDirection: 'column', flex: 1 }}>
          <Text style={[textStyles.menuOptionText, { color: getTextColor() }, textStyle]}>
            {label}
          </Text>
          {subtitle && (
            <Text style={[textStyles.menuOptionSubtitle, { color: Colors.neutral[500] }]}>
              {subtitle}
            </Text>
          )}
          {description && (
            <Text
              style={[textStyles.menuOptionSubtitle, { color: Colors.neutral[500] }]}
              numberOfLines={1}
            >
              {description}
            </Text>
          )}
        </View>
      )}
      {rightContent ? (
        rightContent
      ) : effectiveRightIcon != null ? (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          {React.isValidElement(effectiveRightIcon)
            ? React.cloneElement(
                effectiveRightIcon as React.ReactElement<{ color?: string; size?: number }>,
                {
                  color: effectiveShowChevron
                    ? getChevronColor()
                    : ((effectiveRightIcon.props as { color?: string })?.color ?? getTextColor()),
                  size: (effectiveRightIcon.props as { size?: number })?.size ?? 24,
                }
              )
            : effectiveRightIcon}
        </View>
      ) : showSwitch ? (
        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: Colors.neutral[600], true: Colors.teal[300] }} // neutral.600 / teal.300
            thumbColor={switchValue ? Colors.neutral[50] : Colors.neutral[200]} // neutral.50 / neutral.200
            ios_backgroundColor={Colors.neutral[600]} // neutral.600
          />
        </View>
      ) : effectiveShowChevron ? (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow_right" size={24} color={getChevronColor()} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <View style={buttonStyles.wrapper}>
        <Pressable
          onPress={onPress}
          disabled={disabled || loading}
          android_ripple={{ color: hexToRGBA(Colors.neutral[50], 0.12) }}
        >
          {buttonContent}
        </Pressable>
      </View>
    );
  }

  return <View style={buttonStyles.wrapper}>{buttonContent}</View>;
};

export default OptionsButton;
