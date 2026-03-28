import React, { forwardRef } from 'react';
import {
  Platform,
  Pressable,
  TouchableOpacity,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { NATIVE_PRESSABLE_ACTIVE_OPACITY } from '@/utils/constants';

export type NativePressableProps = PressableProps & {
  /**
   * Android: default ripple uses `borderless` when no `android_ripple` prop is passed.
   * @default false
   */
  androidRippleBorderless?: boolean;
  /**
   * iOS only. Opacity while pressed (1 = no dim). Defaults to {@link NATIVE_PRESSABLE_ACTIVE_OPACITY}.
   */
  activeOpacity?: number;
};

function orUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

/**
 * Platform-default press visuals: Material ripple on Android, subtle `TouchableOpacity` fade on iOS
 * (`activeOpacity` from {@link NATIVE_PRESSABLE_ACTIVE_OPACITY}, overridable per instance).
 *
 * Render-prop `children` is only supported via `Pressable` (no iOS opacity animation).
 */
export const NativePressable = forwardRef<View, NativePressableProps>(function NativePressable(
  {
    style,
    children,
    androidRippleBorderless = false,
    activeOpacity = NATIVE_PRESSABLE_ACTIVE_OPACITY,
    android_ripple: androidRippleFromProps,
    ...rest
  },
  ref
) {
  const isRenderPropChild = typeof children === 'function';

  if (Platform.OS === 'android') {
    return (
      <Pressable
        ref={ref}
        style={style}
        {...rest}
        android_ripple={androidRippleFromProps ?? { borderless: androidRippleBorderless }}
      >
        {children}
      </Pressable>
    );
  }

  if (isRenderPropChild) {
    return (
      <Pressable ref={ref} style={style} {...rest}>
        {children}
      </Pressable>
    );
  }

  const {
    onPress,
    onPressIn,
    onPressOut,
    onLongPress,
    disabled,
    hitSlop,
    delayLongPress,
    unstable_pressDelay,
    testID,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
    accessibilityState,
    accessibilityActions,
    onAccessibilityAction,
    importantForAccessibility,
    id,
  } = rest;

  return (
    <TouchableOpacity
      ref={ref as React.Ref<View>}
      activeOpacity={activeOpacity}
      style={style as StyleProp<ViewStyle>}
      onPress={orUndef(onPress)}
      onPressIn={orUndef(onPressIn)}
      onPressOut={orUndef(onPressOut)}
      onLongPress={orUndef(onLongPress)}
      disabled={orUndef(disabled)}
      hitSlop={orUndef(hitSlop)}
      delayLongPress={orUndef(delayLongPress)}
      delayPressIn={orUndef(unstable_pressDelay)}
      testID={orUndef(testID)}
      accessibilityLabel={orUndef(accessibilityLabel)}
      accessibilityHint={orUndef(accessibilityHint)}
      accessibilityRole={orUndef(accessibilityRole)}
      accessibilityState={orUndef(accessibilityState)}
      accessibilityActions={orUndef(accessibilityActions)}
      onAccessibilityAction={orUndef(onAccessibilityAction)}
      importantForAccessibility={orUndef(importantForAccessibility)}
      id={orUndef(id)}
    >
      {children}
    </TouchableOpacity>
  );
});
