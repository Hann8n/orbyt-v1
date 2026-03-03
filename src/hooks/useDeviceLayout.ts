import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { classifyDevice, type DeviceClass } from '../utils/device/screen';

// Tolerance absorbs dp-rounding on high-density screens.
const NATIVE_16x9 = 16 / 9 - 0.02; // ≈ 1.758

export interface DeviceLayout extends DeviceClass {
  screenWidth: number;
  screenHeight: number;
  /** Height minus top safe-area inset — use this for full-screen video sizing. */
  availableHeight: number;
  /** Screen aspect ratio (h/w) ≥ 16/9. Key camera sizing off this, not isSmallPhone. */
  fitsNative16x9: boolean;
  /** Math.min(width * 16/9, availableHeight) — ready to use as a height style value. */
  cameraHeightFor16x9: number;
}

export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();

  return useMemo(() => {
    const availableHeight = height - top;
    return {
      ...classifyDevice(width, height),
      screenWidth: width,
      screenHeight: height,
      availableHeight,
      fitsNative16x9: height / width >= NATIVE_16x9,
      cameraHeightFor16x9: Math.min((width * 16) / 9, availableHeight),
    };
  }, [width, height, top]);
}
