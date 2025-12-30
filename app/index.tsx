import { Redirect } from 'expo-router';
import { useUserStore } from '../src/stores/userStore';

export default function Index() {
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }
  
  return <Redirect href="/(tabs)" />;
}
