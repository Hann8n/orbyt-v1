# Update Share Links to getorbyt.com

## Overview

Update share links throughout the app to use `getorbyt.com` instead of `bsky.app`. This includes:

- Profile share links (profile menu and settings)
- Post/video share links

**Important**: Handles can also be DIDs. Always default to handle if available, fall back to DID if handle is invalid/missing. Use simplest structure possible.

## Files to Update

### 1. Profile Share Links

**`app/settings/SettingsScreen.tsx` (line 123)**

- Update `handleCopyProfileLink` function
- Change from: `https://bsky.app/profile/${currentUser.handle}`
- Change to: Use `getOrbytProfileUrl(currentUser.handle, currentUser.did)`
- Function returns: `https://getorbyt.com/@${handle || did}`

**`src/components/features/profile/ProfileMenu.tsx` (line 224)**

- Update `handleShare` function
- Change from: `https://bsky.app/profile/${handle}`
- Change to: Use `getOrbytProfileUrl(handle, profile?.did)`
- The `profile` data is available from `useProfile` hook (line 62)
- Function returns: `https://getorbyt.com/@${handle || did}`

### 2. Post/Video Share Links

**`src/utils/links/bluesky.ts`**

- Add utility function `getOrbytProfileUrl(handle?: string, did?: string): string`
  - Returns: `https://getorbyt.com/@${handle || did}`
  - Simplest structure: use handle if available, otherwise use did
- Add utility function `convertAtUriToOrbytUrl(atUri: string, handle?: string, did?: string): string`
  - Extracts rkey from AT URI (same pattern as existing `convertAtUriToBlueskyUrl`)
  - Returns: `https://getorbyt.com/@${handle || did}/${rkey}`
  - Follows existing naming convention for consistency

**`src/components/ui/ShareSheet.tsx` (line 335-349)**

- Update `handleShare` callback
- Change from: `convertAtUriToBlueskyUrl(postUri)`
- Change to: Use new `convertAtUriToOrbytUrl(postUri, authorHandle, authorDid)` function
- Note: `authorHandle` and `authorDid` are already available in ShareSheet data (line 102)

## Implementation Details

The AT URI format is: `at://did:plc:abc123/app.bsky.feed.post/rkey`

- Extract rkey from position 2 in the URI parts (after splitting by `/`)
- Combine with identifier: `https://getorbyt.com/@${handle || did}/${rkey}`

URL format examples:

- Profile with handle: `https://getorbyt.com/@handle.bsky.social`
- Profile with DID: `https://getorbyt.com/@did:plc:2ycqh77xwhzekhof3k36kwsk`
- Post with handle: `https://getorbyt.com/@handle.bsky.social/3l4fcryvqvv2l`
- Post with DID: `https://getorbyt.com/@did:plc:2ycqh77xwhzekhof3k36kwsk/3l4fcryvqvv2l`

All required data (handles, DIDs, post URIs) is already available in the existing data structures - no additional API calls needed.
