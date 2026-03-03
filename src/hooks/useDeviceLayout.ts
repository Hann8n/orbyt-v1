import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { classifyDevice, type DeviceClass } from '@/utils/device/screen';

// Tolerance absorbs dp-rounding on high-density screens.
const NATIVE_16x9 = 16 / 9 - 0.02; // ≈ 1.758

export interface DeviceLayout extends DeviceClass {
  screenWidth: number;
  screenHeight: number;
  /** Height minus top safe-area inset. */
  availableHeight: number;
  /** Screen aspect ratio (h/w) ≥ 16/9. */
  fitsNative16x9: boolean;
  /** min(width * 16/9, availableHeight). */
  cameraHeightFor16x9: number;
}

/** Returns device layout. Subscribes to window dimensions and safe area insets. */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();

  return useMemo(() => {
    const safeWidth = Math.max(width, 1);
    const availableHeight = Math.max(0, height - top);
    return {
      ...classifyDevice(width, height),
      screenWidth: width,
      screenHeight: height,
      availableHeight,
      fitsNative16x9: height / safeWidth >= NATIVE_16x9,
      cameraHeightFor16x9: Math.min((safeWidth * 16) / 9, availableHeight),
    };
  }, [width, height, top]);
}
