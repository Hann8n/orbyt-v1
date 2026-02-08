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
import { ChatService, type ListConvosFilter } from '../../../services/api/chat/ChatService';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors } from '../../../theme';
import { OptionsButton } from '../../../components/ui/OptionsButton';
import { Avatar } from '../../../components/ui/UI';
import Icon, {
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
import ChatSettingsSheet from './ChatSettingsSheet';
import { useUserStore } from '../../../stores/userStore';
import { getActiveStreak, isStreakActive } from '../../../utils/chat/streak';
import { useAvatarProfileRing } from '../../../services/colors';
import type { ProfileViewBasic, RecordValue } from '../../../services/api/types';

type ConvoView = ChatBskyConvoDefs.ConvoView;

// Type for embed record viewRecord
interface EmbedRecordViewRecord {
  $type?: string;
  author?: ProfileViewBasic;
  value?: RecordValue;
  notFound?: boolean;
  blocked?: boolean;
  detached?: boolean;
}

const EmptyChats: React.FC<{ message?: string }> = ({ message = 'No chats, yet…' }) => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

const ChatsLoading = () => (
  <View style={styles.loadingContainer}>
    <Loading3FillIcon size={48} color={Colors.neutral[50]} />
  </View>
);

const ChatDivider = () => <View style={styles.divider} />;

/** Preview from listConvos lastMessage (API may omit $type; accept object with text). */
function getLastMessagePreview(
  lastMessage: ConvoView['lastMessage'],
  currentUserDid: string | undefined
): string {
  if (!lastMessage || typeof lastMessage !== 'object') return '';
  if (ChatBskyConvoDefs.isMessageView(lastMessage)) {
    // If the last message includes an embedded post, prefer a richer single-line preview.
    const msg = lastMessage as ChatBskyConvoDefs.MessageView;
    const senderDid = (msg as { sender?: { did?: string } }).sender?.did;
    const isFromMe = !!currentUserDid && !!senderDid && senderDid === currentUserDid;
    const embed = (msg as { embed?: unknown }).embed;
    if (embed && typeof embed === 'object') {
      const embedType = (embed as { $type?: string }).$type;
      // MessageView embed in chat is app.bsky.embed.record#view (lexicon).
      if (embedType === 'app.bsky.embed.record#view' && 'record' in embed) {
        const record = (embed as { record?: EmbedRecordViewRecord }).record;
        if (record && typeof record === 'object') {
          const recordType = record.$type;
          if (recordType === 'app.bsky.embed.record#viewRecord' && record.author && record.value) {
            const authorHandleRaw = (record as { author?: { handle?: string } }).author?.handle;
            const authorHandle = authorHandleRaw ? formatHandle(authorHandleRaw) : '';
            const base = isFromMe ? 'You shared a post' : 'Shared a post';
            return authorHandle ? `${base} by @${authorHandle}` : base;
          }
          // Unavailable record variants (notFound/blocked/detached)
          if (
            recordType === 'app.bsky.embed.record#viewNotFound' ||
            recordType === 'app.bsky.embed.record#viewBlocked' ||
            recordType === 'app.bsky.embed.record#viewDetached' ||
            record.notFound === true ||
            record.blocked === true ||
            record.detached === true
          ) {
            return isFromMe ? 'You shared a post' : 'Shared a post';
          }
        }
        return isFromMe ? 'You shared a post' : 'Shared a post';
      }
    }
    return msg.text ?? '';
  }
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
    const preview = getLastMessagePreview(item.lastMessage, currentUser?.did ?? undefined);
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
        navigation.navigate({
          pathname: '/chat/[id]',
          params: { id: item.id, did: other.did },
        });
      }
    }, [navigation, item.id, other]);

    const handleAvatarPress = useCallback(() => {
      if (other?.did) {
        navigation.navigate({
          pathname: '/profile/[did]',
          params: { did: other.did },
        });
      }
    }, [navigation, other]);

    const handleNamePress = useCallback(() => {
      if (other?.did) {
        navigation.navigate({
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

    const cached = queryClient.getQueryData<{
      messages?: Array<{ sentAt?: string; sender?: { did?: string } }>;
    }>(queryKeys.chat.messages.byConversation(item.id ?? ''));
    const { show: showStreak, count: streak } = getActiveStreak(
      sentAt,
      cached?.messages ?? [],
      currentUser?.did ?? undefined
    );

    const ringProps = useAvatarProfileRing(other?.did ?? undefined);

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

type ChatSegment = 'all' | 'unread' | 'requests';

const SEGMENT_OPTIONS: { value: ChatSegment; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'requests', label: 'Requests' },
];

function segmentToFilter(segment: ChatSegment): ListConvosFilter {
  if (segment === 'requests') return { status: 'request' };
  if (segment === 'unread') return { status: 'accepted', readState: 'unread' };
  return { status: 'accepted' };
}

export interface ChatsTabProps {
  /** Optional initial filter (e.g. from /chat/requests page). Segment bar uses this to set initial selection. */
  chatFilter?: ListConvosFilter;
}

const ChatsTab = forwardRef<ScrollToTopRef, ChatsTabProps>(({ chatFilter }, ref) => {
  const listRef = useRef<LegendListRef>(null);
  const scrollOffsetRef = useRef(0);
  const previousFirstConvoIdRef = useRef<string | undefined>(undefined);
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);

  const [showChatSettingsSheet, setShowChatSettingsSheet] = useState(false);
  const [segment, setSegment] = useState<ChatSegment>(() => {
    if (chatFilter?.status === 'request') return 'requests';
    if (chatFilter?.readState === 'unread') return 'unread';
    return 'all';
  });

  const effectiveFilter = useMemo(() => segmentToFilter(segment), [segment]);

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
    queryKey: queryKeys.chat.conversations.list(undefined, effectiveFilter),
    queryFn: async ({ pageParam }) =>
      ChatService.listConvos(pageParam as string | null, effectiveFilter),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 30000, // Auto-refresh list to stay in sync with indicator
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    placeholderData: prev => prev,
  });
  // Refetch when chatFilter changes (query key already includes it)

  const conversations: ConvoView[] = useMemo(
    () => data?.pages?.flatMap(p => p?.conversations ?? []) ?? [],
    [data]
  );

  // Prefetch messages for recent convos that might show a streak, so the list can display streak badges.
  // Without this, streak only shows when that convo was previously opened (messages in cache).
  const convoIdsToFetchForStreak = useMemo(() => {
    const ids: string[] = [];
    for (const c of conversations) {
      const id = c?.id;
      if (!id) continue;
      const lastMsg = c.lastMessage;
      const sentAt =
        lastMsg &&
        typeof lastMsg === 'object' &&
        'sentAt' in lastMsg &&
        typeof (lastMsg as { sentAt?: string }).sentAt === 'string'
          ? (lastMsg as { sentAt: string }).sentAt
          : undefined;
      if (!isStreakActive(sentAt)) continue;
      const cached = queryClient.getQueryData<{ messages?: unknown[] }>(
        queryKeys.chat.messages.byConversation(id)
      );
      if (cached?.messages && cached.messages.length > 0) continue;
      ids.push(id);
      if (ids.length >= 5) break;
    }
    return ids;
  }, [conversations, queryClient]);

  useQueries({
    queries: convoIdsToFetchForStreak.map(convoId => ({
      queryKey: queryKeys.chat.messages.byConversation(convoId),
      queryFn: () => ChatService.getMessages(convoId, null),
      staleTime: 60 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    })),
  });

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

  const listHeaderComponent = useMemo(
    () => (
      <View style={styles.segmentRow}>
        <View style={styles.segmentChipsWrap}>
          {SEGMENT_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              onPress={() => setSegment(opt.value)}
              style={[styles.segmentChip, segment === opt.value && styles.segmentChipActive]}
            >
              <Text
                style={[
                  styles.segmentChipText,
                  segment === opt.value && styles.segmentChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setShowChatSettingsSheet(true)} style={styles.segmentGearButton}>
          <Icon name="settings" size={22} color={Colors.neutral[50]} />
        </Pressable>
      </View>
    ),
    [segment]
  );

  const emptyMessage =
    segment === 'unread'
      ? 'All caught up'
      : segment === 'requests'
        ? 'No requests'
        : 'No chats, yet…';

  return (
    <>
      <LegendList
        ref={listRef}
        style={styles.listContainer}
        contentContainerStyle={[
          styles.listContentContainer,
          { paddingBottom: bottomNavBarHeight + 5 },
        ]}
        contentInsetAdjustmentBehavior="never"
        data={isError ? [] : conversations}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ItemSeparatorComponent={ChatDivider}
        estimatedItemSize={80}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={listHeaderComponent}
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
        ListEmptyComponent={
          isError ? (
            <View style={styles.errorContainer}>
              <EmptyFeed
                type="no-connection"
                message="can't load conversations"
                onRetry={() => refetch()}
              />
            </View>
          ) : isLoading && conversations.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ChatsLoading />
            </View>
          ) : (
            <EmptyChats message={emptyMessage} />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingMoreContainer}>
              <Loading3FillIcon size={24} color={Colors.neutral[50]} />
            </View>
          ) : null
        }
      />
      <ChatSettingsSheet
        visible={showChatSettingsSheet}
        onDismiss={() => setShowChatSettingsSheet(false)}
      />
    </>
  );
});
ChatsTab.displayName = 'ChatsTab';

export default ChatsTab;

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  segmentChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.MEDIUM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentChipActive: {
    backgroundColor: Colors.neutral[50],
  },
  segmentChipText: {
    fontSize: 15,
    fontFamily: 'Figtree-Bold',
    color: Colors.neutral[400],
  },
  segmentChipTextActive: {
    fontFamily: 'Figtree-Bold',
    color: Colors.black,
  },
  segmentGearButton: {
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
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
    marginLeft: 6,
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
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 34,
    justifyContent: 'center',
  },
  requestOptionButtonCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestOptionButtonText: {
    textAlign: 'center',
    fontSize: 15,
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
