# Feed Components

This directory contains the core feed components for the orbyt app.

## Components

### FeedFetcher
The main feed component that handles fetching and displaying video feeds. It supports various feed types including:
- `yourMix` - Personalized feed
- `following` - Posts from followed users
- `profile` - User profile posts
- `author` - Author posts
- `likes` - Liked posts
- `reposts` - Reposted posts
- Custom channel URIs

### MembersListView
A new component for displaying channel members/followers. This component:

- **Purpose**: Displays users following a channel
- **Data Source**: Currently uses the channel creator's following list (can be updated to use actual channel member API when available)
- **Features**:
  - Infinite scrolling pagination
  - Follow/unfollow functionality
  - Profile navigation
  - Pull-to-refresh
  - Loading states
  - Error handling
  - Empty states

#### Usage Example
```tsx
import MembersListView from '../components/features/feed/MembersListView';

<MembersListView
  channelUri="at://did:plc:example/app.bsky.feed.generator/example"
  backgroundColor="#000000"
  textColor="#FFFFFF"
  headerComponent={<YourHeaderComponent />}
  onMemberPress={(member) => {
    // Custom member press handler
  }}
  onFollowPress={(member) => {
    // Custom follow/unfollow handler
  }}
  isVisible={true}
  onRefresh={() => {
    // Custom refresh handler
  }}
  isRefreshing={false}
/>
```

#### Props
- `channelUri` (string, required): The channel URI to fetch members for
- `backgroundColor` (string, optional): Background color for the list
- `textColor` (string, optional): Text color for the list
- `headerComponent` (ReactNode, optional): Header component to display above the list
- `onMemberPress` (function, optional): Callback when a member is pressed
- `onFollowPress` (function, optional): Callback when follow/unfollow is pressed
- `isVisible` (boolean, optional): Whether the component is visible
- `onRefresh` (function, optional): Callback for refresh events
- `isRefreshing` (boolean, optional): Whether the list is currently refreshing

### ListFeedView
Handles the display of feed items in a list format with video optimization.

### GridFeedView
Handles the display of feed items in a grid format.

### EmptyFeed
Displays empty states for feeds with various types and suggested content.

### MemoizedVideoItem
Optimized video item component for feed display.

### SwipeableFeedContainer
Container component that provides swipe gestures for feed navigation.

## Integration with ChannelScreen

The MembersListView is integrated into the ChannelScreen through the tab system:

1. **Posts Tab**: Shows the regular FeedFetcher with channel posts
2. **Members Tab**: Shows the MembersListView with channel members

The tab switching is handled in `src/screens/ChannelScreen.tsx`:

```tsx
{activeTab === 'posts' ? (
  <FeedFetcher
    // ... feed props
  />
) : (
  <MembersListView
    channelUri={uri || ''}
    backgroundColor={channelColors.backgroundColor}
    textColor={channelColors.textColor}
    headerComponent={headerComponent}
    isVisible={true}
    onRefresh={onRefresh}
    isRefreshing={refreshing}
  />
)}
```

## Future Enhancements

- Replace channel creator's following list with actual channel member API when available
- Add member count display
- Add member search functionality
- Add member filtering options
- Add member role indicators (admin, moderator, etc.)