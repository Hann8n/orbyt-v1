import { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

const wrapperStyle = StyleSheet.create({
  wrapper: { width: '100%', alignSelf: 'stretch' },
}).wrapper;

/**
 * TrueSheet's footer is position:absolute and overlays the content area.
 * The package does not expose footer height or content inset, so list content
 * gets cut off unless we add bottom padding equal to the footer height.
 *
 * This hook lets you measure the footer once via onLayout and use that value
 * for content padding (e.g. list contentContainerStyle.paddingBottom), so you
 * don't have to hardcode magic numbers (96, 52, 44+8, etc.).
 *
 * Usage:
 *   const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(96);
 *   <TrueSheet
 *     footer={wrapFooter(<MyFooter />)}
 *     ...
 *   >
 *     <LegendList contentContainerStyle={{ paddingBottom: contentBottomPadding }} ... />
 *   </TrueSheet>
 *
 * @param fallbackHeight - Used before first layout and when measured height is 0 (e.g. 96 for comment input, 52 for cancel button).
 */
export function useMeasuredFooterHeight(
  fallbackHeight: number
): [number, (footer: React.ReactNode) => React.ReactElement] {
  const [height, setHeight] = useState(fallbackHeight);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { height: h } = e.nativeEvent.layout;
    if (h > 0) {
      setHeight(h);
    }
  }, []);

  const wrapFooter = useCallback(
    (footer: React.ReactNode): React.ReactElement => (
      <View onLayout={onLayout} collapsable={false} style={wrapperStyle}>
        {footer}
      </View>
    ),
    [onLayout]
  );

  const contentBottomPadding = height > 0 ? height : fallbackHeight;
  return [contentBottomPadding, wrapFooter];
}
