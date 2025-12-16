import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../../ui/UI';

type ThumbProps = {
  color?: string;
};

export function StartThumb({ color = '#7442ff' }: ThumbProps) {
  return (
    <Svg width={10} height={70} viewBox="0 0 10 70">
      <Path
        d="M 5 0 L 10 0 L 10 70 L 5 70 A 5 5 0 0 1 0 65 L 0 5 A 5 5 0 0 1 5 0 Z"
        fill={color}
      />
    </Svg>
  );
}

export function EndThumb({ color = '#7442ff' }: ThumbProps) {
  return (
    <Svg width={10} height={70} viewBox="0 0 10 70">
      <Path
        d="M 0 0 L 5 0 A 5 5 0 0 1 10 5 L 10 65 A 5 5 0 0 1 5 70 L 0 70 Z"
        fill={color}
      />
    </Svg>
  );
}

