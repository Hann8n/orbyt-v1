import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardAwareFooterProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** When true, the footer will be hidden while the keyboard is open */
  hideOnKeyboard?: boolean;
  /** extra bottom padding applied when keyboard is closed */
  bottomPadding?: number;
}

const KeyboardAwareFooter: React.FC<KeyboardAwareFooterProps> = ({
  children,
  style,
  hideOnKeyboard = false,
  bottomPadding = 0,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const keyboardShowEvent = useMemo(
    () => (Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'),
    []
  );
  const keyboardHideEvent = useMemo(
    () => (Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'),
    []
  );

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Animated style for translateY - runs on UI thread
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  useEffect(() => {
    const handleShow = (event: any) => {
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      const effectiveHeight = Math.max(0, keyboardHeight - insets.bottom);
      setKeyboardVisible(true);

      // Run animation on UI thread with Reanimated
      translateY.value = withTiming(-effectiveHeight, {
        duration: event?.duration ?? 250,
        easing: Platform.OS === 'ios' ? Easing.out(Easing.cubic) : Easing.ease,
      });
    };

    const handleHide = (event: any) => {
      setKeyboardVisible(false);

      // Run animation on UI thread with Reanimated
      translateY.value = withTiming(0, {
        duration: event?.duration ?? 250,
        easing: Platform.OS === 'ios' ? Easing.out(Easing.cubic) : Easing.ease,
      });
    };

    const showListener = Keyboard.addListener(keyboardShowEvent, handleShow);
    const hideListener = Keyboard.addListener(keyboardHideEvent, handleHide);

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [keyboardShowEvent, keyboardHideEvent, insets.bottom, translateY]);

  if (hideOnKeyboard && keyboardVisible) {
    return null;
  }

  const flattenedStyles: ViewStyle[] = Array.isArray(style)
    ? (style.filter(Boolean) as ViewStyle[])
    : style
      ? [style]
      : [];

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingBottom: bottomPadding },
        animatedStyle,
        ...flattenedStyles,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
  },
});

export default KeyboardAwareFooter;
