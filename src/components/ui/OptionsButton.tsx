import React, { useState, useMemo } from 'react';
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
import Icon from './Icon';
import { Colors } from './UI';
import { BORDER_RADIUS } from '../../utils/constants';
import { hexToRGBA } from '../../utils/formatting/colors';

// Define styles inline to avoid import path issues
const buttonStyles = StyleSheet.create({
  menuOption: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginBottom: 12,
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
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  menuOptionSubtitle: {
    color: Colors.gray,
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Figtree-Regular',
    marginTop: 4,
  },
});

interface OptionsButtonProps {
  label: string;
  subtitle?: string;
  description?: string;
  onPress?: () => void;
  showChevron?: boolean;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  rightIcon?: React.ReactNode;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  selected?: boolean;
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
  showChevron = false,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  rightIcon,
  leftContent,
  rightContent,
  destructive = false,
  disabled = false,
  selected: _selected = false,
  loading = false,
  style,
  textStyle,
  containerStyle,
}) => {
  const [pressed, setPressed] = useState(false);

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
      return hexToRGBA(Colors.darkGray, 0.5);
    }
    if (pressed) {
      if (destructive) return '#C04A58'; // Pastel red background when pressed
      return hexToRGBA(Colors.lightGray, 0.8);
    }
    if (destructive) return Colors.darkRed;
    return Colors.darkGray;
  };

  const getTextColor = () => {
    if (disabled) {
      return hexToRGBA(Colors.white, 0.4);
    }
    if (pressed) {
      if (destructive) return Colors.darkRed; // Dark red text when pressed
      return Colors.black;
    }
    if (destructive) return '#C04A58'; // Pastel red, darker than #d65b6a
    // Use custom text color if provided
    if (customTextColor) {
      return customTextColor;
    }
    return Colors.white;
  };

  const getChevronColor = () => {
    if (pressed) {
      if (destructive) return Colors.white;
      return Colors.black;
    }
    return Colors.lightGray;
  };

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
            <Text
              style={[
                textStyles.menuOptionSubtitle,
                { color: pressed ? (destructive ? Colors.white : Colors.black) : Colors.gray },
              ]}
            >
              {subtitle}
            </Text>
          )}
          {description && (
            <Text
              style={[
                textStyles.menuOptionSubtitle,
                { color: pressed ? (destructive ? Colors.white : Colors.black) : Colors.gray },
              ]}
            >
              {description}
            </Text>
          )}
        </View>
      )}
      {rightContent ? (
        rightContent
      ) : rightIcon ? (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          {React.isValidElement(rightIcon) &&
          rightIcon.props &&
          typeof rightIcon.props === 'object' &&
          'color' in rightIcon.props
            ? React.cloneElement(rightIcon as React.ReactElement<{ color?: string }>, {
                color: getTextColor(),
              })
            : rightIcon}
        </View>
      ) : showSwitch ? (
        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: Colors.mediumGray, true: Colors.lightGreen }}
            thumbColor={switchValue ? Colors.white : Colors.lightGray}
            ios_backgroundColor={Colors.mediumGray}
          />
        </View>
      ) : showChevron ? (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="right_arrow_filled" size={24} color={getChevronColor()} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    const handlePress = () => {
      setPressed(false);
      onPress();
    };

    return (
      <View style={{ marginBottom: 0 }}>
        <Pressable
          onPress={handlePress}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          disabled={disabled || loading}
        >
          {buttonContent}
        </Pressable>
      </View>
    );
  }

  return <View style={{ marginBottom: 0 }}>{buttonContent}</View>;
};

export default OptionsButton;
