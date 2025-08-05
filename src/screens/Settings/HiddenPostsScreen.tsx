import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Alert, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/ui/Icon';
import { BRAND, TEXT, UI, STATUS } from '../../utils/formatting/Colors';
import { ModerationService } from '../../services/ModerationService';
import AtprotoService from '../../services/api/AtprotoService';

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
  const navigation = useNavigation();
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
      const settings = await ModerationService.getModerationSettings();
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
      const settings = await ModerationService.getModerationSettings();
      const postToUnhide = hiddenPosts.find(p => p.id === postId);
      if (postToUnhide) {
        const updatedPosts = settings.hiddenPosts.filter((uri: string) => uri !== postToUnhide.uri);
        const updatedSettings = { ...settings, hiddenPosts: updatedPosts };
        await ModerationService.saveModerationSettings(updatedSettings);
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
              {item.author.avatar ? (
                <Image source={{ uri: item.author.avatar }} style={styles.avatar} />
              ) : (
                <Icon name="user" size={20} color={TEXT.SECONDARY} />
              )}
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
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="eye" size={16} color="#fff" />
              <Text style={styles.unhideButtonText}>Unhide</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
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
            <Icon name="arrow-left" size={24} color={TEXT.PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Hidden Posts</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND.SECONDARY} />
          <Text style={styles.loadingText}>Loading hidden posts...</Text>
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
          <Icon name="arrow-left" size={24} color={TEXT.PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hidden Posts</Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        data={hiddenPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="eye-closed" size={48} color={TEXT.SECONDARY} />
            <Text style={styles.emptyTitle}>No Hidden Posts</Text>
            <Text style={styles.emptyDescription}>
              You haven't hidden any posts yet. Hidden posts won't appear in your feed, but you can unhide them here.
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
    backgroundColor: UI.BACKGROUND.PRIMARY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
    backgroundColor: UI.BACKGROUND.PRIMARY,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: UI.BACKGROUND.SECONDARY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  headerTitle: {
    color: TEXT.PRIMARY,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerRight: {
    width: 40,
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
    backgroundColor: UI.BACKGROUND.SECONDARY,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: UI.BACKGROUND.TERTIARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  authorHandle: {
    color: TEXT.SECONDARY,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    marginTop: 1,
  },
  postText: {
    color: TEXT.PRIMARY,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 18,
  },
  unhideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 100,
    height: 40,
    borderWidth: 1,
    borderColor: BRAND.ACCENT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unhideButtonDisabled: {
    opacity: 0.7,
  },
  unhideButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Firma-Medium',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: UI.BACKGROUND.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: TEXT.SECONDARY,
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
    color: TEXT.PRIMARY,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    color: TEXT.SECONDARY,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default HiddenPostsScreen; 