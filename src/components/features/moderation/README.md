# Moderation System

This document describes the moderation system implementation for the Orbyt app, which provides content filtering and moderation capabilities compatible with Bluesky's moderation architecture.

## Overview

The moderation system is designed to filter content efficiently at the data layer:
1. **Data Layer**: Content is filtered during feed fetching in AtprotoService
2. **UI Layer**: Content warnings and blurring are applied (for posts that pass filtering)

## Architecture

### Core Components

#### ModerationService
The main service that handles all moderation logic:

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

- `moderatePost(post, context)`: Individual post moderation
- `batchModeratePosts(posts, context)`: **Batch moderation for multiple posts** (used in fetch functions)
- `getModerationStats()`: Get moderation statistics
- `testModeration()`: Run moderation tests

### Integration Points

#### AtprotoService.tsx
Content filtering happens at the API fetch level:

```typescript
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

## Moderation Sources

### 1. Labels
Content can be labeled by various sources:
- **Self-labels**: Applied by content authors
- **Labeler services**: Third-party moderation services
- **Platform labels**: Applied by Bluesky's moderation team

### 2. User Actions
- **Blocked users**: Users the current user has blocked
- **Muted users**: Users the current user has muted
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
// Get current settings
const settings = await ModerationService.getModerationSettings();

// Update settings
settings.hideAdultContent = false;
await ModerationService.saveModerationSettings(settings);
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
   - Check moderation settings
   - Verify label preferences
   - Review debug logs

2. **Performance issues**
   - Ensure moderation is happening at feed level
   - Check for excessive debug logging
   - Verify async operations

3. **Settings not saving**
   - Check AsyncStorage permissions
   - Verify data format
   - Review error logs

### Debug Commands
```typescript
// Enable debug mode (development only)
ModerationService.DEBUG_MODE = true;

// Run comprehensive tests
await ModerationService.testModeration();

// Get detailed statistics
const stats = await ModerationService.getModerationStats();
```

## References

- [Bluesky Moderation Documentation](https://github.com/bluesky-social/ozone)
- [Atproto Moderation Spec](https://atproto.com/specs/moderation)
- [Ozone Labeler Service](https://github.com/bluesky-social/ozone) 