# Feed Mixing Strategies

The Orbyt app now supports multiple strategies for mixing videos in feeds to provide variety beyond just chronological ordering. Users can choose their preferred mixing strategy in the Settings screen.

## Available Strategies

### 1. Chronological (Default)
- **Behavior**: Shows videos in order of when they were posted (newest first)
- **Use Case**: Users who want to see the most recent content first
- **Description**: Traditional timeline-based feed ordering

### 2. Engagement
- **Behavior**: Prioritizes videos with higher engagement (likes + reposts + replies)
- **Use Case**: Users who want to see popular content first
- **Description**: Shows the most engaging content at the top of the feed

### 3. Diversity
- **Behavior**: Maximizes variety by alternating between different feeds and authors
- **Use Case**: Users who want to see content from many different sources
- **Description**: Ensures a mix of content from different channels and creators

### 4. Weighted (Smart Mix)
- **Behavior**: Uses a sophisticated algorithm that considers multiple factors
- **Use Case**: Users who want a balanced, intelligent feed mix
- **Description**: The most advanced strategy that balances recency, engagement, and diversity

## Weighted Strategy Details

The weighted strategy uses a sophisticated algorithm that considers:

1. **Recency**: Newer posts get higher weight (decays over 1 week)
2. **Engagement**: Posts with more likes/reposts/replies get higher weight
3. **Source Diversity**: Posts from different feeds get bonus weight
4. **Author Diversity**: Posts from different authors get bonus weight
5. **Random Variation**: Adds ±20% random variation for unpredictability

## How to Change Your Strategy

1. Open the Orbyt app
2. Go to Settings
3. Tap "Feed Mixing Strategy" under the Content section
4. Choose your preferred strategy from the options
5. The change takes effect immediately for new feed loads

## Technical Implementation

- Strategies are stored locally using AsyncStorage
- The weighted strategy is the default for new users
- Strategies only affect the "Your Mix" feed (combined feed from subscribed channels)
- Other feeds (Following, Discover, etc.) maintain their original ordering
- The mixing happens at the API level in the `getMixedFeed` method

## Benefits

- **Variety**: Users see different types of content instead of just chronological posts
- **Engagement**: Popular content gets more visibility
- **Discovery**: Users discover content from different sources and creators
- **Personalization**: Users can choose how they want their feed organized
- **Balance**: The weighted strategy provides a good balance of all factors

## Performance Considerations

- All strategies maintain the same performance characteristics
- The weighted strategy has minimal computational overhead
- Strategies are applied during feed fetching, not during rendering
- Caching and pagination work the same for all strategies 