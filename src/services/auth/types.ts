export interface OAuthSession {
  did: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthState {
  session: OAuthSession | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
}
