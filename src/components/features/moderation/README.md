# Moderation System

This document describes the moderation system implementation for the Orbyt app, which provides content filtering and moderation capabilities compatible with Bluesky's moderation architecture.

## Overview

The moderation system is designed to filter content efficiently at the data layer:
1. **Data Layer**: Content is filtered during feed fetching in AtprotoService
2. **UI Layer**: Content warnings and blurring are applied (for posts that pass filtering)

## Architecture

### Core Components

#### ModerationService
The main service that handles all moderation logic and syncs with Bluesky's API:

```typescript
// Key interfaces
interface ModerationSettings {
  hideSensitiveContent: boolean;
  hideAdultContent: boolean;
  hideViolence: boolean;
  hideSpam: boolean;
  hideMisleading: boolean;
  hideBlockedUsers: boolean;
  hideMutedUsers: boolean;
  showContentWarnings: boolean;
  autoExpandContentWarnings: boolean;
  adultContentEnabled: boolean;
  adultContentOnlyMode: boolean; // NEW: Show only adult content, filter out everything else
  labels: Record<string, LabelPreference>;
  labelers: Array<{did: string, labels: Record<string, LabelPreference>}>;
  mutedWords: string[];
  hiddenPosts: string[];
}

interface ModerationDecision {
  filter: boolean;      // Should content be completely removed
  blur: boolean;        // Should content be blurred/warned
  informs: string[];    // Informational labels to show
  reason?: string;      // Reason for moderation
  source?: string;      // Source of moderation decision
}
```

#### Key Methods

- `getModerationSettings()`: **Fetches settings from Bluesky API**
- `saveModerationSettings(settings)`: **Saves settings to Bluesky API**
- `getBlockedUsers()`: **Fetches blocked users from Bluesky API**
- `getMutedUsers()`: **Fetches muted users from Bluesky API**
- `moderatePost(post, context)`: Individual post moderation
- `batchModeratePosts(posts, context)`: **Batch moderation for multiple posts** (used in fetch functions)
- `syncModerationSettings()`: **Syncs all settings from Bluesky API**
- `getModerationStats()`: Get moderation statistics
- `testModeration()`: Run moderation tests

### Integration Points

#### AtprotoService.tsx
Content filtering happens at the API fetch level, and moderation settings are fetched from Bluesky's API:

```typescript
// New API methods for moderation preferences
static async getModerationPreferences(): Promise<any>
static async updateModerationPreferences(preferences): Promise<boolean>
static async getBlockedUsersFromAPI(): Promise<string[]>
static async getMutedUsersFromAPI(): Promise<string[]>

// In AtprotoService feed methods (getFeed, getAuthorFeed, etc.)
// Apply content moderation at fetch level to reduce downstream compute
if (feedData.length > 0) {
  const moderationResult = await ModerationService.batchModeratePosts(feedData);
  feedData = moderationResult.filteredPosts;
}
```

#### Settings Integration
Moderation settings are accessible through the Settings screen:
- **Moderation Settings**: Links to Bluesky's moderation settings
- **Test Moderation (Debug)**: Opens debug interface for testing

## API Integration

### Bluesky API Integration
The moderation system now integrates directly with Bluesky's API for real-time settings:

#### Moderation Preferences
- **Fetched from**: `app.bsky.actor.getPreferences()`
- **Updated via**: `app.bsky.actor.putPreferences()`
- **Includes**: Adult content settings, label preferences, labeler configurations

#### User Lists
- **Blocked users**: Fetched from `app.bsky.graph.getBlocks()`
- **Muted users**: Fetched from `app.bsky.graph.getMutes()`
- **Real-time sync**: No local caching, always fresh from API

#### Benefits
- **Consistency**: Settings are always in sync with Bluesky web app
- **Real-time**: Changes made in other apps are immediately reflected
- **Reliability**: No local storage conflicts or sync issues

## Moderation Sources

### 1. Labels
Content can be labeled by various sources:
- **Self-labels**: Applied by content authors
- **Labeler services**: Third-party moderation services
- **Platform labels**: Applied by Bluesky's moderation team

### 2. User Actions
- **Blocked users**: Users the current user has blocked (from API)
- **Muted users**: Users the current user has muted (from API)
- **Muted words**: Keyword-based filtering
- **Hidden posts**: Individual posts the user has hidden

### 3. Content Warnings
- **Adult content**: NSFW content warnings
- **Violence**: Violent content warnings
- **Sensitive content**: General sensitive content

## Label Preferences

Users can configure how different labels are handled:

```typescript
type LabelPreference = 'hide' | 'warn' | 'ignore';

// Default label preferences
{
  'porn': 'hide',
  'sexual': 'warn',
  'nudity': 'warn',
  'violence': 'warn',
  'gore': 'hide',
  'spam': 'hide',
  'misleading': 'warn',
  'hate': 'hide',
  'intolerant': 'warn',
  'impersonation': 'hide',
  'scam': 'hide',
}
```

## Debug Features

### ModerationDebug Component
A comprehensive debug interface that provides:
- **Statistics**: Current moderation statistics
- **Test Results**: Results from moderation tests
- **Actions**: Manual test triggers

