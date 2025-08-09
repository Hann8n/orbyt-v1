import AccountManager from '../services/storage/AccountManager';

interface NavigateOptions {
  isModal?: boolean;
  delayMs?: number;
}

/**
 * Centralized profile navigation: if target equals active account, switch to Profile tab.
 * Falls back to pushing AuthorProfile when navigating to other users.
 */
export async function navigateToUserProfile(
  navigation: any,
  params: { handle?: string; did?: string },
  options: NavigateOptions = {}
) {
  try {
    const active = await AccountManager.getActiveAccount();
    const targetHandle = params.handle?.trim();
    const targetDid = params.did?.trim();

    const isSelf = Boolean(
      active && (
        (targetDid && active.did === targetDid) ||
        (targetHandle && active.handle && active.handle.toLowerCase() === targetHandle.toLowerCase())
      )
    );

    if (isSelf) {
      // Climb to the root navigator and select the Profile tab
      const navigateToProfileTab = () => {
        let rootNav: any = navigation;
        while (rootNav?.getParent?.()) {
          rootNav = rootNav.getParent();
        }
        // Prefer nested navigation to the tab container
        if (rootNav?.navigate) {
          rootNav.navigate('Main', { screen: 'Profile' });
        } else {
          // Fallback: try direct
          navigation?.navigate?.('Profile');
        }
      };

      if (options.isModal) {
        navigation?.goBack?.();
        setTimeout(navigateToProfileTab, options.delayMs ?? 150);
      } else {
        navigateToProfileTab();
      }
      return;
    }

    // Navigate to other user's profile
    if (targetHandle) {
      const parentNav = navigation?.getParent?.() || navigation;
      if (options.isModal) {
        navigation?.goBack?.();
        setTimeout(() => parentNav?.navigate?.('AuthorProfile', { handle: targetHandle }), options.delayMs ?? 150);
      } else {
        parentNav?.navigate?.('AuthorProfile', { handle: targetHandle });
      }
      return;
    }

    // If only DID was provided and it's not self, attempt best-effort: send DID as handle param
    if (targetDid) {
      const parentNav = navigation?.getParent?.() || navigation;
      if (options.isModal) {
        navigation?.goBack?.();
        setTimeout(() => parentNav?.navigate?.('AuthorProfile', { handle: targetDid }), options.delayMs ?? 150);
      } else {
        parentNav?.navigate?.('AuthorProfile', { handle: targetDid });
      }
    }
  } catch (error) {
    // Fallback to default behavior on error
    const targetHandle = params.handle?.trim();
    if (targetHandle) {
      navigation?.navigate?.('AuthorProfile', { handle: targetHandle });
    }
  }
}

export default navigateToUserProfile;


