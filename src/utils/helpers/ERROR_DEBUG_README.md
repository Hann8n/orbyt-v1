# Error Debugging Utility

This utility provides a centralized way to force error responses for testing purposes.

## Usage

To force error responses, edit the `DEBUG_FLAGS` object in `src/utils/helpers/errorDebug.ts`:

```typescript
export const DEBUG_FLAGS = {
  FORCE_FEED_ERROR: true,    // Force feed loading errors
  FORCE_SEARCH_ERROR: true,  // Force search errors
  FORCE_PROFILE_ERROR: true, // Force profile loading errors
  FORCE_NETWORK_ERROR: true, // Force network errors
};
```

## Available Flags

- `FORCE_FEED_ERROR`: Forces feed loading errors in HomeScreen and FeedFetcher
- `FORCE_SEARCH_ERROR`: Forces search errors in ExploreScreen
- `FORCE_PROFILE_ERROR`: Forces profile loading errors
- `FORCE_NETWORK_ERROR`: Forces network connectivity errors

## Components Affected

1. **HomeScreen**: Uses `FORCE_FEED_ERROR` to force feed loading errors
2. **ExploreScreen**: Uses `FORCE_SEARCH_ERROR` to force search errors
3. **FeedFetcher**: Propagates `forceError` prop to force feed errors
4. **ListFeedView**: Shows error states when `forceError` is enabled

## Testing Error States

1. Set the desired debug flag to `true` in `errorDebug.ts`
2. Run the app
3. Navigate to the affected screen
4. The error state should be displayed with retry functionality

## Error Messages

Forced errors will display with the message: "Forced [type] error for testing purposes"

## Disabling

Set all flags to `false` to disable error forcing:

```typescript
export const DEBUG_FLAGS = {
  FORCE_FEED_ERROR: false,
  FORCE_SEARCH_ERROR: false,
  FORCE_PROFILE_ERROR: false,
  FORCE_NETWORK_ERROR: false,
};
``` 