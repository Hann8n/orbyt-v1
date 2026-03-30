/**
 * SessionProvider - Expo Router compatible auth context
 * Wraps Zustand userStore to provide React Context API for Stack.Protected
 *
 * Following Expo Router's recommended authentication pattern:
 * https://docs.expo.dev/router/advanced/authentication/
 */
import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import { useUserStore } from '../stores/userStore';
import { dismissAllSheets } from '../utils/navigation';
import { useModalStore } from '../stores/modalStore';

const AuthContext = createContext<{
  signIn: (identifier: string) => Promise<void>;
  signOut: () => void;
  session?: string | null;
  isLoading: boolean;
}>({
  signIn: () => Promise.resolve(),
  signOut: () => null,
  session: null,
  isLoading: false,
});

// Use this hook to access the user info in components that need Expo Router's API
export function useSession() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  // Get auth state from Zustand store
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const isInitializingAuth = useUserStore(state => state.isInitializingAuth);
  const activeAccountDid = useUserStore(state => state.activeAccountDid);
  const signIn = useUserStore(state => state.signIn);
  const signOut = useUserStore(state => state.signOut);
  const resetAllModals = useModalStore(state => state.resetAllModals);

  useEffect(() => {
    if (!isAuthenticated) {
      // Ensure all native sheets close on logout/session interruption.
      dismissAllSheets();
      // Keep JS visibility state in sync so sheets don't reopen.
      resetAllModals();
    }
  }, [isAuthenticated, resetAllModals]);

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut: () => {
          signOut(false);
        },
        // Use active DID as session key - Stack.Protected uses this for routing
        session: isAuthenticated && activeAccountDid ? activeAccountDid : null,
        // Only show splash during initial auth state restoration
        // Sign-in and account switching have their own loading indicators
        isLoading: isInitializingAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
