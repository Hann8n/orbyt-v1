import React, { useCallback, useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { LegendList, LegendListRef } from '@legendapp/list';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';
import { ChatBskyConvoDefs } from '@atproto/api';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';

import { Colors } from '../../../theme';
import { Avatar } from '../../../components/ui/UI';
import { Loading3FillIcon } from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/device/screen';
import { formatHandle } from '../../../utils/formatting/handles';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useUserStore } from '../../../stores/userStore';

type ConvoView = ChatBskyConvoDefs.ConvoView;

const EmptyChats = () => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>no conversations yet</Text>
  </View>
);

const ChatsLoading = () => (
  <View style={styles.loadingContainer}>
    <Loading3FillIcon size={48} color={Colors.neutral[50]} />
  </View>
);

const ChatDivider = () => <View style={styles.divider} />;

/** Preview from listConvos lastMessage (API may omit $type; accept object with text). */
function getLastMessagePreview(lastMessage: ConvoView['lastMessage']): string {
  if (!lastMessage || typeof lastMessage !== 'object') return '';
  if (ChatBskyConvoDefs.isMessageView(lastMessage)) return lastMessage.text ?? '';
  if ('text' in lastMessage && typeof (lastMessage as { text?: string }).text === 'string') {
    return (lastMessage as { text: string }).text;
  }
  return 'Message deleted';
}

function getOtherMember(
  convo: ConvoView,
  currentDid: string | undefined
): ConvoView['members'][number] | undefined {
  const others = convo.members?.filter(m => m.did !== currentDid) ?? [];
  return others[0];
}

type ConversationItemProps = {
  item: ConvoView;
  navigation: ReturnType<typeof useRouter>;
};

const ConversationItem = React.memo<ConversationItemProps>(({ item, navigation }) => {
  const currentUser = useUserStore(s => s.currentUser);
  const other = useMemo(() => getOtherMember(item, currentUser?.did), [item, currentUser?.did]);
  const handle = other?.handle ?? '';
  const nameLabel = formatHandle(handle) || 'Unknown';
  const preview = getLastMessagePreview(item.lastMessage);
  const lastMsg = item.lastMessage;
  const sentAt =
    lastMsg &&
    typeof lastMsg === 'object' &&
    'sentAt' in lastMsg &&
    typeof (lastMsg as { sentAt?: string }).sentAt === 'string'
      ? (lastMsg as { sentAt: string }).sentAt
      : undefined;
  const unread = (item.unreadCount ?? 0) > 0;

  const handlePress = useCallback(() => {
    if (item.id && other?.did) {
      navigation.push({
        pathname: '/chat/[id]',
        params: { id: item.id, did: other.did },
      });
    }
  }, [navigation, item.id, other]);

  const handleAvatarPress = useCallback(() => {
    if (other?.did) {
      navigation.push({
        pathname: '/profile/[did]',
        params: { did: other.did },
      });
    }
  }, [navigation, other]);

  const handleNamePress = useCallback(() => {
    if (other?.did) {
      navigation.push({
        pathname: '/profile/[did]',
        params: { did: other.did },
      });
    }
  }, [navigation, other]);

  const nameHitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

  return (
    <View style={styles.conversationItem}>
      <Pressable onPress={handleAvatarPress} style={styles.profileImage}>
        <Avatar
          uri={other?.avatar}
          type="profile"
          size={55}
          showRing={true}
          style={styles.avatarFill}
        />
      </Pressable>
      <Pressable onPress={handlePress} style={styles.content}>
        <View style={styles.nameRow}>
          <Pressable onPress={handleNamePress} hitSlop={nameHitSlop} style={styles.namePressable}>
            <Text style={styles.name} numberOfLines={1}>
              {nameLabel}
            </Text>
            {handle && (
              <VerificationBadge handle={handle} textSize={14} textColor={Colors.neutral[50]} />
            )}
          </Pressable>
          {sentAt && <Text style={styles.time}>{formatRelativeDate(sentAt)}</Text>}
        </View>
        <View style={styles.previewRow}>
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {preview || 'Tap to open'}
          </Text>
          {unread && <View style={styles.unreadDot} />}
        </View>
      </Pressable>
    </View>
  );
});
ConversationItem.displayName = 'ConversationItem';

const ChatsTab = forwardRef<ScrollToTopRef>((_, ref) => {
  const listRef = useRef<LegendListRef>(null);
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    }),
    []
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: async ({ pageParam }) => ChatService.listConvos(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.cursor ?? undefined,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    placeholderData: prev => prev,
  });

  const conversations: ConvoView[] = useMemo(
    () => data?.pages.flatMap(p => p.conversations) ?? [],
    [data]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConvoView }) => <ConversationItem item={item} navigation={navigation} />,
    [navigation]
  );

  const keyExtractor = useCallback((item: ConvoView) => item.id, []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <EmptyFeed
          type="no-connection"
          message="can't load conversations"
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.listContainer}>
        <ChatsLoading />
      </View>
    );
  }

  return (
    <LegendList
      ref={listRef}
      style={styles.listContainer}
      contentContainerStyle={[
        styles.listContentContainer,
        { paddingBottom: bottomNavBarHeight + 5 },
      ]}
      data={conversations}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={ChatDivider}
      estimatedItemSize={80}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={() => refetch()}
          tintColor={Colors.neutral[50]}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={!isLoading ? <EmptyChats /> : null}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.loadingMoreContainer}>
            <Loading3FillIcon size={24} color={Colors.neutral[50]} />
          </View>
        ) : null
      }
    />
  );
});
ChatsTab.displayName = 'ChatsTab';

export default ChatsTab;

const styles = StyleSheet.create({
  listContainer: { flex: 1 },
  listContentContainer: { paddingHorizontal: 10 },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.neutral[900],
    marginLeft: 65,
    marginRight: -10,
  },
  profileImage: {
    width: 55,
    height: 55,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 12,
  },
  avatarFill: { width: '100%', height: '100%' },
  content: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  namePressable: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  name: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-Black',
    marginRight: 4,
    flexShrink: 1,
  },
  time: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    marginLeft: 'auto',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  preview: {
    color: Colors.neutral[400],
    fontSize: 16.5,
    fontFamily: 'Figtree-Medium',
    flex: 1,
  },
  previewUnread: {
    color: Colors.neutral[50],
    fontFamily: 'Figtree-SemiBold',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.teal[600],
    marginLeft: 6,
  },
  errorContainer: { flex: 1, padding: 20 },
  loadingMoreContainer: { padding: 20, alignItems: 'center' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
});
