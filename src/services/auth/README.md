# OAuth Authentication for Orbyt

This is a clean, simple OAuth implementation for atproto using React Native and Expo with the `expo-atproto-auth` library.

## Features

- ✅ **OAuth Flow**: Uses expo-atproto-auth for secure OAuth authentication
- ✅ **React Native Compatible**: Works with Expo WebBrowser for authentication
- ✅ **Secure Storage**: Uses Expo SecureStore for session storage
- ✅ **Automatic Token Management**: Handles token expiration and refresh
- ✅ **Session Restoration**: Automatically restores sessions on app restart
- ✅ **Account Management**: Integrates with AccountManager for multi-account support
- ✅ **TypeScript Support**: Fully typed for better development experience

## Configuration

### Client Metadata

Your client metadata is hosted at `https://getorbyt.com/atproto-oauth-client.json` and includes:

```json
{
  "client_id": "https://getorbyt.com/atproto-oauth-client.json",
  "client_name": "Orbyt",
  "client_uri": "https://getorbyt.com",
  "logo_uri": "https://getorbyt.com/orbyt-banner.png",
  "tos_uri": "https://getorbyt.com/tos",
  "policy_uri": "https://getorbyt.com/policy",
  "redirect_uris": ["com.getorbyt:/oauth/callback"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "native",
  "dpop_bound_access_tokens": true
}
```

### App Configuration

Your app is configured with the custom URL scheme `com.getorbyt` in `app.json`:

```json
{
  "expo": {
    "scheme": "com.getorbyt"
  }
}
```

## Usage

### Basic Authentication

```typescript
import { useOAuth } from '../services/auth';

function MyComponent() {
  const { session, isSigningIn, signIn, signOut } = useOAuth();

  const handleSignIn = async () => {
    try {
      await signIn('bsky.social');
      console.log('Signed in successfully!');
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  if (session) {
    return <Text>Signed in as: {session.did}</Text>;
  }

  return (
    <Button 
      title={isSigningIn ? "Signing in..." : "Sign In"}
      onPress={handleSignIn}
      disabled={isSigningIn}
    />
  );
}
```

### Session Restoration

```typescript
const { restoreSession } = useOAuth();

// Restore a session using a DID
await restoreSession('did:plc:example123');
```

### Making Authenticated Requests

```typescript
const { makeAuthenticatedRequest } = useOAuth();

// Make a request to the Bluesky API
const response = await makeAuthenticatedRequest(
  'https://bsky.social/xrpc/app.bsky.feed.getTimeline',
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }
);
```

### Integration with AtprotoService

The OAuth service automatically integrates with the existing `AtprotoService`. When an OAuth session is active, all API calls will use OAuth authentication. When no OAuth session is available, it falls back to app password authentication.

```typescript
// This will automatically use OAuth if available, otherwise app password
const user = await AtprotoService.getCurrentUser();
```

### Account Management

OAuth accounts are automatically saved and managed through the `AccountManager`:

```typescript
import { AccountManager } from '../services/storage/AccountManager';

// Save an OAuth account
const account = await AccountManager.saveOAuthAccount(session, displayName, avatar);

// Switch to an OAuth account
await AccountManager.switchAccount(account.id);
```

## Architecture

### OAuthService

The `AtProtoOAuthService` class manages OAuth sessions using the `expo-atproto-auth` library:

- **Session Management**: Handles OAuth session creation, storage, and restoration
- **Token Handling**: Automatically manages access and refresh tokens
- **API Integration**: Provides authenticated request methods

### useOAuth Hook

The `useOAuth` React hook provides a simple interface for OAuth authentication:

- **State Management**: Manages loading, error, and session states
- **Authentication Methods**: Provides sign-in, sign-out, and session restoration
- **Request Handling**: Offers authenticated request capabilities

### Integration Points

- **App.tsx**: Checks for OAuth sessions on app startup
- **LoginScreen**: Handles OAuth authentication flow
- **AccountManager**: Manages OAuth accounts alongside app password accounts
- **AtprotoService**: Uses OAuth sessions when available

## Error Handling

The OAuth service includes comprehensive error handling:

- **Session Expiration**: Automatically detects and handles expired sessions
- **Network Errors**: Gracefully handles network connectivity issues
- **User Cancellation**: Properly handles user cancellation of OAuth flow
- **Fallback Authentication**: Falls back to app password authentication when OAuth fails

## Security

- **Secure Storage**: All sessions are stored using Expo SecureStore
- **Token Management**: Access tokens are managed securely by the expo-atproto-auth library
- **Session Validation**: Sessions are validated on restoration
- **Automatic Cleanup**: Expired sessions are automatically cleared
