import i18n from '../../../i18n';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  BORDER_RADIUS,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import {
  ACTIVITY_LIST_MUTED_ICON_SIZE,
  ACTIVITY_LIST_SENT_BY_ME_ICON_SIZE,
  ACTIVITY_LIST_STREAK_ICON_SIZE,
  ACTIVITY_LIST_TEXT_LEADING,
  activityListSharedStyles,
} from './ActivityListStyles';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import type { ScrollToTopRef } from '../../../utils/navigation/tabRefs';
import { ChatBskyConvoDefs } from '@atproto/api';
import { ChatService, type ListConvosFilter } from '../../../services/api/chat/ChatService';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';

import { Colors } from '../../../theme';
import { OptionsButton } from '../../../components/ui/OptionsButton';
import { Avatar } from '../../../components/ui/UI';
import Icon, {
  FlameFillIcon,
  FireFillIcon,
  MutedChatIcon,
  ShareForwardFillIcon,
} from '../../../components/ui/Icon';
import { VerificationBadge, BotBadge } from '../badging';
import EmptyFeed from '../feed/EmptyFeed';
import { getBottomNavBarHeight } from '../../../utils/device/screen';
import { formatHandle } from '../../../utils/formatting/handles';
import { formatRelativeDate } from '../../ui/RelativeDate';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { queryKeys } from '../../../utils/query/queryKeys';
import { chatReactQueryOptions } from '../../../utils/query/chatQueryOptions';
import ChatSettingsSheet from './ChatSettingsSheet';
import { useUserStore } from '../../../stores/userStore';
import { useProfileChannelNavigation } from '../../../hooks/useProfileChannelNavigation';
import { getActiveStreak, isStreakActive } from '../../../utils/chat/streak';
import type { ProfileViewBasic, RecordValue } from '../../../services/api/types';
import ActivitySegmentedChips from './ActivitySegmentedChips';
import { itemSizeConfig } from '@/components/ui/ItemStyles';

type ConvoView = ChatBskyConvoDefs.ConvoView;

const keyExtractor = (item: ConvoView) => item.id;

interface EmbedRecordViewRecord {
  $type?: string;
  author?: ProfileViewBasic;
  value?: RecordValue;
  notFound?: boolean;
  blocked?: boolean;
  detached?: boolean;
}

const EmptyChats: React.FC<{ message?: string }> = ({ message }) => {
  const { t } = useTranslation();
  const displayMessage = message ?? t('chat.noChatsYet');
  return (
    <View style={activityListSharedStyles.emptyContainer}>
      <Text style={activityListSharedStyles.emptyText}>{displayMessage}</Text>
    </View>
  );
};

const ChatsLoading = () => (
  <View style={activityListSharedStyles.loadingContainer}>
    <ActivityIndicator size="large" color={Colors.neutral[50]} />
  </View>
);

const ChatDivider = () => <View style={activityListSharedStyles.dividerInset} />;

