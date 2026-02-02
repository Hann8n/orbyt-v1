import React from 'react';
import { ViewStyle } from 'react-native';
import { Svg, Polygon, G } from 'react-native-svg';
import { Colors } from '../../../theme';

interface BetaBadgeProps {
  size?: number; // direct pixel size override
  textSize?: number; // use same mapping as VerificationBadge for consistent scale
  color?: string;
  opacity?: number;
  style?: ViewStyle;
  autoPosition?: boolean;
  customMargin?: number;
  accessibilityLabel?: string;
  scale?: number; // scale factor for the SVG icon (default 1.0)
}

const BetaBadge: React.FC<BetaBadgeProps> = ({
  size,
  textSize,
  color = Colors.neutral[50],
  opacity = 1.0,
  style,
  autoPosition = true,
  customMargin,
  accessibilityLabel = 'Beta tester',
  scale = 1.0,
}) => {
  // Match VerificationBadge sizing behavior
  const computeSizeFromText = (t?: number) => {
    if (!t) return 20;
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
    // Small margin from text - gap between badges is handled by parent container
    let marginLeft = Math.max(0, Math.min(1, Math.round(textSize * 0.05)));
    if (textSize <= 20) marginLeft = 0;
    else marginLeft = 1;
    return { marginLeft };
  };
  return (
    <Svg
      width={displaySize}
      height={displaySize}
      viewBox="0 0 200 200"
      style={[autoMargin(), style]}
      accessibilityLabel={accessibilityLabel}
      accessible
    >
      {/* Scale around center (100,100) to tune visual size */}
      <G transform={`translate(100 100) scale(${scale}) translate(-100 -100)`}>
        {/* First triangle (top half of stylized B) */}
        <Polygon points="62.5,25 62.5,130 153.43,77.5" fill={color} fillOpacity={opacity} />
        {/* Second triangle (bottom half of stylized B) */}
        <Polygon points="62.5,77.5 62.5,182.5 153.43,130" fill={color} fillOpacity={opacity} />
      </G>
    </Svg>
  );
};

export default React.memo(BetaBadge);
