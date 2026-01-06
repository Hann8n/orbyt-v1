import React, { useEffect, useState } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Icon, { Loading3FillIcon } from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import { Colors, Avatar } from '../../src/components/ui/UI';
import { ModerationService } from '../../src/services/moderation/ModerationService';
import { useUserStoreState } from '../../src/stores/userStore';
import { useModerationSettings } from '../../src/hooks/useModerationSettings';
import { logger } from '../../src/utils/logger';

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
  const router = useRouter();
  const { agent, currentUser } = useUserStoreState();
  const { settings: moderationSettings } = useModerationSettings(currentUser?.did ?? undefined);
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [unhidingPosts, setUnhidingPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (moderationSettings) {
      loadHiddenPosts();
    }
  }, [moderationSettings]);

  const loadHiddenPosts = async () => {
    try {
      setLoading(true);
      const hiddenPostUris = moderationSettings?.hiddenPosts || [];

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
      logger.error('Error loading hidden posts', error, {
        component: 'HiddenPostsScreen',
        action: 'loadHiddenPosts',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnhidePost = async (postId: string) => {
    try {
      setUnhidingPosts(prev => new Set(prev).add(postId));

      // Get current settings and remove the post
      if (!moderationSettings) return;

      const postToUnhide = hiddenPosts.find(p => p.id === postId);
      if (postToUnhide) {
        const updatedPosts = moderationSettings.hiddenPosts.filter(
          (uri: string) => uri !== postToUnhide.uri
        );
        const updatedSettings = { ...moderationSettings, hiddenPosts: updatedPosts };
        await ModerationService.saveModerationSettings(
          updatedSettings,
          agent ?? undefined,
          currentUser?.did ?? undefined
        );
        setHiddenPosts(prev => prev.filter(post => post.id !== postId));
      }
    } catch (error) {
      logger.error('Error unhiding post', error, {
        component: 'HiddenPostsScreen',
        action: 'handleUnhidePost',
        postId,
      });
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
              <Avatar uri={item.author.avatar} type="profile" size={32} ringColor="transparent" />
            </View>
            <View style={styles.authorDetails}>
              <Text style={styles.authorName}>{item.author.displayName || 'Unknown User'}</Text>
              <Text style={styles.authorHandle}>@{item.author.handle}</Text>
            </View>
          </View>
          <Text style={styles.postText} numberOfLines={2}>
            {item.text || 'Hidden post content...'}
          </Text>
        </View>
        <Pressable
          style={[styles.unhideButton, isUnhiding && styles.unhideButtonDisabled]}
          onPress={() => handleUnhidePost(item.id)}
          disabled={isUnhiding}
        >
          {isUnhiding ? (
            <Loading3FillIcon size={24} color={Colors.white} />
          ) : (
            <>
              <Icon name="eye" size={16} color={Colors.white} />
              <Text style={styles.unhideButtonText}>Unhide</Text>
            </>
          )}
        </Pressable>
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
          onClosePress={() => router.back()}
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
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      <FlatList
        data={hiddenPosts}
        keyExtractor={item => item.id}
        renderItem={renderPostItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="eye-closed" size={48} color={Colors.lightGray} />
            <Text style={styles.emptyTitle}>no hidden posts</Text>
            <Text style={styles.emptyDescription}>
              you haven't hidden any posts yet. hidden posts won't appear in your feed, but you can
              unhide them here.
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
