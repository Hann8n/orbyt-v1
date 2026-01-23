import { Redirect } from 'expo-router';
import { useSession } from '../src/context/SessionProvider';
import { useUserStore } from '../src/stores/userStore';

export default function Index() {
  const { isLoading } = useSession();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);

  // Wait for auth state to load before redirecting - prevents login screen flash
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)" />;
}
