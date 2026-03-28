import ProfileScreen from './index';
import { useAuth } from '@/stores/userStore';

/**
 * Shared “other user” profile for stacks under home / explore / activity tabs.
 * Keeps `user/[did]` route files as one-line re-exports so Metro always resolves a real module.
 */
export default function ProfileByDidTabRoute() {
  const { signOut } = useAuth();
  return <ProfileScreen onLogout={signOut} />;
}
