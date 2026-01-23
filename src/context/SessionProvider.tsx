/**
 * SessionProvider - Expo Router compatible auth context
 * Wraps Zustand userStore to provide React Context API for Stack.Protected
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
  const isAuthenticating = useUserStore(state => state.isAuthenticating);
  const isInitializingAuth = useUserStore(state => state.isInitializingAuth);
  const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
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
        // Use active DID as session key so Stack.Protected stays mounted during switches
        session: isAuthenticated && activeAccountDid ? activeAccountDid : null,
        // Include initial auth loading state - this controls splash screen visibility
        isLoading: isInitializingAuth || isAuthenticating || isSwitchingAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
