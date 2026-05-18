import { Platform, Pressable, type PressableProps, type View } from 'react-native';
import { NATIVE_PRESSABLE_ACTIVE_OPACITY } from '@/utils/constants';

export type NativePressableProps = PressableProps & {
  /**
   * Android: default ripple uses `borderless` when no `android_ripple` prop is passed.
   * @default false
   */
  androidRippleBorderless?: boolean;
  /**
   * Opacity while pressed (1 = no dim). Defaults to {@link NATIVE_PRESSABLE_ACTIVE_OPACITY}.
   * Applied via Pressable's style render-prop on iOS; ignored on Android (ripple used instead).
   */
  activeOpacity?: number;
};

/**
 * Platform-default press visuals: Material ripple on Android, opacity fade on iOS.
 * Uses Pressable on both platforms (Fabric-native; TouchableOpacity is old-arch).
 */
export const NativePressable = function NativePressable({
  ref,
  style,
  children,
  androidRippleBorderless = false,
  activeOpacity = NATIVE_PRESSABLE_ACTIVE_OPACITY,
  android_ripple: androidRippleFromProps,
  ...rest
}: NativePressableProps & {
  ref?: React.Ref<View>;
}) {
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

  return (
    <Pressable
      ref={ref}
      style={({ pressed }) => {
        const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;
        if (!pressed) return resolvedStyle;
        // Multiply into any existing opacity so we dim rather than override it
        const flatStyle = Array.isArray(resolvedStyle)
          ? Object.assign({}, ...resolvedStyle.filter(Boolean))
          : (resolvedStyle ?? {});
        const baseOpacity = (flatStyle as { opacity?: number }).opacity ?? 1;
        return [resolvedStyle, { opacity: baseOpacity * activeOpacity }];
      }}
      {...rest}
    >
      {children}
    </Pressable>
  );
};
