/**
 * SplashScreenController - Manages splash screen visibility during auth loading
 * Keeps splash screen visible until authentication state is determined
 */
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useSession } from '../../context/SessionProvider';
import { useAppStore } from '../../stores/appStore';

export function SplashScreenController() {
  const { isLoading } = useSession();
  const fontsLoaded = useAppStore(state => state.fontsLoaded);

  useEffect(() => {
    // Hide splash when both fonts are loaded and auth state is determined
    if (!isLoading && fontsLoaded) {
      // Small delay to ensure layout is ready
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {
          // Ignore errors - splash screen might already be hidden
        });
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, fontsLoaded]);

  return null;
}
