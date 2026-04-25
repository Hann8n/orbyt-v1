/* global jest */
const ImageColors = {
  getColors: jest.fn().mockResolvedValue({
    platform: 'android',
    vibrant: '#ff5500',
    darkVibrant: '#aa3300',
    lightVibrant: '#ffaa88',
    dominant: '#ff5500',
    average: '#dd4400',
    muted: '#bb4400',
    darkMuted: '#882200',
    lightMuted: '#ffbb99',
  }),
};

export default ImageColors;
export type { ImageColorsResult } from 'react-native-image-colors';
