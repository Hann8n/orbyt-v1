import React, { useEffect, useState } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, FlatList, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { BackArrowIcon, Loading3FillIcon } from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import { Colors, Avatar } from '../../src/components/ui/UI';
import { ModerationService } from '../../src/services/ModerationService';
import AtprotoService from '../../src/services/api/AtprotoService';
import { useUserStoreState } from '../../src/stores/userStore';

interface HiddenPost {
  id: string;
  uri: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text?: string;
  createdAt: string;
}

const HiddenPostsScreen: React.FC = () => {
  const navigation = useRouter();
  const { agent } = useUserStoreState();
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [unhidingPosts, setUnhidingPosts] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadHiddenPosts();
  }, []);

  const loadHiddenPosts = async () => {
    try {
      setLoading(true);
      const settings = await ModerationService.getModerationSettings(agent);
      const hiddenPostUris = settings.hiddenPosts || [];
      
      // Convert URIs to HiddenPost objects with mock data
      const postObjects = hiddenPostUris.map((uri, index) => ({
        id: `post-${index}`,
        uri,
        author: {
          did: `did:example:${index}`,
          handle: `user${index}`,
          displayName: `User ${index}`,
          avatar: undefined,
        },
        text: 'Hidden post content...',
        createdAt: new Date().toISOString(),
      }));
      
      setHiddenPosts(postObjects);
    } catch (error) {
      console.error('Error loading hidden posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnhidePost = async (postId: string) => {
    try {
      setUnhidingPosts(prev => new Set(prev).add(postId));
      
      // Get current settings and remove the post
      const settings = await ModerationService.getModerationSettings(agent);
      const postToUnhide = hiddenPosts.find(p => p.id === postId);
      if (postToUnhide) {
        const updatedPosts = settings.hiddenPosts.filter((uri: string) => uri !== postToUnhide.uri);
        const updatedSettings = { ...settings, hiddenPosts: updatedPosts };
        await ModerationService.saveModerationSettings(updatedSettings, agent);
        setHiddenPosts(prev => prev.filter(post => post.id !== postId));
      }
    } catch (error) {
      console.error('Error unhiding post:', error);
    } finally {
      setUnhidingPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  const renderPostItem = ({ item }: { item: HiddenPost }) => {
    const isUnhiding = unhidingPosts.has(item.id);

    return (
      <View style={styles.postItem}>
        <View style={styles.postInfo}>
          <View style={styles.authorInfo}>
            <View style={styles.avatarContainer}>
              <Avatar
                uri={item.author.avatar}
                type="profile"
                size={32}
                ringColor="transparent"
              />
            </View>
            <View style={styles.authorDetails}>
              <Text style={styles.authorName}>
                {item.author.displayName || 'Unknown User'}
              </Text>
              <Text style={styles.authorHandle}>@{item.author.handle}</Text>
            </View>
          </View>
          <Text style={styles.postText} numberOfLines={2}>
            {item.text || 'Hidden post content...'}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.unhideButton,
            isUnhiding && styles.unhideButtonDisabled
          ]}
          onPress={() => handleUnhidePost(item.id)}
          disabled={isUnhiding}
          activeOpacity={0.7}
        >
          {isUnhiding ? (
            <Loading3FillIcon size={24} color={Colors.white} />
          ) : (
            <>
              <Icon name="eye" size={16} color={Colors.white} />
              <Text style={styles.unhideButtonText}>Unhide</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.safeArea}>
        <ListHeader
          mode="sheet"
          title="hidden posts"
          showCloseButton
          onClosePress={() => navigation.back()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
        />
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.white} />
          <Text style={styles.loadingText}>Loading hidden posts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ListHeader
        mode="sheet"
        title="hidden posts"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      <FlatList
        data={hiddenPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="eye-closed" size={48} color={Colors.lightGray} />
            <Text style={styles.emptyTitle}>no hidden posts</Text>
            <Text style={styles.emptyDescription}>
              you haven't hidden any posts yet. hidden posts won't appear in your feed, but you can unhide them here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  postItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  postInfo: {
    flex: 1,
    marginRight: 12,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarContainer: {
    marginRight: 8,
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  authorHandle: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 1,
  },
  postText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 18,
  },
  unhideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.SMALL,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unhideButtonDisabled: {
    opacity: 0.7,
  },
  unhideButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Firma-Medium',
    marginLeft: 6,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 120,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default HiddenPostsScreen; 