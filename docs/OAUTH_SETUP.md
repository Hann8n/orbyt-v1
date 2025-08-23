# OAuth Setup for Orbyt

This document explains how to set up OAuth authentication for the Orbyt app using atproto's OAuth specification.

## Overview

The Orbyt app now supports both OAuth and app password authentication methods. OAuth provides a more secure and user-friendly authentication experience, while app passwords remain available as a fallback option.

**Note**: The OAuth implementation now uses the official `@atproto/oauth-client` package for proper OAuth flow handling.

## Files Created/Modified

### Website Files (docs/)
- `atproto-oauth-client.json` - OAuth client metadata
- `jwks.json` - JSON Web Key Set for token verification
- `callback.html` - OAuth callback page
- `OAUTH_SETUP.md` - This documentation

### App Files (src/)
- `services/api/OAuthService.ts` - OAuth service implementation using @atproto/oauth-client
- `services/api/AtprotoService.tsx` - Updated to support both auth methods
- `services/storage/AccountManager.ts` - Updated to handle OAuth accounts
- `screens/LoginScreen.tsx` - Updated UI for auth method selection
- `App.tsx` - Updated to handle OAuth callbacks

### Scripts
- `scripts/generate-jwks.js` - Script to generate JWKS keys

## Setup Instructions

### 1. Generate JWKS Keys

Run the following command to generate the required cryptographic keys:

```bash
npm run generate:jwks:multiple
```

This will:
- Generate 3 RSA key pairs for key rotation
- Save the public keys to `docs/jwks.json`
- Save the private keys to `private-keys.json` (for development)

⚠️ **Important**: Never commit `private-keys.json` to version control!

### 2. Deploy Website Files

Ensure the following files are accessible at your website:
- `https://getorbyt.com/atproto-oauth-client.json`
- `https://getorbyt.com/jwks.json`
- `https://getorbyt.com/callback.html`

### 3. Configure App URL Scheme

The app is configured with the URL scheme `orbyt://` to handle OAuth callbacks. This is already set up in `app.json`.

### 4. Test OAuth Flow

1. Build and run the app
2. On the login screen, select "OAuth" as the authentication method
3. Enter your Bluesky handle
4. The app will open your browser for OAuth authentication
5. Complete the authentication in the browser
6. Return to the app - you should be automatically logged in

## OAuth Flow

1. **User initiates OAuth**: User selects OAuth and enters their handle
2. **App generates authorization URL**: Creates a proper OAuth authorization URL using @atproto/oauth-client
3. **Browser opens**: User is redirected to Bluesky's authorization page
4. **User authorizes**: User grants permission to the Orbyt app
5. **Callback**: Bluesky redirects to `https://getorbyt.com/callback.html`
6. **App receives callback**: The callback page redirects to `orbyt://oauth/callback`
7. **App processes callback**: App processes the callback and exchanges code for tokens

## Security Considerations

- **Private Keys**: Keep private keys secure and never expose them in client-side code
- **Key Rotation**: Use multiple keys and rotate them periodically
- **State Validation**: OAuth state is validated to prevent CSRF attacks
- **Session Management**: OAuth sessions are stored securely using Expo SecureStore
- **Token Refresh**: The OAuth client automatically handles token refresh

## Implementation Details

### OAuth Client Configuration

The app uses the `@atproto/oauth-client` package with the following configuration:

```typescript
const oauthClient = new OAuthClient({
  handleResolver: 'https://bsky.social',
  responseMode: 'query',
  
  clientMetadata: {
    client_id: 'https://getorbyt.com/atproto-oauth-client.json',
    jwks_uri: 'https://getorbyt.com/jwks.json',
  },

  runtimeImplementation: {
    // Crypto operations for React Native
    createKey: JoseKey.generate,
    getRandomValues: crypto.getRandomValues,
    digest: crypto.subtle.digest,
    requestLock: // In-memory lock implementation
  },

  stateStore: {
    // SecureStore-based state management
    set: SecureStore.setItemAsync,
    get: SecureStore.getItemAsync,
    del: SecureStore.deleteItemAsync,
  },

  sessionStore: {
    // SecureStore-based session management
    set: SecureStore.setItemAsync,
    get: SecureStore.getItemAsync,
    del: SecureStore.deleteItemAsync,
  },
});
```

### Session Management

The OAuth implementation provides:
- Automatic token refresh
- Secure session storage
- Proper session restoration
- Session revocation on logout

### Error Handling

The implementation includes comprehensive error handling for:
- Network failures
- Invalid OAuth responses
- Token refresh failures
- Session expiration

## Troubleshooting

### OAuth Not Available
If OAuth is not showing as an option:
1. Check that `docs/atproto-oauth-client.json` is accessible
2. Check that `docs/jwks.json` is accessible
3. Verify the OAuth client metadata is valid
4. Check the app logs for any errors

### Callback Issues
If OAuth callbacks are not working:
1. Check that the URL scheme `orbyt://` is properly configured
2. Verify that `docs/callback.html` is accessible
3. Check the app logs for any errors
4. Ensure the callback URL matches the redirect_uri in client metadata

### Key Generation Issues
If you encounter issues generating keys:
1. Ensure Node.js crypto module is available
2. Check file permissions for writing to docs/ directory
3. Verify the script has proper error handling

### Token Refresh Issues
If token refresh is failing:
1. Check that the refresh token is valid
2. Verify the OAuth client configuration
3. Check network connectivity to the OAuth server
4. Review the session store implementation

## Production Considerations

For production deployment:

1. **Key Management**: Use a proper key management service (AWS KMS, Azure Key Vault, etc.)
2. **Session Storage**: Consider using a more robust session storage solution
3. **Monitoring**: Implement proper logging and monitoring for OAuth flows
4. **Rate Limiting**: Implement rate limiting for OAuth endpoints
5. **Security Headers**: Ensure proper security headers on your website
6. **HTTPS**: Ensure all OAuth communication uses HTTPS

## Testing

To test the OAuth implementation:

1. **Unit Tests**: Test individual OAuth service methods
2. **Integration Tests**: Test the complete OAuth flow
3. **Error Scenarios**: Test various error conditions
4. **Token Refresh**: Test automatic token refresh
5. **Session Management**: Test session storage and retrieval

## Support

For issues with the OAuth implementation:

1. Check the ATProto OAuth documentation
2. Review the @atproto/oauth-client package documentation
3. Check the app logs for detailed error messages
4. Verify all configuration files are properly deployed
