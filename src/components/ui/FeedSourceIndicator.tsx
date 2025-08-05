import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BRAND, INTERACTIVE } from '../../utils/formatting/Colors';
import { useChannel } from '../../services/cache/ChannelCache';
import { Colors } from './UI';

interface FeedSourceIndicatorProps {
  sourceFeed: string;
  feedOption?: string;
}

const FeedSourceIndicator: React.FC<FeedSourceIndicatorProps> = ({ sourceFeed, feedOption }) => {
  // Only show indicator for your mix feed
  if (feedOption !== 'yourMix') {
    return null;
  }

  // Don't show indicator for "thevids" feed
  if (sourceFeed === 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids') {
    return null;
  }

  // Get channel data for source feed to get actual title
  const { data: sourceChannel } = useChannel(sourceFeed);

  // Map feed URIs to readable names (fallback)
  const getFeedDisplayName = (uri: string): string => {
    switch (uri) {
      case 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids':
        return 'For Your Consideration';
      case 'at://following':
        return 'Following';
      case 'at://did:plc:tenurhgjptubkk5zf5qhi3og/app.bsky.feed.generator/discover-video':
        return 'Discover';
      default:
        // For custom feeds, try to extract a readable name
        if (uri.includes('/app.bsky.feed.generator/')) {
          const parts = uri.split('/app.bsky.feed.generator/');
          if (parts.length > 1) {
            const feedName = parts[1];
            // Convert kebab-case to Title Case
            return feedName
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          }
        }
        return 'Custom Feed';
    }
  };

  // Use hardcoded mapping for specific feeds, otherwise use actual channel title
  const displayName = getFeedDisplayName(sourceFeed) || sourceChannel?.displayName;

  // Use secondary color for "for your consideration", default color for others
  const textColor = displayName === 'for your consideration' ? Colors.TEXT.SECONDARY : 'white';

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: textColor }]}>{displayName}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
});

export default FeedSourceIndicator; 