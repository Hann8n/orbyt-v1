import ProfileScreen from '../(tabs)/profile';
import { useAuth } from '@/stores/userStore';

/**
 * Stack route for /profile/[did] — same UI as the profile tab, driven by search params.
 * Keeps file-based routing aligned with <Stack.Screen name="profile/[did]" /> in the root layout.
 */
export default function ProfileByDidRoute() {
  const { signOut } = useAuth();
  return <ProfileScreen onLogout={signOut} />;
}
