import { Stack } from 'expo-router';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
