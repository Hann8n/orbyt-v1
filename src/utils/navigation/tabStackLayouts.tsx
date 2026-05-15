import { Stack } from 'expo-router';

import { Colors } from '@/theme';

/** Shared stack options for each tab (profile/channel pushes stay under tabs). */
const tabStackScreenOptions = {
  headerShown: false as const,
  contentStyle: { backgroundColor: Colors.black },
  animation: 'slide_from_right' as const,
};

/** Regular functions to avoid inline arrow functions */
const getUserSingularName = (_name: string, _params: Record<string, unknown>) =>
  (_params?.did as string | undefined) ?? 'unknown-user';

const getChannelSingularName = (_name: string, _params: Record<string, unknown>) =>
  (_params?.id as string | undefined) ?? 'unknown-channel';

/**
 * Home tab lives under `(tabs)/home` so the tab segment name (`home`) never collides with the stack’s
 * root screen name (`index` from `index.tsx`). Duplicate `index` (tab + screen) breaks nested navigation.
 */
export function HomeTabStackLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="full-height-video" />
      <Stack.Screen name="user/[did]" dangerouslySingular={getUserSingularName} />
      <Stack.Screen name="channel/[id]" dangerouslySingular={getChannelSingularName} />
    </Stack>
  );
}

export function IndexExploreActivityStackLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="full-height-video" />
      <Stack.Screen name="user/[did]" dangerouslySingular={getUserSingularName} />
      <Stack.Screen name="channel/[id]" dangerouslySingular={getChannelSingularName} />
    </Stack>
  );
}

export function ProfileTabStackLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="full-height-video" />
      <Stack.Screen name="user/[did]" dangerouslySingular={getUserSingularName} />
      <Stack.Screen name="channel/[id]" dangerouslySingular={getChannelSingularName} />
    </Stack>
  );
}
