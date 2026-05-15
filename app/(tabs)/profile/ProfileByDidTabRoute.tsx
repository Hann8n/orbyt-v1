import ProfileScreen from './index';
import { useAuth } from '@/stores/userStore';

export default function ProfileByDidTabRoute() {
  const { signOut } = useAuth();
  return <ProfileScreen onLogout={signOut} />;
}
