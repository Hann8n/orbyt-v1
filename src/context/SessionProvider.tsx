/**
 * SessionProvider - Expo Router compatible auth context
 * Wraps Zustand userStore to provide React Context API for Stack.Protected
 *
 * Following Expo Router's recommended authentication pattern:
 * https://docs.expo.dev/router/advanced/authentication/
 */
import { createContext, useContext, type PropsWithChildren } from 'react';
import { useUserStore } from '../stores/userStore';

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
