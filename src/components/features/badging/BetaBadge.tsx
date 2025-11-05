import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Svg, Polygon, G } from 'react-native-svg';

interface BetaBadgeProps {
  size?: number; // direct pixel size override
  textSize?: number; // use same mapping as VerificationBadge for consistent scale
  color?: string;
  opacity?: number;
  style?: ViewStyle;
  autoPosition?: boolean;
  customMargin?: number;
  accessibilityLabel?: string;
}

const BetaBadge: React.FC<BetaBadgeProps> = ({
  size,
  textSize,
  color = '#FFFFFF',
  opacity = 0.8,
  style,
  autoPosition = true,
  customMargin,
  accessibilityLabel = 'Beta user',
}) => {
  // Match VerificationBadge sizing behavior
  const computeSizeFromText = (t?: number) => {
    if (!t) return 20;
    let badgeSize = Math.round(t * 1.35);
    badgeSize = Math.max(14, Math.min(28, badgeSize));
    if (t <= 12) return 16;
    if (t <= 14) return 20;
    if (t <= 16) return 22;
    if (t <= 18) return 24;
    if (t <= 20) return 26;
    return 28;
  };

  const displaySize = size ?? computeSizeFromText(textSize);

  const autoMargin = () => {
    if (!autoPosition || !textSize) return {};
    if (customMargin !== undefined) return { marginLeft: customMargin };
    let marginLeft = Math.max(1, Math.min(4, Math.round(textSize * 0.12)));
    if (textSize <= 12) marginLeft = 1;
    else if (textSize <= 14) marginLeft = 1;
    else if (textSize <= 16) marginLeft = 2;
    else if (textSize <= 18) marginLeft = 2;
    else if (textSize <= 20) marginLeft = 3;
    else marginLeft = 4;
    return { marginLeft };
  };
  return (
    <Svg
      width={displaySize}
      height={displaySize}
      viewBox="0 0 200 200"
      style={[styles.badge, autoMargin(), style]}
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      {/* Scale around center (100,100) to tune visual size */}
      <G transform="translate(100 100) scale(1.3) translate(-100 -100)">
        {/* First triangle (top half of stylized B) */}
        <Polygon points="75,50 75,120 125,85" fill={color} fillOpacity={opacity} />
        {/* Second triangle (bottom half of stylized B) */}
        <Polygon points="75,80 75,150 125,115" fill={color} fillOpacity={opacity} />
      </G>
    </Svg>
  );
};

const styles = StyleSheet.create({
  badge: {
    marginLeft: 4,
    alignSelf: 'center',
  },
});

export default React.memo(BetaBadge);
