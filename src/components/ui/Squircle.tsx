import React, { type ElementRef } from 'react';
import {
  SquircleView as _SquircleView,
  SquircleButton as _SquircleButton,
} from 'react-native-resquircle';
import type { SquircleViewProps } from 'react-native-resquircle';
import type { ViewStyle, StyleProp } from 'react-native';
import { StyleSheet } from 'react-native';
import { NativePressable, type NativePressableProps } from './NativePressable';
import { CORNER_SMOOTHING } from '../../utils/constants';

/**
 * SquircleView is a drop-in replacement for View that renders iOS-style superellipse corners.
 * Accepts all View style props (borderRadius, backgroundColor, padding, etc.) without changes.
 */
export const SquircleView: React.FC<SquircleViewProps> = ({
  cornerSmoothing = CORNER_SMOOTHING,
  ...props
}) => <_SquircleView cornerSmoothing={cornerSmoothing} {...props} />;

/**
 * SquircleButton is a drop-in replacement for Pressable/NativePressable.
 * Accepts all Pressable props (style, onPress, disabled, etc.) and handles press feedback natively.
 * API is identical to NativePressable for clean component swaps.
 */
export const SquircleButton = function SquircleButton({
  ref,
  cornerSmoothing = CORNER_SMOOTHING,
  ...props
}) {
  return <_SquircleButton ref={ref} cornerSmoothing={cornerSmoothing} {...props} />;
};

/** Style keys applied to the outer `SquircleView`; fill/padding stay on inner `NativePressable` for press dimming. */
const SQUIRCLE_CONTAINER_KEYS = new Set<string>([
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderWidth',
  'borderColor',
  'borderStyle',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'overflow',
  'boxShadow',
  'opacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'alignSelf',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'zIndex',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'aspectRatio',
]);

export function splitStyle(style: StyleProp<ViewStyle>): {
  container: ViewStyle;
  inner: ViewStyle;
} {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const container: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (SQUIRCLE_CONTAINER_KEYS.has(key)) {
      container[key] = value;
    } else {
      inner[key] = value;
    }
  }
  return { container: container as ViewStyle, inner: inner as ViewStyle };
}

function shouldFillInnerPressable(container: ViewStyle): boolean {
  return (
    container.width != null ||
    container.height != null ||
    container.flex != null ||
    container.flexGrow != null ||
    container.flexShrink != null ||
    container.flexBasis != null
  );
}

/** Same API as `NativePressable`; outer squircle clips shape, inner carries fill so iOS press dim works. */
const CLIP_STYLE: ViewStyle = { overflow: 'hidden' };

export const SquircleNativePressable = function SquircleNativePressable({
  ref,
  style,
  ...props
}: NativePressableProps & {
  ref: React.RefObject<ElementRef<typeof NativePressable>>;
}) {
  const { container, inner } = splitStyle(style as StyleProp<ViewStyle>);
  const fillInnerPressable = shouldFillInnerPressable(container);
  return (
    <SquircleView style={[container, CLIP_STYLE]} cornerSmoothing={CORNER_SMOOTHING}>
      <NativePressable ref={ref} style={[fillInnerPressable && styles.fill, inner]} {...props} />
    </SquircleView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
