import React from 'react';
import { SvgXml } from 'react-native-svg';
import { icons as pixelarticons } from '@iconify-json/pixelarticons';
import { icons as streamlinePixel } from '@iconify-json/streamline-pixel';
import { Colors } from './UI';
import { StyleProp, ViewStyle } from 'react-native';

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
    const iconData = icons.icons[name];
    
    if (!iconData) {
      console.warn(`Icon not found: ${name} in ${iconSet}`);
      return null;
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