### Debug Logging
Comprehensive logging in development mode:
```typescript
[ModerationService:moderatePost] 2024-01-15T10:30:00.000Z - Moderating post at://test/post/1 in context contentList
[ModerationService:moderatePost] 2024-01-15T10:30:00.000Z - Processing label porn from test-labeler
[ModerationService:moderatePost] 2024-01-15T10:30:00.000Z - Label preference for porn: hide
[ModerationService:moderatePost] 2024-01-15T10:30:00.000Z - Filtering content with label porn
```

## Usage Examples

### Basic Moderation Check
```typescript
import { ModerationService } from '../services/ModerationService';

const decision = await ModerationService.moderatePost(post);
if (decision.filter) {
  // Content should be completely removed
  return null;
} else if (decision.blur) {
  // Content should be blurred with warning
  return <ContentHider decision={decision} />;
}
```

### Feed Filtering
```typescript
// Batch processing (used in AtprotoService fetch methods)
const batchResult = await ModerationService.batchModeratePosts(posts);
const filteredPosts = batchResult.filteredPosts;
const stats = batchResult.stats;
```

### Settings Management
```typescript
// Get current settings from Bluesky API
const settings = await ModerationService.getModerationSettings();

// Update settings (saves to Bluesky API)
settings.hideAdultContent = false;
await ModerationService.saveModerationSettings(settings);

// Enable adult-only mode
settings.adultContentOnlyMode = true;
await ModerationService.saveModerationSettings(settings);

// Sync all settings from API
await ModerationService.syncModerationSettings();
```

## Testing

### Manual Testing
1. Go to Settings → Test Moderation (Debug)
2. Review statistics and test results
3. Run additional tests as needed

### Automated Testing
```typescript
// Run moderation tests
await ModerationService.testModeration();

// Get statistics
const stats = await ModerationService.getModerationStats();
console.log('Moderation stats:', stats);
```

## Configuration

### Default Settings
The system uses conservative default settings that prioritize content safety:
- Adult content: Hidden
- Violence: Warned
- Spam: Hidden
- Sensitive content: Hidden
- Blocked users: Hidden
- Muted users: Hidden

### Adult Content Only Mode
A special filtering mode that shows only adult content and filters out everything else:
- **Purpose**: For users who want to see only adult/NSFW content
- **Behavior**: Filters out posts that don't have adult labels or content warnings
- **Labels**: Recognizes `porn`, `sexual`, `nudity` labels as adult content
- **Warnings**: Recognizes content warnings containing `adult`, `nsfw`, `nudity`, `sexual`
- **Usage**: Enable in Moderation Settings → General Settings → Adult Content Only Mode

### Customization
Users can customize settings through:
1. Bluesky's moderation settings (linked from app)
2. Local settings (for advanced users)
3. Debug interface (for testing)

## Performance Considerations

### Caching
- Blocked/muted users are cached locally
- Settings are cached in AsyncStorage
- Moderation decisions are not cached (recalculated each time)

### Batch Processing
- **Batch moderation** processes multiple posts efficiently
- Settings and user lists loaded once per batch
- Parallel processing within batches (10 posts per batch)
- Significant performance improvement over individual moderation

### Optimization
- **Moderation happens at fetch level** - violating content never reaches UI components
- **Batch processing** - all posts in a feed page are moderated together efficiently
- **Single settings load** - moderation settings loaded once per batch, not per post
- **Parallel processing** - posts processed in parallel within batches
- **Reduced compute overhead** - eliminated downstream processing of filtered content

## Future Enhancements

### Planned Features
1. **Real-time sync**: Sync with Bluesky's moderation preferences
2. **Advanced filtering**: More granular content filtering options
3. **Custom labelers**: Support for custom moderation services
4. **Analytics**: Moderation effectiveness tracking

### Integration Opportunities
1. **Ozone integration**: Connect to Bluesky's Ozone moderation service
2. **Community lists**: Support for community-maintained block/mute lists
3. **AI moderation**: Integration with AI-based content analysis

## Troubleshooting

### Common Issues

1. **Content not being filtered**
   - Check moderation settings from API
   - Verify label preferences are synced
   - Review debug logs for API errors

2. **Performance issues**
   - Ensure moderation is happening at feed level
   - Check for excessive debug logging
   - Verify API calls are not timing out

3. **Settings not saving**
   - Check network connectivity
   - Verify API authentication
   - Review API error logs
   - Ensure Bluesky service is available

### Debug Commands
```typescript
// Enable debug mode (development only)
ModerationService.DEBUG_MODE = true;

// Sync settings from Bluesky API
await ModerationService.syncModerationSettings();

// Run comprehensive tests
await ModerationService.testModeration();

// Get detailed statistics
const stats = await ModerationService.getModerationStats();

// Test API connectivity
const preferences = await AtprotoService.getModerationPreferences();
console.log('API preferences:', preferences);
```

## References

- [Bluesky Moderation Documentation](https://github.com/bluesky-social/ozone)
- [Atproto Moderation Spec](https://atproto.com/specs/moderation)
- [Ozone Labeler Service](https://github.com/bluesky-social/ozone) 