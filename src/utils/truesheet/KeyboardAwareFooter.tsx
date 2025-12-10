import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Animated, Keyboard, Platform, ViewStyle, Easing } from 'react-native';
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
  const translateY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const keyboardWillShow = useMemo(() => (Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'), []);
  const keyboardWillHide = useMemo(() => (Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'), []);

  const [keyboardHeightVal, setKeyboardHeightVal] = useState(0);

  useEffect(() => {
    const showListener = Keyboard.addListener(keyboardWillShow, (e: any) => {
      const keyboardHeight = e?.endCoordinates?.height || 0;
      setKeyboardHeightVal(keyboardHeight);

      // Move the footer up by keyboard height minus the safe-area inset
      const effective = Math.max(0, keyboardHeight - insets.bottom);
      const toValue = effective;
      const duration = e?.duration ?? 160;
      Animated.timing(translateY, {
        toValue: -toValue,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });

    const hideListener = Keyboard.addListener(keyboardWillHide, (e: any) => {
      setKeyboardHeightVal(0);
      const duration = e?.duration ?? 160;
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [keyboardWillShow, keyboardWillHide, hideOnKeyboard, translateY, insets.bottom]);

  const bottomInset = keyboardHeightVal > 0 ? Math.max(8, bottomPadding) : Math.max(insets.bottom, bottomPadding);

  return (
    <Animated.View
      style={[{ transform: [{ translateY }] }, { paddingBottom: bottomInset }, style] as any}
    >
      {children}
    </Animated.View>
  );
};

export default KeyboardAwareFooter;
