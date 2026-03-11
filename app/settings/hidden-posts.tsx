import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '../../src/components/ui/Icon';
import ListHeader from '../../src/components/ui/ListHeader';
import { Colors } from '../../src/theme';
import { Avatar } from '../../src/components/ui/UI';
import { ModerationService } from '../../src/services/moderation/ModerationService';
import { useUserStoreState } from '../../src/stores/userStore';
import { useModerationSettings } from '../../src/hooks/useModerationSettings';
import { useAvatarProfileRing } from '../../src/services/colors';
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

/** Avatar with profile ring colors; must be a component to use useAvatarProfileRing */
const HiddenPostAvatar: React.FC<{
  author: HiddenPost['author'];
}> = ({ author }) => {
  const ringProps = useAvatarProfileRing(author.did ?? null);
  return (
    <Avatar
      uri={author.avatar}
      type="profile"
      size={32}
      showRing={ringProps.showRing}
      ringColor={ringProps.ringColor}
      profileColors={ringProps.profileColors}
    />
  );
};

const HiddenPostsScreen: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { agent, currentUser } = useUserStoreState();
  const { moderationPrefs } = useModerationSettings(currentUser?.did ?? undefined);
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [unhidingPosts, setUnhidingPosts] = useState<Set<string>>(new Set());

  const loadHiddenPosts = useCallback(async () => {
    try {
      setLoading(true);
      const hiddenPostUris = moderationPrefs?.hiddenPosts ?? [];

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
        text: t('settings.hiddenPostContent'),
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
  }, [moderationPrefs, t]);

  useEffect(() => {
    if (moderationPrefs) {
      loadHiddenPosts();
    }
  }, [moderationPrefs, loadHiddenPosts]);

  const handleUnhidePost = async (postId: string) => {
    try {
      setUnhidingPosts(prev => new Set(prev).add(postId));
      if (!moderationPrefs) return;

      const postToUnhide = hiddenPosts.find(p => p.id === postId);
      if (postToUnhide) {
        const updatedPosts = moderationPrefs.hiddenPosts.filter(uri => uri !== postToUnhide.uri);
        const updated: typeof moderationPrefs = { ...moderationPrefs, hiddenPosts: updatedPosts };
        await ModerationService.saveModerationPrefs(
          updated,
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
              <HiddenPostAvatar author={item.author} />
            </View>
            <View style={styles.authorDetails}>
              <Text style={styles.authorName}>
                {item.author.displayName || t('profile.unknownUser')}
              </Text>
              <Text style={styles.authorHandle}>@{item.author.handle}</Text>
            </View>
          </View>
          <Text style={styles.postText} numberOfLines={2}>
            {item.text || t('settings.hiddenPostContent')}
          </Text>
        </View>
        <Pressable
          style={[styles.unhideButton, isUnhiding && styles.unhideButtonDisabled]}
          onPress={() => handleUnhidePost(item.id)}
          disabled={isUnhiding}
        >
          {isUnhiding ? (
            <ActivityIndicator size="small" color={Colors.neutral[50]} />
          ) : (
            <>
              <Icon name="eye" size={16} color={Colors.neutral[50]} />
              <Text style={styles.unhideButtonText}>{t('settings.unhide')}</Text>
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
          title={t('settings.hiddenPosts')}
          showCloseButton
          onClosePress={() => router.dismiss()}
          applySafeAreaTop={false}
          backgroundColor={Colors.transparent}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
          <Text style={styles.loadingText}>{t('settings.loadingHiddenPosts')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <ListHeader
        mode="sheet"
        title={t('settings.hiddenPosts')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.transparent}
      />

      <FlatList
        data={hiddenPosts}
        keyExtractor={item => item.id}
        renderItem={renderPostItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="eye-closed" size={48} color={Colors.neutral[200]} />
            <Text style={styles.emptyTitle}>{t('settings.noHiddenPosts')}</Text>
            <Text style={styles.emptyDescription}>{t('settings.hiddenPostsEmptyDescription')}</Text>
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
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.neutral[500],
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
    color: Colors.neutral[50],
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
  },
  authorHandle: {
    color: Colors.neutral[200],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    marginTop: 1,
  },
  postText: {
    color: Colors.neutral[50],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    lineHeight: 18,
  },
  unhideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[900],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.SMALL,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.neutral[200],
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
    color: Colors.neutral[50],
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Figtree-Medium',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.neutral[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
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
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default HiddenPostsScreen;
