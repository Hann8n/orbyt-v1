import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon, { BackArrowIcon } from '../../components/ui/Icon';
import { Colors } from '../../components/ui/UI';
import UI from '../../components/ui/UI';
import WatchHistory from '../../services/WatchHistory';
import AtprotoService from '../../services/api/AtprotoService';
import GridFeedView from '../../components/features/feed/GridFeedView';
import { extractVideoUrl } from '../../utils/helpers/video';
import { RootStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface WatchHistoryItem {
  uri: string;
  post?: {
    uri: string;
    cid: string;
    author: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    text?: string;
    createdAt: string;
    embed?: any;
  };
}

// Convert WatchHistoryItem to FeedItem format for GridFeedView
const convertToFeedItem = (item: WatchHistoryItem): any => {
  if (!item.post) {
    return null;
  }

  return {
    post: {
      uri: item.post.uri,
      cid: item.post.cid,
      author: item.post.author,
      text: item.post.text,
      createdAt: item.post.createdAt,
      embed: item.post.embed,
    },
    reason: undefined, // No repost reason for watch history
  };
};

type WatchHistoryScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'WatchHistory'>;

const WatchHistoryScreen: React.FC = () => {
  const navigation = useNavigation<WatchHistoryScreenNavigationProp>();
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadWatchHistory();
  }, []);

  const loadWatchHistory = async () => {
    try {
      setLoading(true);
      const uris = await WatchHistory.getWatchHistory();
      
      // Convert URIs to WatchHistoryItem objects with post data
      const historyItems: WatchHistoryItem[] = await Promise.all(
        uris.map(async (uri) => {
          try {
            // Try to fetch post data from Bluesky API
            const post = await AtprotoService.getPost(uri);
            return {
              uri,
              post: post ? {
                uri: post.uri,
                cid: post.cid,
                author: {
                  did: post.author.did,
                  handle: post.author.handle,
                  displayName: post.author.displayName,
                  avatar: post.author.avatar,
                },
                text: post.text,
                createdAt: post.createdAt,
                embed: post.embed,
              } : undefined,
            };
          } catch (error) {
            // If post fetch fails, create a basic item
            return {
              uri,
              post: undefined,
            };
          }
        })
      );
      
      setWatchHistory(historyItems);
    } catch (error) {
      console.error('Error loading watch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Watch History',
      'Are you sure you want to clear your watch history? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Clear History',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingHistory(true);
              await WatchHistory.clearWatchHistory();
              setWatchHistory([]);
            } catch (error) {
              console.error('Error clearing watch history:', error);
              Alert.alert('Error', 'Failed to clear watch history. Please try again.');
            } finally {
              setClearingHistory(false);
            }
          }
        }
      ]
    );
  };

  // Convert watch history items to feed items and filter for videos only
  const feedItems = watchHistory
    .map(convertToFeedItem)
    .filter(item => item && extractVideoUrl(item.post.embed));

  // Handle grid item press
  const handleGridItemPress = (index: number) => {
    // Navigate to ProfileFeedModal with the watch history feed
    navigation.navigate('FeedModal', {
      feed: feedItems,
      initialIndex: index,
      feedOption: 'watchHistory',
      backgroundColor: Colors.darkGray,
      secondaryColor: Colors.white,
    });
  };

    if (loading) {
    return (
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackArrowIcon size={28} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>watch history</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.loadingText}>Loading watch history...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <BackArrowIcon size={28} color={Colors.white} />
        </TouchableOpacity>
                  <Text style={styles.headerTitle}>watch history</Text>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearHistory}
          disabled={clearingHistory || feedItems.length === 0}
          activeOpacity={0.7}
        >
          {clearingHistory ? (
            <ActivityIndicator size="small" color={UI.Colors.STATUS.ERROR} />
          ) : (
            <Icon name="trash" size={20} color={UI.Colors.STATUS.ERROR} />
          )}
        </TouchableOpacity>
      </View>

      {/* Stats header */}
      {feedItems.length > 0 && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            {feedItems.length} video{feedItems.length !== 1 ? 's' : ''} watched
          </Text>
        </View>
      )}

      {/* Grid Feed View */}
      <GridFeedView
        feed={feedItems}
        feedOption="watchHistory"
        backgroundColor={Colors.black}
        secondaryColor={Colors.white}
        onGridItemPress={handleGridItemPress}
        onLoadMore={() => {}} // No pagination needed for watch history
        isFetchingNextPage={false}
        hasNextPage={false}
        isError={false}
        isProfileFeed={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray,
    backgroundColor: Colors.darkGray,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerRight: {
    width: 40,
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  statsContainer: {
    backgroundColor: Colors.darkGray,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  statsText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
});

export default WatchHistoryScreen; 