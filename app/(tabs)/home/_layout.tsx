import { HomeTabStackLayout } from '@/utils/navigation/tabStackLayouts';

/** Anchor the home stack root so deep links / tab switches resolve like Expo’s stack-in-tab pattern. */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default HomeTabStackLayout;
