import React, {
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { LegendList, LegendListRef } from '@legendapp/list';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';
import { ChatBskyConvoDefs } from '@atproto/api';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors } from '../../../theme';
import { OptionsButton } from '../../../components/ui/OptionsButton';
import { Avatar } from '../../../components/ui/UI';
import {
  FlameFillIcon,
  FireFillIcon,
  Loading3FillIcon,
  MutedChatIcon,
  ShareForwardFillIcon,
} from '../../../components/ui/Icon';
import { VerificationBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/device/screen';
import { formatHandle } from '../../../utils/formatting/handles';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { queryKeys } from '../../../utils/query/queryKeys';
import { useUserStore } from '../../../stores/userStore';
import { getActiveStreak } from '../../../utils/chat/streak';
import { useAvatarProfileRing } from '../../../hooks/useOrbytColors';

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
  onAccept: (convoId: string) => void;
  onDecline: (convoId: string) => void;
  isAccepting: boolean;
  isDeclining: boolean;
};

const ConversationItem = React.memo<ConversationItemProps>(
  ({ item, navigation, onAccept, onDecline, isAccepting, isDeclining }) => {
    const queryClient = useQueryClient();
    const currentUser = useUserStore(s => s.currentUser);
    const other = useMemo(
      () => getOtherMember(item, currentUser?.did ?? undefined),
      [item, currentUser?.did]
    );
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
    const isRequest = item.status === 'request';
    const isMuted = item.muted ?? false;
    const lastMessageSenderDid =
      lastMsg && typeof lastMsg === 'object' && 'sender' in lastMsg
        ? (lastMsg as { sender?: { did?: string } }).sender?.did
        : undefined;
    const isLastMessageFromMe = !!currentUser?.did && lastMessageSenderDid === currentUser.did;

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

    const handleAccept = useCallback(() => {
      if (item.id) onAccept(item.id);
    }, [item.id, onAccept]);

    const handleDecline = useCallback(() => {
      if (item.id) onDecline(item.id);
    }, [item.id, onDecline]);

    const nameHitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
    const thisAccepting = isRequest && isAccepting;
    const thisDeclining = isRequest && isDeclining;

    const cached = queryClient.getQueryData<{ messages?: Array<{ sentAt?: string }> }>(
      queryKeys.chat.messages.byConversation(item.id ?? '')
    );
    const { show: showStreak, count: streak } = getActiveStreak(sentAt, cached?.messages ?? []);

    const ringProps = useAvatarProfileRing(other?.did ?? null);

    return (
      <View style={styles.conversationItem}>
        <View style={styles.conversationItemRow}>
          <Pressable onPress={handleAvatarPress} style={styles.profileImage}>
            <Avatar
              uri={other?.avatar}
              type="profile"
              size={55}
              showRing={ringProps.showRing}
              ringColor={ringProps.ringColor}
              profileColors={ringProps.profileColors}
              style={styles.avatarFill}
            />
          </Pressable>
          <Pressable onPress={handlePress} style={styles.notificationContent}>
            <View style={styles.nameRow}>
              <Pressable
                onPress={handleNamePress}
                hitSlop={nameHitSlop}
                style={styles.namePressable}
              >
                <Text
                  style={[styles.authorName, isMuted && styles.authorNameMuted]}
                  numberOfLines={1}
                >
                  {nameLabel}
                </Text>
                {handle && (
                  <VerificationBadge handle={handle} textSize={14} textColor={Colors.neutral[50]} />
                )}
              </Pressable>
              {isMuted && (
                <View style={styles.mutedIconWrap} accessibilityLabel="Muted conversation">
                  <MutedChatIcon size={18} color={Colors.neutral[500]} />
                </View>
              )}
            </View>
            <View style={styles.actionRow}>
              <View style={styles.actionTextAndTime}>
                {unread && (
                  <View style={styles.unreadDotWrap} accessibilityLabel="Unread messages">
                    <View style={[styles.unreadDot, isMuted && styles.unreadDotMuted]} />
                  </View>
                )}
                {isLastMessageFromMe && (
                  <View
                    style={styles.sentByMeIconWrap}
                    accessibilityLabel="You sent the last message"
                  >
                    <ShareForwardFillIcon size={16} color={Colors.neutral[500]} />
                  </View>
                )}
                <View style={styles.messagePreviewWrap}>
                  <Text
                    style={[
                      styles.actionText,
                      unread && !isMuted && styles.actionTextUnread,
                      isMuted && styles.actionTextMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {preview || (isRequest ? 'Chat request' : 'Tap to open')}
                  </Text>
                </View>
                {sentAt && (
                  <Text style={[styles.timeText, isMuted && styles.timeTextMuted]}>
                    {formatRelativeDate(sentAt)}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
          {showStreak && (
            <View style={styles.streakBadge}>
              {streak < 7 ? (
                <FlameFillIcon size={14} color={Colors.orange[500]} />
              ) : (
                <FireFillIcon size={14} color="#dc2626" />
              )}
              <Text
                style={[
                  styles.streakBadgeText,
                  streak < 7 ? styles.streakBadgeTextFlame : styles.streakBadgeTextFire,
                ]}
                numberOfLines={1}
              >
                {streak}
              </Text>
            </View>
          )}
        </View>
        {isRequest ? (
          <View style={styles.requestActions}>
            <View style={styles.requestOptionButtonWrap}>
              <OptionsButton
                label={thisAccepting ? 'Accepting…' : 'Accept'}
                onPress={handleAccept}
                disabled={thisAccepting || thisDeclining}
                linkType="none"
                style={styles.requestOptionButton}
                containerStyle={[
                  styles.requestOptionButtonInner,
                  styles.requestOptionButtonCenter,
                  styles.requestOptionButtonAcceptBg,
                ]}
                textStyle={[styles.requestOptionButtonText, styles.requestOptionButtonAcceptText]}
              />
            </View>
            <View style={styles.requestOptionButtonWrap}>
              <OptionsButton
                label={thisDeclining ? 'Declining…' : 'Decline'}
                onPress={handleDecline}
                disabled={thisAccepting || thisDeclining}
                linkType="none"
                style={styles.requestOptionButton}
                containerStyle={[styles.requestOptionButtonInner, styles.requestOptionButtonCenter]}
                textStyle={styles.requestOptionButtonText}
              />
            </View>
          </View>
        ) : null}
      </View>
    );
  }
);
ConversationItem.displayName = 'ConversationItem';

const SCROLL_AT_TOP_THRESHOLD = 80;

const ChatsTab = forwardRef<ScrollToTopRef>((_, ref) => {
  const listRef = useRef<LegendListRef>(null);
  const scrollOffsetRef = useRef(0);
  const previousFirstConvoIdRef = useRef<string | undefined>(undefined);
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);

  const acceptConvoMutation = useMutation({
    mutationFn: (convoId: string) => ChatService.acceptConvo(convoId),
    onSuccess: (_, convoId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
    },
  });

  const leaveConvoMutation = useMutation({
    mutationFn: (convoId: string) => ChatService.leaveConvo(convoId),
    onSuccess: (_, convoId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
    },
  });

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
    refetchInterval: 30000, // Auto-refresh list to stay in sync with indicator
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    placeholderData: prev => prev,
  });

  const conversations: ConvoView[] = useMemo(
    () => data?.pages.flatMap(p => p.conversations) ?? [],
    [data]
  );

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    const firstId = conversations[0]?.id;
    if (firstId === undefined) return;
    const prevFirstId = previousFirstConvoIdRef.current;
    const atTop = scrollOffsetRef.current <= SCROLL_AT_TOP_THRESHOLD;
    if (prevFirstId !== undefined && prevFirstId !== firstId && atTop) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    previousFirstConvoIdRef.current = firstId;
  }, [conversations]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleRefresh = useCallback(() => {
    setIsUserRefreshing(true);
    refetch().finally(() => setIsUserRefreshing(false));
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: ConvoView }) => (
      <ConversationItem
        item={item}
        navigation={navigation}
        onAccept={convoId => acceptConvoMutation.mutate(convoId)}
        onDecline={convoId => leaveConvoMutation.mutate(convoId)}
        isAccepting={acceptConvoMutation.isPending && acceptConvoMutation.variables === item.id}
        isDeclining={leaveConvoMutation.isPending && leaveConvoMutation.variables === item.id}
      />
    ),
    [navigation, acceptConvoMutation, leaveConvoMutation]
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
      contentInsetAdjustmentBehavior="never"
      data={conversations}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={ChatDivider}
      estimatedItemSize={80}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isUserRefreshing && isRefetching && !isFetchingNextPage}
          onRefresh={handleRefresh}
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
    flexDirection: 'column',
    paddingVertical: 10,
  },
  conversationItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  notificationContent: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  namePressable: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '100%',
  },
  authorName: {
    color: Colors.neutral[50],
    fontSize: 18,
    marginBottom: 2,
    fontFamily: 'Figtree-Black',
    marginRight: 4,
    flexShrink: 1,
  },
  authorNameMuted: {
    color: Colors.neutral[500],
  },
  mutedIconWrap: {
    marginLeft: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  actionTextAndTime: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minWidth: 0,
  },
  messagePreviewWrap: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  actionText: {
    color: Colors.neutral[400],
    fontSize: 16.5,
    fontFamily: 'Figtree-Medium',
  },
  actionTextUnread: {
    color: Colors.neutral[50],
    fontFamily: 'Figtree-SemiBold',
  },
  actionTextMuted: {
    color: Colors.neutral[500],
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.neutral[900],
    gap: 4,
  },
  streakBadgeText: {
    fontSize: 12,
    fontFamily: 'Figtree-SemiBold',
  },
  streakBadgeTextFlame: {
    color: Colors.orange[500],
  },
  streakBadgeTextFire: {
    color: Colors.coral[600],
  },
  timeText: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    marginLeft: 4,
  },
  timeTextMuted: {
    color: Colors.neutral[600],
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingLeft: 67,
  },
  requestOptionButtonWrap: {
    flex: 1,
  },
  requestOptionButton: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  requestOptionButtonInner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  requestOptionButtonCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestOptionButtonText: {
    textAlign: 'center',
  },
  requestOptionButtonAcceptBg: {
    backgroundColor: Colors.brand.teal,
  },
  requestOptionButtonAcceptText: {
    color: Colors.black,
  },
  unreadDotWrap: {
    width: 8,
    height: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.teal[600],
  },
  unreadDotMuted: {
    backgroundColor: Colors.neutral[400],
  },
  sentByMeIconWrap: {
    width: 16,
    height: 16,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
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
