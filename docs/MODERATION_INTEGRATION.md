# Moderation System Integration

## Overview

The moderation system has been updated to use the official Bluesky Moderation API with proper integration to the Zustand-based user store. This ensures that moderation decisions are consistent with Bluesky's standards and user preferences are properly respected.

## Key Changes

### 1. Official API Integration
- **Replaced custom moderation logic** with official Bluesky Moderation API functions
- **Uses `@atproto/api` moderation functions**: `moderatePost`, `moderateProfile`, `moderateNotification`
- **Proper type handling** for the official API's `ModerationCause` types
- **Maintains backward compatibility** with existing `ModerationDecision` interface

### 2. User Store Integration
- **Automatic sync** when users authenticate or switch accounts
- **Proper user context** from the OAuth session
- **Label definitions** fetched from Bluesky API
- **Performance optimization** with in-memory caching

### 3. Circular Dependency Resolution
- **Removed circular dependencies** between ModerationService and AtprotoService
- **Direct agent access** from userStore for API calls
- **Simplified feed moderation** in AtprotoService

## Usage

### Basic Moderation

```typescript
import { useModeration } from '../stores/userStore';

const MyComponent = () => {
  const { moderatePost, getModerationSettings } = useModeration();
  
  // Moderate a post
  const decision = await moderatePost(post, 'contentList');
  
  if (decision.filter) {
    // Don't show the post
    return null;
  }
  
  if (decision.blur) {
    // Show blurred content with warning
    return <BlurredContent post={post} reason={decision.reason} />;
  }
  
  // Show normal content
  return <NormalContent post={post} />;
};
```

### Getting Moderation Settings

```typescript
import { useModeration } from '../stores/userStore';

const SettingsComponent = () => {
  const { getModerationSettings, saveModerationSettings } = useModeration();
  
  const updateSettings = async () => {
    const settings = await getModerationSettings();
    
    // Update settings
    const updatedSettings = {
      ...settings,
      labels: {
        ...settings.labels,
        'porn': 'hide',
        'sexual': 'warn'
      }
    };
    
    await saveModerationSettings(updatedSettings);
  };
};
```

### Profile Moderation

```typescript
import { useModeration } from '../stores/userStore';

const ProfileComponent = () => {
  const { moderateProfile } = useModeration();
  
  const renderProfile = async (profile) => {
    const decision = await moderateProfile(profile, 'profileList');
    
    if (decision.filter) {
      return <HiddenProfile />;
    }
    
    if (decision.blur) {
      return <BlurredProfile profile={profile} reason={decision.reason} />;
    }
    
    return <NormalProfile profile={profile} />;
  };
};
```

## Available Moderation Functions

### From `useModeration()` Hook

- `moderatePost(post, context)` - Moderate a post
- `moderateProfile(profile, context)` - Moderate a profile
- `moderateNotification(notification)` - Moderate a notification
- `getModerationSettings()` - Get current moderation settings
- `saveModerationSettings(settings)` - Save moderation settings
- `syncModerationSettings()` - Sync settings with Bluesky API
- `clearModerationCache()` - Clear moderation cache

### Context Options

- `'contentList'` - Content in a feed or list
- `'contentView'` - Content being viewed directly
- `'avatar'` - User avatar
- `'banner'` - User banner
- `'profileList'` - Profile in a list
- `'profileView'` - Profile being viewed directly

## Moderation Decision Structure

```typescript
interface ModerationDecision {
  filter: boolean;        // Should content be hidden?
  blur: boolean;          // Should content be blurred?
  informs: string[];      // Informational labels
  reason?: string;        // Reason for moderation
  source?: string;        // Source of moderation decision
}
```

## Integration Points

### 1. Feed Components
Update feed components to use the new moderation system:

```typescript
// Before
const post = feedItem.post;
return <PostComponent post={post} />;

// After
const { moderatePost } = useModeration();
const decision = await moderatePost(feedItem, 'contentList');

if (decision.filter) return null;
if (decision.blur) {
  return <BlurredPost post={feedItem} decision={decision} />;
}
return <PostComponent post={feedItem} />;
```

### 2. Profile Components
Update profile components:

```typescript
// Before
return <ProfileComponent profile={profile} />;

// After
const { moderateProfile } = useModeration();
const decision = await moderateProfile(profile, 'profileList');

if (decision.filter) return <HiddenProfile />;
if (decision.blur) {
  return <BlurredProfile profile={profile} decision={decision} />;
}
return <ProfileComponent profile={profile} />;
```

### 3. Settings Screens
Settings screens should use the new moderation hooks:

```typescript
const { getModerationSettings, saveModerationSettings } = useModeration();

// Load settings
const settings = await getModerationSettings();

// Save settings
await saveModerationSettings(updatedSettings);
```

## Testing

Use the `ModerationTest` component to verify the system is working:

```typescript
import ModerationTest from '../components/features/moderation/ModerationTest';

// Add to your screen
<ModerationTest />
```

## Error Handling

The system includes robust error handling:

- **Fallback to default settings** if API calls fail
- **Graceful degradation** if moderation service is unavailable
- **Console logging** for debugging
- **User-friendly error messages**

## Performance Considerations

- **In-memory caching** for moderation decisions
- **Batch processing** for feed moderation
- **Background sync** of moderation settings
- **Optimistic updates** for UI responsiveness

## Migration Guide

### For Existing Components

1. **Import the hook**: `import { useModeration } from '../stores/userStore';`
2. **Replace direct ModerationService calls** with hook methods
3. **Update moderation logic** to use the new decision structure
4. **Test thoroughly** with the ModerationTest component

### For New Components

1. **Use the `useModeration` hook** for all moderation needs
2. **Handle all moderation states**: filter, blur, and normal
3. **Provide user feedback** for moderation decisions
4. **Cache moderation decisions** when appropriate

## Troubleshooting

### Common Issues

1. **"Cannot read property 'getModerationPreferences' of undefined"**
   - Ensure user is authenticated
   - Check that userStore has a valid agent

2. **"Property 'AtprotoService' doesn't exist"**
   - Circular dependency resolved, use direct agent calls
   - Import from userStore instead

3. **Moderation not working**
   - Check console for error messages
   - Verify user preferences are loaded
   - Test with ModerationTest component

### Debug Mode

Enable debug logging by checking console output:

```typescript
// Check moderation options
const opts = await getModerationOpts();
console.log('Moderation options:', opts);

// Check moderation settings
const settings = await getModerationSettings();
console.log('Moderation settings:', settings);
```

## Future Enhancements

- **Real-time moderation updates**
- **Advanced label definitions**
- **Custom moderation rules**
- **Performance optimizations**
- **Offline moderation support**
