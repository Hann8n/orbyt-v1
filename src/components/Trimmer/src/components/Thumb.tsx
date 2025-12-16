import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function StartThumb() {
  return (
    <Svg width={10} height={70} viewBox="0 0 10 70">
      <Path d="M 7.5 0 L 10 0 L 10 70 L 7.5 70 A 7.5 7.5 0 0 1 0 62.5 L 0 7.5 A 7.5 7.5 0 0 1 7.5 0 Z" fill="white" />
    </Svg>
  );
}

export function EndThumb() {
  return (
    <Svg width={10} height={70} viewBox="0 0 10 70">
      <Path d="M 0 0 L 2.5 0 A 7.5 7.5 0 0 1 10 7.5 L 10 62.5 A 7.5 7.5 0 0 1 2.5 70 L 0 70 Z" fill="white" />
    </Svg>
  );
}