/** Preview from listConvos lastMessage (API may omit $type; accept object with text). */
function getLastMessagePreview(
  lastMessage: ConvoView['lastMessage'],
  currentUserDid: string | undefined
): string {
  if (!lastMessage || typeof lastMessage !== 'object') return '';
  if (ChatBskyConvoDefs.isMessageView(lastMessage)) {
    const msg = lastMessage;
    const senderDid = msg.sender?.did;
    const isFromMe = senderDid === currentUserDid;
    const embed = msg.embed;
    if (embed && typeof embed === 'object') {
      const embedType = (embed as { $type?: string }).$type;
      if (
        (embedType === 'app.bsky.embed.record#view' || embedType === 'app.bsky.embed.record') &&
        'record' in embed
      ) {
        const record = (embed as { record?: EmbedRecordViewRecord }).record;
        if (record && typeof record === 'object') {
          const recordType = record.$type;
          if (recordType === 'app.bsky.embed.record#viewRecord' && record.author && record.value) {
            const authorHandle =
              record.author.handle && typeof record.author.handle === 'string'
                ? formatHandle(record.author.handle)
                : '';
            const base = isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
            return authorHandle ? `${base} by @${authorHandle}` : base;
          }
          const unavailableTypes = [
            'app.bsky.embed.record#viewNotFound',
            'app.bsky.embed.record#viewBlocked',
            'app.bsky.embed.record#viewDetached',
          ];
          if (
            (recordType && unavailableTypes.includes(recordType)) ||
            record.notFound ||
            record.blocked ||
            record.detached
          ) {
            return isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
          }
        }
        return isFromMe ? i18n.t('chat.youSharedPost') : i18n.t('chat.sharedPost');
      }
    }
    return msg.text ?? '';
  }
  if ('text' in lastMessage && typeof lastMessage.text === 'string') {
    return lastMessage.text;
  }
  return i18n.t('chat.messageDeleted');
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
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { navigateToProfile: goToProfile } = useProfileChannelNavigation();
    const currentUser = useUserStore(s => s.currentUser);
    const other = useMemo(
      () => getOtherMember(item, currentUser?.did ?? undefined),
      [item, currentUser?.did]
    );
    const handle = other?.handle ?? '';
    const nameLabel = formatHandle(handle) || t('feed.unknownUser');
    const preview = getLastMessagePreview(item.lastMessage, currentUser?.did ?? undefined);
    const lastMsg = item.lastMessage;
    const sentAt =
      lastMsg && 'sentAt' in lastMsg && typeof lastMsg.sentAt === 'string'
        ? lastMsg.sentAt
        : undefined;
    const unread = (item.unreadCount ?? 0) > 0;
    const isRequest = item.status === 'request';
    const isMuted = item.muted ?? false;
    const lastMessageSenderDid =
      lastMsg && typeof lastMsg === 'object' && 'sender' in lastMsg
        ? (lastMsg as { sender?: { did?: string } }).sender?.did
        : undefined;
    const isLastMessageFromMe =
      currentUser?.did && lastMessageSenderDid && currentUser.did === lastMessageSenderDid;

    const handlePress = useCallback(() => {
      if (item.id && other?.did) {
        navigation.navigate({
          pathname: '/chat/[id]',
          params: { id: item.id, did: other.did },
        });
      }
    }, [navigation, item.id, other]);

    const handleProfilePress = useCallback(() => {
      if (other?.did) {
        goToProfile(other.did);
      }
    }, [goToProfile, other]);

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

    return (
      <View style={styles.conversationItem}>
        <View style={styles.conversationItemRow}>
          <NativePressable
            onPress={handleProfilePress}
            style={activityListSharedStyles.profileImage}
          >
            <Avatar
              uri={other?.avatar}
              type="profile"
              size={55}
              style={activityListSharedStyles.avatarFill}
            />
          </NativePressable>
          <NativePressable onPress={handlePress} style={activityListSharedStyles.mainColumn}>
            <View style={activityListSharedStyles.nameRow}>
              <NativePressable
                onPress={handleProfilePress}
                hitSlop={nameHitSlop}
                style={activityListSharedStyles.namePressable}
              >
                <Text style={activityListSharedStyles.authorName} numberOfLines={1}>
                  {nameLabel}
                </Text>
                {handle && (
                  <VerificationBadge
                    handle={handle}
                    textSize={itemSizeConfig.medium.badgeTextSize}
                    textColor={Colors.neutral[50]}
                  />
                )}
                {handle && (
                  <BotBadge
                    handle={handle}
                    did={other?.did}
                    labels={(other as ProfileViewBasic | undefined)?.labels}
                    textSize={itemSizeConfig.medium.badgeTextSize}
                    textColor={Colors.neutral[50]}
                  />
                )}
              </NativePressable>
              {isMuted && (
                <View style={styles.mutedIconWrap} accessibilityLabel={t('a11y.mutedConversation')}>
                  <MutedChatIcon size={ACTIVITY_LIST_MUTED_ICON_SIZE} color={Colors.neutral[500]} />
                </View>
              )}
              {showStreak && (
                <View style={styles.streakBadge}>
                  {streak < 7 ? (
                    <FlameFillIcon
                      size={ACTIVITY_LIST_STREAK_ICON_SIZE}
                      color={Colors.orange[500]}
                    />
                  ) : (
                    <FireFillIcon size={ACTIVITY_LIST_STREAK_ICON_SIZE} color={Colors.coral[600]} />
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
            <View style={activityListSharedStyles.actionRow}>
              <View style={activityListSharedStyles.actionTextAndTime}>
                {unread && (
                  <View style={styles.unreadDotWrap} accessibilityLabel={t('a11y.unreadMessages')}>
                    <View style={[styles.unreadDot, isMuted && styles.unreadDotMuted]} />
                  </View>
                )}
                {isLastMessageFromMe && (
                  <View style={styles.sentByMeIconWrap} accessibilityLabel={t('a11y.youSentLast')}>
                    <ShareForwardFillIcon
                      size={ACTIVITY_LIST_SENT_BY_ME_ICON_SIZE}
                      color={Colors.neutral[500]}
                    />
                  </View>
                )}
                <View style={activityListSharedStyles.secondaryLineWrap}>
                  <Text
                    style={[
                      activityListSharedStyles.actionText,
                      unread && !isMuted && styles.actionTextUnread,
                      isMuted && styles.actionTextMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {preview || (isRequest ? t('chat.chatRequest') : t('chat.tapToOpen'))}
                  </Text>
                </View>
                {sentAt && (
                  <>
                    <Text style={activityListSharedStyles.separatorDot}>•</Text>
                    <Text
                      style={[activityListSharedStyles.timeText, isMuted && styles.timeTextMuted]}
                    >
                      {formatRelativeDate(sentAt)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </NativePressable>
        </View>
        {isRequest ? (
          <View style={styles.requestActions}>
            <View style={styles.requestOptionButtonWrap}>
              <OptionsButton
                label={thisAccepting ? t('common.accepting') : t('common.accept')}
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
                label={thisDeclining ? t('common.declining') : t('common.decline')}
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

const SEGMENT_OPTIONS: { value: ChatSegment; labelKey: string }[] = [
  { value: 'all', labelKey: 'chat.all' },
  { value: 'unread', labelKey: 'chat.unread' },
  { value: 'requests', labelKey: 'chat.requests' },
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

const ChatsTab = ({
  ref,
  chatFilter,
}: ChatsTabProps & {
  ref?: React.Ref<ScrollToTopRef>;
}) => {
  const { t } = useTranslation();
  const listRef = useRef<FlashListRef<ConvoView>>(null);
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

  const { mutate: acceptConvo } = useMutation({
    mutationFn: (convoId: string) => ChatService.acceptConvo(convoId),
    onSuccess: (_, convoId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
    },
  });

  const { mutate: leaveConvo } = useMutation({
    mutationFn: (convoId: string) => ChatService.leaveConvo(convoId),
    onSuccess: (_, convoId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
    },
  });

  const [pendingAcceptId, setPendingAcceptId] = useState<string | null>(null);
  const [pendingDeclineId, setPendingDeclineId] = useState<string | null>(null);

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
    ...chatReactQueryOptions,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

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
      ...chatReactQueryOptions,
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

  const handleRefresh = useCallback(() => {
    setIsUserRefreshing(true);
    refetch().finally(() => setIsUserRefreshing(false));
  }, [refetch]);

  const handleAcceptConvo = useCallback(
    (convoId: string) => {
      setPendingAcceptId(convoId);
      acceptConvo(convoId, {
        onSettled: () => setPendingAcceptId(null),
      });
    },
    [acceptConvo]
  );

  const handleDeclineConvo = useCallback(
    (convoId: string) => {
      setPendingDeclineId(convoId);
      leaveConvo(convoId, {
        onSettled: () => setPendingDeclineId(null),
      });
    },
    [leaveConvo]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConvoView }) => (
      <ConversationItem
        item={item}
        navigation={navigation}
        onAccept={handleAcceptConvo}
        onDecline={handleDeclineConvo}
        isAccepting={pendingAcceptId === item.id}
        isDeclining={pendingDeclineId === item.id}
      />
    ),
    [navigation, handleAcceptConvo, handleDeclineConvo, pendingAcceptId, pendingDeclineId]
  );

  const getItemType = useCallback((item: ConvoView) => {
    return item.status === 'request' ? 'request' : 'conversation';
  }, []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const listHeaderComponent = useMemo(
    () => (
      <View style={styles.segmentRow}>
        <ActivitySegmentedChips
          options={SEGMENT_OPTIONS.map(opt => ({
            key: opt.value,
            label: t(opt.labelKey),
            selected: segment === opt.value,
            onPress: () => setSegment(opt.value),
          }))}
          containerStyle={styles.segmentChipsWrap}
          trackStyle={styles.segmentChipsTrack}
        />
        <NativePressable
          onPress={() => setShowChatSettingsSheet(true)}
          style={styles.segmentGearButton}
        >
          <Icon name="settings_2" size={22} color={Colors.neutral[50]} />
        </NativePressable>
      </View>
    ),
    [segment, t]
  );

  const emptyMessage =
    segment === 'unread'
      ? t('chat.allCaughtUp')
      : segment === 'requests'
        ? t('chat.noRequests')
        : t('chat.noChatsYet');

  return (
    <>
      <FlashList
        ref={listRef}
        style={activityListSharedStyles.listContainer}
        contentContainerStyle={[
          activityListSharedStyles.listContentContainer,
          { paddingBottom: bottomNavBarHeight + 5 },
        ]}
        contentInsetAdjustmentBehavior="never"
        data={isError ? [] : conversations}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ItemSeparatorComponent={ChatDivider}
        drawDistance={400}
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
        showsVerticalScrollIndicator={
          conversations.length >= SCROLL_INDICATOR_CONSTANTS.ACTIVITY_LIST_MIN_ITEMS
        }
        ListEmptyComponent={
          isError ? (
            <View style={activityListSharedStyles.errorContainer}>
              <EmptyFeed
                type="no-connection"
                message={t('chat.cantLoadConversations')}
                onRetry={() => refetch()}
              />
            </View>
          ) : isLoading && conversations.length === 0 ? (
            <View style={activityListSharedStyles.loadingContainer}>
              <ChatsLoading />
            </View>
          ) : (
            <EmptyChats message={emptyMessage} />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={activityListSharedStyles.loadingMoreContainer}>
              <ActivityIndicator size="small" color={Colors.neutral[50]} />
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
};
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
    flexShrink: 1,
  },
  segmentChipsTrack: {
    backgroundColor: Colors.neutral[975],
  },
  segmentGearButton: {
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationItem: {
    flexDirection: 'column',
    paddingVertical: 10,
  },
  conversationItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutedIconWrap: {
    marginLeft: 6,
  },
  actionTextUnread: {
    color: Colors.neutral[50],
    fontFamily: FontFamily.semibold,
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
    backgroundColor: Colors.neutral[925],
    gap: 4,
  },
  streakBadgeText: {
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.semibold,
  },
  streakBadgeTextFlame: {
    color: Colors.orange[500],
  },
  streakBadgeTextFire: {
    color: Colors.coral[600],
  },
  timeTextMuted: {
    color: Colors.neutral[600],
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingLeft: ACTIVITY_LIST_TEXT_LEADING,
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
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
  },
  requestOptionButtonAcceptBg: {
    backgroundColor: Colors.brand.teal,
  },
  requestOptionButtonAcceptText: {
    color: Colors.neutral[975],
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
});
