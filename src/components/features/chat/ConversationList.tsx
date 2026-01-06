import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { Colors } from '../../ui/UI';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { Avatar } from '../../ui/UI';
import { Conversation } from '../../../services/ChatService';
import ChatService from '../../../services/ChatService';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { formatHandle } from '../../../utils/formatting/handles';
import Icon, { Loading3FillIcon } from '../../ui/Icon';
import { useChatStore } from '../../../stores/chatStore';
import { useCurrentUser } from '../../../stores/userStore';
import EmptyFeed from '../feed/EmptyFeed';
import type { PostView } from '../../../services/api/types';
import { isVideoEmbed, isVideoEmbedInMedia } from '../../../services/api/types';
import { queryKeys } from '../../../utils/query/queryKeys';

interface ConversationListProps {
  onConversationPress?: (conversation: Conversation) => void;
  bottomNavBarHeight?: number;
}

// Divider component for conversations
const ConversationDivider = () => <View style={styles.divider} />;

// Helper function to check if a post is a video post
const isVideoPost = (post: PostView): boolean => {
  const embed = post?.embed;
  if (!embed) return false;
  return isVideoEmbed(embed) || isVideoEmbedInMedia(embed);
};

export default function ConversationList({
  onConversationPress,
  bottomNavBarHeight = 0,
}: ConversationListProps) {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { updateFromConversations } = useChatStore();

  // Helper to get message text, checking cached post data for video
  const getMessageText = useCallback(
    (item: Conversation): string => {
      if (item.lastMessageText) return item.lastMessageText;

      const lastMessage = item.lastMessage as any;
      const hasEmbed = !!(lastMessage && 'embed' in lastMessage && lastMessage.embed);

      if (hasEmbed && lastMessage.embed?.record?.uri) {
        // Check if post is already cached in React Query
        const cachedPost = queryClient.getQueryData<PostView>([
          'embedded-post',
          lastMessage.embed.record.uri,
        ]);
        if (cachedPost && 'uri' in cachedPost && 'cid' in cachedPost && isVideoPost(cachedPost)) {
          return 'sent a video';
        }
        // If not cached, default to "sent a post" (will update when post loads)
        return 'sent a post';
      }

      return 'No messages yet';
    },
    [queryClient]
  );

  // Use existing hook from user store
  const { currentUser } = useCurrentUser();
  const currentUserDid = currentUser?.did || '';

  const {
    data: conversationsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: async () => {
      const result = await ChatService.getConversations();
      // Update chat store with conversations (includes latest messages)
      if (result.conversations) {
        updateFromConversations(result.conversations);
      }
      return result;
    },
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT, // 10 seconds - for frequently changing data
  });

  const conversations = conversationsData?.conversations || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    // Also invalidate the conversations-count cache to update bottom bar indicator
    queryClient.invalidateQueries({
      queryKey: queryKeys.chat.conversations.count(),
      refetchType: 'active',
    });
    setRefreshing(false);
  };

  const handleConversationPress = useCallback(
    (conversation: Conversation) => {
      if (onConversationPress) {
        onConversationPress(conversation);
      } else {
        router.push(`/chat/${conversation.id}`);
      }
    },
    [onConversationPress]
  );

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => {
      const otherMember =
        item.members.find(member => member.did !== currentUserDid) || item.members[0];
      const messageText = getMessageText(item);

      return (
        <Pressable style={styles.conversationItem} onPress={() => handleConversationPress(item)}>
          <View style={styles.avatarContainer}>
            <Avatar
              uri={otherMember.avatar}
              type="profile"
              size={55}
              showRing={true}
              style={styles.profileImage}
            />
            {item.unreadCount > 0 && <View style={styles.unreadIndicator} />}
          </View>
          <View style={styles.conversationInfo}>
            <View style={styles.conversationHeader}>
              <Text
                style={[
                  styles.conversationName,
                  item.unreadCount > 0 && styles.unreadConversationName,
                ]}
                numberOfLines={1}
              >
                {formatHandle(otherMember?.handle)}
              </Text>
              {item.lastMessageCreatedAt && (
                <Text style={styles.conversationTime}>
                  {formatRelativeDate(item.lastMessageCreatedAt)}
                </Text>
              )}
            </View>

            <View style={styles.conversationFooter}>
              <Text
                style={[styles.lastMessage, item.unreadCount > 0 && styles.unreadMessage]}
                numberOfLines={1}
              >
                {messageText}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [currentUserDid, handleConversationPress, getMessageText]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyContent}>
        <Icon name="inbox" size={48} color={Colors.gray} />
        <Text style={styles.emptyText}>no conversations yet</Text>
      </View>
    </View>
  );

  // All hooks must be called before any conditional returns
  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  const contentContainerStyle = useMemo(() => {
    return conversations.length === 0
      ? styles.emptyContainer
      : {
          paddingHorizontal: 10,
          paddingBottom: bottomNavBarHeight + 5,
        };
  }, [conversations.length, bottomNavBarHeight]);

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <EmptyFeed
          type="no-connection"
          message="can't connect to chats"
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ConversationDivider}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.white}
            titleColor={Colors.white}
          />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.darkGray,
    marginLeft: 65, // Align with content (55px avatar + 12px margin - adjusted)
    marginRight: -10, // Extend to right edge, ignoring 10px padding
  },
  avatarContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 55,
    height: 55,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 12,
  },
  unreadIndicator: {
    position: 'absolute',
    top: 1,
    right: 8,
    backgroundColor: Colors.green,
    borderRadius: BORDER_RADIUS.FULL,
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: Colors.black,
  },
  conversationInfo: {
    flex: 1,
    justifyContent: 'flex-start',
    marginRight: 10,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  conversationName: {
    color: Colors.white,
    fontSize: 18,
    marginBottom: 2,
    fontFamily: 'Firma-Black',
    fontWeight: '800',
    marginRight: 4,
  },
  unreadConversationName: {
    color: Colors.white,
  },
  conversationTime: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginLeft: 4,
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  lastMessage: {
    color: Colors.mutedGray,
    fontSize: 16.5,
    fontFamily: 'Firma-Medium',
  },
  unreadMessage: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 100,
  },
});
