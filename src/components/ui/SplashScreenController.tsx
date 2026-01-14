/**
 * SplashScreenController - Manages splash screen visibility during auth loading
 * Keeps splash screen visible until authentication state is determined
 */
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useSession } from '../../context/SessionProvider';

export function SplashScreenController() {
  const { isLoading } = useSession();

  useEffect(() => {
    // Hide splash when auth state is determined
    if (!isLoading) {
      // Small delay to ensure layout is ready
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {
          // Ignore errors - splash screen might already be hidden
        });
      }, 100);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading]);

  return null;
}
