import ProfileScreen from './index';
import { useAuth } from '@/stores/userStore';

export default function ProfileTabOtherUserRoute() {
  const { signOut } = useAuth();
  return <ProfileScreen onLogout={signOut} />;
}
