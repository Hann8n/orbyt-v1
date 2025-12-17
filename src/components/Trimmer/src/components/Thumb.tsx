import React from 'react';
import Svg, { Rect } from 'react-native-svg';

type ThumbProps = {
  color?: string;
};

export function StartThumb({ color = 'white' }: ThumbProps) {
  const height = 75;
  const horizontalLineHeight = 5;
  const verticalLineWidth = 10;
  // Vertical line left edge at x=0 to align with trim position
  // Horizontal lines maintain original visual position
  return (
    <Svg width={24} height={height} viewBox={`0 0 24 ${height}`}>
      {/* Top horizontal line (thicker) */}
      <Rect x="3" y="0" width="14" height={horizontalLineHeight} fill={color} rx="2.5" />
      {/* Vertical line (thick) - left edge aligns with slider trim position */}
      <Rect x="0" y="0" width={verticalLineWidth} height={height} fill={color} rx="5" />
      {/* Bottom horizontal line (thicker) */}
      <Rect x="3" y={height - horizontalLineHeight} width="14" height={horizontalLineHeight} fill={color} rx="2.5" />
    </Svg>
  );
}

export function EndThumb({ color = 'white' }: ThumbProps) {
  const height = 75;
  const horizontalLineHeight = 5;
  const verticalLineWidth = 10;
  // Vertical line right edge at x=24 to align with trim position
  // Horizontal lines maintain original visual position
  return (
    <Svg width={24} height={height} viewBox={`0 0 24 ${height}`}>
      {/* Top horizontal line (thicker) - flipped */}
      <Rect x="8" y="0" width="14" height={horizontalLineHeight} fill={color} rx="2.5" />
      {/* Vertical line (thick) - right edge aligns with slider trim position */}
      <Rect x={24 - verticalLineWidth} y="0" width={verticalLineWidth} height={height} fill={color} rx="5" />
      {/* Bottom horizontal line (thicker) - flipped */}
      <Rect x="8" y={height - horizontalLineHeight} width="14" height={horizontalLineHeight} fill={color} rx="2.5" />
    </Svg>
  );
}

