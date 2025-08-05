# Your Mix Feed Feature

## Overview

The Your Mix feed feature combines posts from all user subscribed channels into a single, unified feed. This provides users with a comprehensive view of content from all their subscribed sources in one place. The Your Mix feed supports infinite scrolling, allowing users to continuously pull in content from subscribed feeds indefinitely.

## How It Works

### 1. Feed Collection
- The system fetches posts from all subscribed channels in parallel
- Excludes the default "Following" feed to avoid duplication
- Each channel's posts are retrieved using the existing `AtprotoService.getFeed()` method
- Individual feed cursors are tracked to enable infinite scrolling

### 2. Post Processing
- All posts are merged into a single array
- Duplicate posts (based on post URI) are automatically removed
- Posts are sorted by `indexedAt` timestamp (newest first)
- The final feed is limited to the specified number of posts (default: 100)
- Watched videos are filtered out to avoid showing content the user has already seen

### 3. Pagination System
- Uses a composite cursor system that tracks the state of each individual feed
- When paginating, the system fetches more content from feeds that still have content available
- Continues pulling content indefinitely as long as any subscribed feed has more posts
- Gracefully handles feeds that have reached their end while continuing to fetch from others

### 4. Integration
- The Your Mix feed appears as the default "Your Mix" option in the feed selector
- It's automatically added as a default channel in the subscription manager
- Users can access it by swiping through their feed options
- Supports infinite scrolling just like other feeds

## Technical Implementation

### Enhanced API Method
```typescript
// In AtprotoService.tsx
static async getMixedFeed(
  feedUris: string[],
  cursor: string | null = null, // Composite cursor containing all feed states
  limit: number = 100,
  filterVideosOnly: boolean = true
): Promise<FeedResponse>
```

### Cursor Management
- The cursor is a JSON string containing the cursor state for each individual feed
- Example: `{"feed1": "cursor1", "feed2": "cursor2", "feed3": null}`
- When `null` is returned, all feeds have been exhausted

### Updated Hook
```typescript
// In useFeedQuery.tsx
// Your Mix now uses mixed feed logic
export type FeedOption = 'yourMix' | 'profile' | 'following' | 'author' | 'likes' | 'reposts' | string;
```

### Default Channel
```typescript
// In ChannelSubscriptionManager.ts
{ uri: 'yourMix', displayName: 'Your Mix', isDefault: true, order: 1, subscribedAt: Date.now() }
```

## Features

- **Parallel Fetching**: All feeds are fetched simultaneously for optimal performance
- **Duplicate Removal**: Automatic deduplication based on post URIs
- **Chronological Sorting**: Posts are sorted by timestamp (newest first)
- **Error Handling**: Individual feed failures don't break the entire mixed feed
- **Fallback**: If no custom channels are subscribed, falls back to single feed
- **Infinite Scrolling**: Continues to pull content from subscribed feeds indefinitely
- **Smart Pagination**: Only fetches from feeds that still have content available
- **Composite Cursor**: Efficiently tracks the state of all individual feeds
- **Watch History Filtering**: Automatically filters out videos the user has already watched

## Usage

Users can access the Your Mix feed by:
1. Swiping horizontally through their feed options
2. The "Your Mix" option will appear in the feed selector
3. Selecting it will show posts from all subscribed channels combined
4. Scrolling to the bottom will automatically load more content from all subscribed feeds

## Performance Considerations

- Parallel API calls reduce total fetch time
- Duplicate removal prevents redundant content
- Limited result set prevents memory issues
- Error handling ensures graceful degradation
- Smart cursor management prevents unnecessary API calls
- Only fetches from feeds with available content

## Infinite Scrolling Behavior

- When the user scrolls near the end of the feed, more content is automatically loaded
- The system checks which feeds still have content available
- Only feeds with remaining content are fetched from
- The process continues indefinitely as long as any subscribed feed has more posts
- If all feeds are exhausted, scrolling stops naturally

## Future Enhancements

- Weighted mixing based on user preferences
- Custom mixing algorithms
- Feed-specific filtering options
- Caching for improved performance
- **NEW**: Feed-specific refresh rates
- **NEW**: User-defined feed priorities 