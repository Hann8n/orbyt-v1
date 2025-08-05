import React from 'react';
import { SvgXml } from 'react-native-svg';
import Svg, { Path, Rect } from 'react-native-svg';
import { icons as pixelarticons } from '@iconify-json/pixelarticons';
import { icons as streamlinePixel } from '@iconify-json/streamline-pixel';
import { Colors } from './UI';
import { StyleProp, ViewStyle } from 'react-native';

// Custom Plus Icon component
export const PlusIcon: React.FC<{ size: number; color: string; strokeWidth: number }> = ({ 
  size, 
  color, 
  strokeWidth 
}) => {
  const center = size / 2;
  const halfStroke = strokeWidth / 2;
  
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path
        d={`M ${center} ${halfStroke} L ${center} ${size - halfStroke}`}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d={`M ${halfStroke} ${center} L ${size - halfStroke} ${center}`}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
};

// Custom Check Icon component
export const CheckIcon: React.FC<{ size: number; color: string; strokeWidth: number }> = ({ 
  size, 
  color, 
  strokeWidth 
}) => {
  const padding = strokeWidth * 1.5;
  const startX = padding;
  const startY = size * 0.6;
  const midX = size * 0.4;
  const midY = size * 0.8;
  const endX = size - padding;
  const endY = padding;
  
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Path
        d={`M ${startX} ${startY} L ${midX} ${midY} L ${endX} ${endY}`}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

// Custom List View Icon component
export const ListViewIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 20 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {/* First video card */}
      <Rect x={2} y={3} width={16} height={6} rx={1.5} fill={color} opacity={1} />
      {/* Second video card (partially visible, mid-scroll effect) */}
      <Rect x={2} y={11} width={16} height={6} rx={1.5} fill={color} opacity={0.5} />
    </Svg>
  );
};

// Custom Grid View Icon component
export const GridViewIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 20 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {/* 3x2 grid of video cards */}
      {/* Row 1 */}
      <Rect x={2} y={3} width={4} height={6} rx={1.5} fill={color} opacity={1} />
      <Rect x={8} y={3} width={4} height={6} rx={1.5} fill={color} opacity={1} />
      <Rect x={14} y={3} width={4} height={6} rx={1.5} fill={color} opacity={1} />
      {/* Row 2 */}
      <Rect x={2} y={11} width={4} height={6} rx={1.5} fill={color} opacity={1} />
      <Rect x={8} y={11} width={4} height={6} rx={1.5} fill={color} opacity={1} />
      <Rect x={14} y={11} width={4} height={6} rx={1.5} fill={color} opacity={1} />
    </Svg>
  );
};

// Custom Backslash Icon component for feed indicators
export const SlashIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 12 }) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
              <Path
          d="M9 1L3 11"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
    </Svg>
  );
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  strokeWidth?: number;
  iconSet?: 'pixelarticons' | 'streamline-pixel';
}

const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 24, 
  color = Colors.TEXT.PRIMARY, 
  style, 
  strokeWidth = 1.75,
  iconSet = 'pixelarticons'
}) => {
  try {
    const icons = iconSet === 'streamline-pixel' ? streamlinePixel : pixelarticons;
    let iconData = icons.icons[name];
    let usedName = name;
    if (!iconData) {
      // Log a warning and stack trace
      console.warn(`Icon not found: ${name} in ${iconSet}`);
      console.trace();
      // Try to use a fallback icon
      usedName = 'question-mark';
      iconData = icons.icons[usedName];
      if (!iconData) {
        // If fallback also not found, return null
        return null;
      }
    }

    const svgXml = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${icons.width} ${icons.height}" xmlns="http://www.w3.org/2000/svg" stroke-width="${strokeWidth}">
        ${iconData.body.replace(/currentColor/g, color)}
      </svg>
    `;

    return <SvgXml xml={svgXml} width={size} height={size} style={style} />;
  } catch (error) {
    console.error(`Error rendering icon ${name}:`, error);
    return null;
  }
};

export default Icon;