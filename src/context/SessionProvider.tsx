/**
 * SessionProvider - Expo Router compatible auth context
 * Wraps Zustand userStore to provide React Context API for Stack.Protected
 */
import React, { createContext, useContext, type PropsWithChildren } from 'react';
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
  const signIn = useUserStore(state => state.signIn);
  const signOut = useUserStore(state => state.signOut);

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut: () => {
          signOut(false);
        },
        session: isAuthenticated ? 'authenticated' : null,
        isLoading: isAuthenticating,
      }}>
      {children}
    </AuthContext.Provider>
  );
}
