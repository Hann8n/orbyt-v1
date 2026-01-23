/**
 * SplashScreenController - Manages splash screen visibility during auth loading
 * Follows Expo Router documentation pattern: keeps splash visible until auth loads
 */
import { SplashScreen } from 'expo-router';
import { useSession } from '../../context/SessionProvider';

export function SplashScreenController() {
  const { isLoading } = useSession();

  // Hide splash when auth state is determined (synchronous per docs)
  if (!isLoading) {
    SplashScreen.hide();
  }

  return null;
}
