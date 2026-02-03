import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import {
  Canvas,
  Rect,
  LinearGradient as SkiaLinearGradient,
  vec,
  useCanvasSize,
} from '@shopify/react-native-skia';

import BlurredBackground from '../../src/components/ui/BlurredBackground';
import { LegendList } from '@legendapp/list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { Colors } from '../../src/theme';
import { BORDER_RADIUS } from '../../src/utils/constants';
import Icon, { BackArrowIcon, MoreFillIcon } from '../../src/components/ui/Icon';
import { Avatar } from '../../src/components/ui/UI';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { itemSizeConfig, sharedItemStyles } from '../../src/components/ui/ItemStyles';
import { useOrbytColors } from '../../src/hooks/useOrbytColors';
import { getProfileColors } from '../../src/utils/formatting/colors';
import { formatHandle } from '../../src/utils/formatting/handles';
import { queryKeys } from '../../src/utils/query/queryKeys';
import { format, parseISO, isValid, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { useProfileByDid, useBlockMutation } from '../../src/services/data/ProfileService';
import { ChatService } from '../../src/services/api/chat/ChatService';
import AtprotoService from '../../src/services/api/AtprotoService';
import { useUserStore } from '../../src/stores/userStore';
import type { MessageView } from '../../src/services/api/types';
import { useGlobalCommentSection } from '../../src/hooks/useGlobalModals';
import type { CommentSectionPost } from '../../src/stores/modalStore';
import { getVideoView } from '../../src/utils/video/helpers';
import { feedService } from '../../src/services/FeedService';
import type { ExtendedFeedViewPost, PostView } from '../../src/services/api/types';

/** Skia gradient overlay: transparent top → dark bottom, with children on top */
function SkiaGradientOverlay({
  style,
  children,
  pointerEvents = 'none',
}: {
  style: import('react-native').StyleProp<import('react-native').ViewStyle>;
  children: React.ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}) {
  const { ref, size } = useCanvasSize();
  const w = size.width;
  const h = size.height;
  return (
    <View style={style} pointerEvents={pointerEvents}>
      <Canvas ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none">
        {w > 0 && h > 0 && (
          <Rect x={0} y={0} width={w} height={h} dither={true}>
            <SkiaLinearGradient
              start={vec(0, 0)}
              end={vec(0, h)}
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              positions={[0, 1]}
              flags={1}
            />
          </Rect>
        )}
      </Canvas>
      {children}
    </View>
  );
}

/** Chat message item: full MessageView from API (id, rev, text, facets?, embed?, sender, sentAt, etc.) */
type MessageItem = MessageView & { sender?: { did: string } };

/** Window in minutes for grouping consecutive messages from same sender */
const MESSAGE_GROUP_WINDOW_MINUTES = 5;

/** List item: message or date separator */
type ChatListItem =
  | { type: 'message'; message: MessageItem; showTime: boolean; groupedWithPrevious: boolean }
  | { type: 'date'; dateKey: string; label: string };

function getDateGroupLabel(sentAt: string): string {
  const date = parseISO(sentAt);
  if (!isValid(date)) return '';
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

function getDateKey(sentAt: string): string {
  const date = parseISO(sentAt);
  if (!isValid(date)) return '';
  return format(date, 'yyyy-MM-dd');
}

function formatMessageTime(sentAt?: string): string {
  if (!sentAt) return '';
  const date = parseISO(sentAt);
  return isValid(date) ? format(date, 'h:mm a') : '';
}

function getMessagePreview(msg: MessageItem): string {
  if (msg.text != null && msg.text !== '') return msg.text;
  return 'Message deleted';
}

/** Embed is app.bsky.embed.record#view; record can be viewRecord | viewNotFound | viewBlocked | viewDetached (per app.bsky.embed.record View type) */
const EMBED_RECORD_VIEW = 'app.bsky.embed.record#view';
const RECORD_VIEW_RECORD = 'app.bsky.embed.record#viewRecord';
const RECORD_VIEW_NOT_FOUND = 'app.bsky.embed.record#viewNotFound';
const RECORD_VIEW_BLOCKED = 'app.bsky.embed.record#viewBlocked';
const RECORD_VIEW_DETACHED = 'app.bsky.embed.record#viewDetached';

/** Shape of embed.record for display (viewRecord has uri, cid, author, value, embeds; viewNotFound/viewBlocked/viewDetached have uri + flag) */
type EmbedRecordShape = {
  $type?: string;
  uri?: string;
  cid?: string;
  author?: { did: string; handle?: string; displayName?: string; avatar?: string };
  value?: { text?: string };
  embeds?: Array<{
    $type?: string;
    thumbnail?: string;
    playlist?: string;
    aspectRatio?: { width: number; height: number };
  }>;
  indexedAt?: string;
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  notFound?: true;
  blocked?: true;
  detached?: true;
};

const CHAT_EMBED_VIDEO_WIDTH = 150;
const CHAT_EMBED_VIDEO_ASPECT = 9 / 16; // 9:16 card
const CHAT_EMBED_VIDEO_RADIUS = 10; // slightly less round

/** Get video view from record.embeds (post can have video in embeds[] or as recordWithMedia) */
function getVideoViewFromRecordEmbeds(
  embeds: EmbedRecordShape['embeds']
): { thumbnail: string | null; playlist?: string } | null {
  if (!embeds?.length) return null;
  for (let i = 0; i < embeds.length; i++) {
    const view = getVideoView(embeds[i] as PostView['embed']);
    if (view) return { thumbnail: view.thumbnail || null, playlist: view.playlist };
    // recordWithMedia: embeds[i].media could be video
    const item = embeds[i] as {
      $type?: string;
      media?: { $type?: string; thumbnail?: string; playlist?: string };
    };
    if (item?.$type === 'app.bsky.embed.recordWithMedia#view' && item.media) {
      const mediaView = getVideoView(item.media as PostView['embed']);
      if (mediaView)
        return { thumbnail: mediaView.thumbnail || null, playlist: mediaView.playlist };
    }
  }
  return null;
}

function isEmbedRecordView(embed: MessageView['embed'] | null | undefined): boolean {
  if (!embed || typeof embed !== 'object') return false;
  return (
    (embed as { $type?: string }).$type === EMBED_RECORD_VIEW &&
    'record' in embed &&
    (embed as { record?: unknown }).record != null
  );
}

/** Shared author row: avatar + handle for both video and non-video embeds */
function EmbedAuthor({
  author,
  size,
  isFromMe,
  compact,
}: {
  author: EmbedRecordShape['author'];
  size: number;
  isFromMe: boolean;
  compact?: boolean;
}) {
  if (!author) return null;
  const handle = formatHandle(author.handle) || author.did;
  return (
    <View
      style={[
        styles.embedAuthorRow,
        compact && styles.embedAuthorRowCompact,
        isFromMe && styles.embedAuthorRowFromMe,
      ]}
    >
      <Avatar uri={author.avatar} type="profile" size={size} />
      <Text
        style={[
          styles.embedAuthorHandle,
          compact && styles.embedAuthorHandleCompact,
          isFromMe && styles.embedAuthorHandleFromMe,
        ]}
        numberOfLines={1}
      >
        {handle}
      </Text>
    </View>
  );
}

/** Shared description text for both video and non-video embeds */
function EmbedDescription({
  text,
  isFromMe,
  marginTop,
}: {
  text: string;
  isFromMe: boolean;
  marginTop?: number;
}) {
  if (!text) return null;
  return (
    <Text
      style={[
        styles.embedDescription,
        isFromMe && styles.embedDescriptionFromMe,
        marginTop != null && { marginTop },
      ]}
      numberOfLines={3}
    >
      {text}
    </Text>
  );
}

function ChatEmbeddedPost({
  embed,
  isFromMe,
}: {
  embed: NonNullable<MessageView['embed']>;
  isFromMe: boolean;
}) {
  const router = useRouter();
  const { presentCommentSection } = useGlobalCommentSection();
  const record = (embed as { record?: EmbedRecordShape }).record;
  if (!record || typeof record !== 'object') return null;

  const type = record.$type;

  if (type === RECORD_VIEW_NOT_FOUND || record.notFound === true) {
    return (
      <View
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post not found
        </Text>
      </View>
    );
  }
  if (type === RECORD_VIEW_BLOCKED || record.blocked === true) {
    return (
      <View
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post hidden
        </Text>
      </View>
    );
  }
  if (type === RECORD_VIEW_DETACHED || record.detached === true) {
    return (
      <View
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post unavailable
        </Text>
      </View>
    );
  }

  if (type !== RECORD_VIEW_RECORD || !record.uri || !record.author) return null;

  const author = record.author;
  const text = record.value?.text ?? '';
  const videoMeta = getVideoViewFromRecordEmbeds(record.embeds);
  const isVideo = !!videoMeta;

  // Video embed: 9:16 card, route to feed modal
  if (isVideo) {
    const thumbnailUrl = videoMeta!.thumbnail;
    const onPressVideo = () => {
      const uri = record.uri ?? '';
      if (!uri) return;
      const postFromRecord: PostView = {
        uri,
        cid: record.cid ?? '',
        author: {
          did: author.did,
          handle: author.handle,
          displayName: author.displayName,
          avatar: author.avatar,
        } as PostView['author'],
        record: (record.value ?? {}) as PostView['record'],
        embed: record.embeds?.[0] as PostView['embed'],
        indexedAt: record.indexedAt ?? new Date().toISOString(),
        replyCount: record.replyCount ?? 0,
        repostCount: record.repostCount ?? 0,
        likeCount: record.likeCount ?? 0,
      };
      const feedItem: ExtendedFeedViewPost = {
        post: postFromRecord as ExtendedFeedViewPost['post'],
        uniqueKey: uri,
      };
      feedService.setCurrentFeed([feedItem]);
      router.push({
        pathname: '/(modals)/feed',
        params: {
          feedOption: 'search',
          userDid: '',
          backgroundColor: Colors.black,
          secondaryColor: Colors.neutral[50],
          hasNextPage: 'false',
          isFetchingNextPage: 'false',
          initialIndex: '0',
        },
      });
    };

    const videoHeight = CHAT_EMBED_VIDEO_WIDTH / CHAT_EMBED_VIDEO_ASPECT;
    const thumbnailStyle = {
      width: CHAT_EMBED_VIDEO_WIDTH,
      height: videoHeight,
      borderRadius: CHAT_EMBED_VIDEO_RADIUS,
    };
    return (
      <View style={[styles.embedVideoOuter, isFromMe && styles.embedVideoOuterFromMe]}>
        <View style={[styles.embedVideoBlock, { width: CHAT_EMBED_VIDEO_WIDTH }]}>
          <Pressable
            onPress={onPressVideo}
            style={[
              styles.embedVideoCard,
              {
                width: CHAT_EMBED_VIDEO_WIDTH,
                height: videoHeight,
                borderRadius: CHAT_EMBED_VIDEO_RADIUS,
              },
            ]}
            android_ripple={{ color: Colors.neutral[700] }}
          >
            {thumbnailUrl ? (
              <View style={[styles.embedVideoThumbnailWrap, thumbnailStyle]}>
                <BlurredBackground thumbnailUrl={thumbnailUrl} />
                <Image
                  source={{ uri: thumbnailUrl }}
                  style={[styles.embedVideoThumbnail, thumbnailStyle]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </View>
            ) : (
              <View style={[styles.embedVideoPlaceholder, thumbnailStyle]}>
                <Icon name="videocam" size={24} color={Colors.neutral[500]} />
              </View>
            )}
            <SkiaGradientOverlay style={styles.embedVideoAuthorOverlay} pointerEvents="none">
              <EmbedAuthor author={author} size={20} isFromMe={isFromMe} compact />
            </SkiaGradientOverlay>
          </Pressable>
          <EmbedDescription text={text} isFromMe={isFromMe} marginTop={8} />
        </View>
      </View>
    );
  }

  // Non-video (text/image/quote): inline content, aligns with message side
  const onPressPost = () => {
    const uri = record.uri ?? '';
    const did = record.author?.did ?? '';
    if (!uri || !did) return;
    presentCommentSection({
      post: {
        uri,
        cid: record.cid,
        author: { did, handle: record.author?.handle, displayName: record.author?.displayName },
      } as CommentSectionPost,
    });
  };

  return (
    <Pressable
      onPress={onPressPost}
      style={[styles.embedContent, isFromMe && styles.embedContentFromMe]}
      android_ripple={{ color: Colors.neutral[700] }}
    >
      <EmbedAuthor author={author} size={24} isFromMe={isFromMe} />
      <EmbedDescription text={text} isFromMe={isFromMe} />
    </Pressable>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; did?: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const convoId = params.id ?? '';
  const otherDid = params.did ?? '';
  const [inputText, setInputText] = useState('');
  const currentUserDid = useUserStore(s => s.currentUser?.did);

  const { data: profile } = useProfileByDid(otherDid || null);
  const { data: orbytColors } = useOrbytColors(otherDid || null);
  const { data: currentUserOrbytColors } = useOrbytColors(currentUserDid ?? null);
  const profileColors = getProfileColors(orbytColors);
  const myProfileColors = getProfileColors(currentUserOrbytColors);
  const sentMessageAccentColor = myProfileColors.foregroundColor || Colors.brand.teal;
  const headerConfig = itemSizeConfig.large;
  const [showChatMenu, setShowChatMenu] = useState(false);

  const { data: convo } = useQuery({
    queryKey: queryKeys.chat.conversations.detail(convoId),
    queryFn: () => ChatService.getConvo(convoId),
    enabled: !!convoId,
  });

  const isConvoMuted = (convo as { muted?: boolean } | null)?.muted ?? false;
  const blockMutation = useBlockMutation();
  const isBlocked = !!(profile?.viewer?.blocking || profile?.viewer?.blockingByList);
  const isBlockedByList = !!profile?.viewer?.blockingByList;

  const {
    data: messagesData,
    refetch: refetchMessages,
    isRefetching,
  } = useQuery({
    queryKey: queryKeys.chat.messages.byConversation(convoId),
    queryFn: () => ChatService.getMessages(convoId, null),
    enabled: !!convoId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (text: string) => ChatService.sendMessage(convoId, { text }),
    onSuccess: () => {
      setInputText('');
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.byConversation(convoId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
    },
  });

  useEffect(() => {
    if (!convoId) return;
    ChatService.updateRead(convoId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      })
      .catch(() => {});
  }, [convoId, queryClient]);

  const listData = useMemo(() => {
    const raw = (messagesData?.messages ?? []) as MessageItem[];
    const messages = [...raw].reverse(); // oldest first, newest last
    const items: ChatListItem[] = [];
    let prevDateKey = '';
    let prevMsg: MessageItem | undefined;
    let prevSentAt: string | undefined;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const sentAt = msg.sentAt ?? '';
      const nextMsg = messages[i + 1];
      const nextSentAt = nextMsg?.sentAt ?? '';

      const sameSenderAsPrev =
        prevMsg && prevMsg.sender?.did && msg.sender?.did === prevMsg.sender.did;
      const withinWindow =
        sentAt &&
        prevSentAt &&
        (() => {
          const d1 = parseISO(sentAt);
          const d2 = parseISO(prevSentAt);
          return (
            isValid(d1) &&
            isValid(d2) &&
            Math.abs(differenceInMinutes(d1, d2)) <= MESSAGE_GROUP_WINDOW_MINUTES
          );
        })();
      const groupedWithPrevious = !!sameSenderAsPrev && !!withinWindow;

      const sameSenderAsNext =
        nextMsg && nextMsg.sender?.did && msg.sender?.did === nextMsg.sender.did;
      const nextWithinWindow =
        sentAt &&
        nextSentAt &&
        (() => {
          const d1 = parseISO(sentAt);
          const d2 = parseISO(nextSentAt);
          return (
            isValid(d1) &&
            isValid(d2) &&
            Math.abs(differenceInMinutes(d1, d2)) <= MESSAGE_GROUP_WINDOW_MINUTES
          );
        })();
      const showTime = !sameSenderAsNext || !nextWithinWindow;

      if (sentAt) {
        const dateKey = getDateKey(sentAt);
        if (dateKey && dateKey !== prevDateKey) {
          items.push({ type: 'date', dateKey, label: getDateGroupLabel(sentAt) });
          prevDateKey = dateKey;
        }
      }
      items.push({
        type: 'message',
        message: msg,
        showTime,
        groupedWithPrevious,
      });
      prevMsg = msg;
      prevSentAt = sentAt;
    }
    return items;
  }, [messagesData]);

  const renderListItem = useCallback(
    ({ item }: { item: ChatListItem }) => {
      if (item.type === 'date') {
        return (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </View>
        );
      }
      const msg = item.message;
      const isFromMe = msg.sender?.did === currentUserDid;
      const isNewSender = !item.groupedWithPrevious;
      const hasEmbed = isEmbedRecordView(msg.embed);
      return (
        <View
          style={[
            styles.messageRow,
            isFromMe ? styles.messageRowFromMe : styles.messageRowFromThem,
            isNewSender && styles.messageRowNewSender,
            isFromMe && { borderRightColor: sentMessageAccentColor },
          ]}
        >
          {msg.text != null && msg.text !== '' && (
            <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
              {msg.text}
            </Text>
          )}
          {hasEmbed && msg.embed && <ChatEmbeddedPost embed={msg.embed} isFromMe={!!isFromMe} />}
          {(!msg.text || msg.text === '') && !hasEmbed && (
            <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
              {getMessagePreview(msg)}
            </Text>
          )}
          {item.showTime && msg.sentAt && (
            <Text style={[styles.messageTime, isFromMe && styles.messageTimeFromMe]}>
              {formatMessageTime(msg.sentAt)}
            </Text>
          )}
        </View>
      );
    },
    [currentUserDid, sentMessageAccentColor]
  );

  const keyExtractor = useCallback((item: ChatListItem) => {
    if (item.type === 'date') return `date-${item.dateKey}`;
    return item.message.id;
  }, []);

  const handleBack = useCallback(() => router.back(), [router]);

  const handleViewProfile = useCallback(() => {
    setShowChatMenu(false);
    if (otherDid) router.push({ pathname: '/profile/[did]', params: { did: otherDid } });
  }, [router, otherDid]);

  const muteConvoMutation = useMutation({
    mutationFn: (mute: boolean) =>
      mute ? ChatService.muteConvo(convoId) : ChatService.unmuteConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      setShowChatMenu(false);
    },
  });

  const handleMuteToggle = useCallback(() => {
    muteConvoMutation.mutate(!isConvoMuted);
  }, [isConvoMuted, muteConvoMutation]);

  const leaveConvoMutation = useMutation({
    mutationFn: () => ChatService.leaveConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      setShowChatMenu(false);
      router.back();
    },
  });

  const handleLeaveConvo = useCallback(() => {
    Alert.alert('Leave conversation', 'Are you sure you want to leave this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => leaveConvoMutation.mutate() },
    ]);
  }, [leaveConvoMutation]);

  const [isReportSubmitting, setIsReportSubmitting] = useState(false);

  const reportConversation = useCallback(
    async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
      if (!otherDid) return;
      setIsReportSubmitting(true);
      try {
        const success = await AtprotoService.reportContent(otherDid, reasonType);
        if (success) {
          Alert.alert('Thank you', 'This conversation has been reported for review.');
          setShowChatMenu(false);
        } else {
          Alert.alert('Error', 'Failed to submit report. Please try again.');
        }
      } catch {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      } finally {
        setIsReportSubmitting(false);
      }
    },
    [otherDid]
  );

  const handleReportConversation = useCallback(() => {
    if (!otherDid) return;
    Alert.alert('Report conversation', 'Please select a reason for reporting this conversation:', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Spam', onPress: () => reportConversation('spam') },
      { text: 'Harmful content', onPress: () => reportConversation('violation') },
      { text: 'Misleading', onPress: () => reportConversation('misleading') },
      { text: 'Sexual content', onPress: () => reportConversation('sexual') },
      { text: 'Rude/offensive', onPress: () => reportConversation('rude') },
      { text: 'Other', onPress: () => reportConversation('other') },
    ]);
  }, [otherDid, reportConversation]);

  const handleBlockToggle = useCallback(() => {
    if (!profile?.did || !profile?.handle) return;
    if (blockMutation.isPending || isBlockedByList) return;
    if (isBlocked) {
      blockMutation.mutate({ did: profile.did, handle: profile.handle, isBlocked: false });
      setShowChatMenu(false);
    } else {
      Alert.alert(
        'Block user',
        'Are you sure you want to block this user? They will not be able to see your posts or message you.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => {
              blockMutation.mutate({ did: profile.did, handle: profile.handle, isBlocked: true });
              setShowChatMenu(false);
              router.back();
            },
          },
        ]
      );
    }
  }, [profile?.did, profile?.handle, isBlocked, isBlockedByList, blockMutation, router]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(text);
  }, [inputText, sendMessageMutation]);

  const canSend = inputText.trim().length > 0 && !sendMessageMutation.isPending;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const headerTop = insets.top + 4;
  const inputBottom = insets.bottom + 8;

  if (!convoId) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Invalid conversation</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrowIcon size={30} color={Colors.neutral[50]} />
        </Pressable>
        <View style={[sharedItemStyles.accountButtonContent, styles.headerCenter]}>
          <Pressable
            onPress={handleViewProfile}
            style={sharedItemStyles.avatarContainer}
            accessibilityRole="button"
            accessibilityLabel="View profile"
          >
            <Avatar
              uri={profile?.avatar}
              type="profile"
              size={headerConfig.avatarSize}
              showRing
              ringColor={profileColors.foregroundColor || Colors.neutral[200]}
              profileColors={{
                backgroundColor: profileColors.backgroundColor,
                foregroundColor: profileColors.foregroundColor,
                textColor: profileColors.foregroundColor,
              }}
              status={profile?.status}
            />
          </Pressable>
        </View>
        <Pressable
          onPress={() => setShowChatMenu(true)}
          style={styles.menuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Chat options"
        >
          <MoreFillIcon size={24} color={Colors.neutral[50]} />
        </Pressable>
      </View>

      <VerticalListSheet
        visible={showChatMenu}
        onDismiss={() => setShowChatMenu(false)}
        title={`Chat with ${formatHandle(profile?.handle) || 'user'}`}
        showCancelButton
        cancelButtonText="Cancel"
        name="chat-menu"
        detents={['auto']}
      >
        <View style={styles.menuOptionsContainer}>
          <VerticalListButton label="Go to profile" onPress={handleViewProfile} />
          <VerticalListButton
            label={isConvoMuted ? 'Unmute conversation' : 'Mute conversation'}
            onPress={handleMuteToggle}
            disabled={muteConvoMutation.isPending}
          />
          <VerticalListButton
            label={isBlocked ? 'Unblock account' : 'Block account'}
            onPress={handleBlockToggle}
            disabled={blockMutation.isPending || isBlockedByList}
          />
          <VerticalListButton
            label="Report conversation"
            onPress={handleReportConversation}
            disabled={isReportSubmitting}
          />
          <VerticalListButton
            label="Leave conversation"
            onPress={handleLeaveConvo}
            disabled={leaveConvoMutation.isPending}
          />
        </View>
      </VerticalListSheet>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {listData.length > 0 ? (
          <LegendList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            data={listData}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            estimatedItemSize={56}
            keyboardShouldPersistTaps="handled"
            alignItemsAtEnd
            maintainScrollAtEnd
            initialScrollIndex={listData.length - 1}
            onRefresh={refetchMessages}
            refreshing={isRefetching}
          />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetchMessages}
                tintColor={Colors.neutral[50]}
              />
            }
          >
            {messagesData ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        <View style={[styles.inputRow, { paddingBottom: inputBottom }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message"
              placeholderTextColor={Colors.neutral[500]}
              multiline
              maxLength={1000}
              editable={!sendMessageMutation.isPending}
              textAlignVertical="top"
              returnKeyType="send"
              blurOnSubmit={false}
            />
          </View>
          {canSend ? (
            <Pressable
              style={[styles.sendButton, !useLiquidGlass && styles.sendButtonFallback]}
              onPress={handleSend}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {useLiquidGlass ? (
                <>
                  <GlassView
                    style={styles.sendButtonGlass}
                    glassEffectStyle="clear"
                    tintColor="rgba(255, 255, 255, 1)"
                    isInteractive
                  />
                  <View style={styles.sendButtonContent} pointerEvents="none">
                    <Icon name="arrow-up-fill" size={22} color={Colors.black} />
                  </View>
                </>
              ) : (
                <Icon name="arrow-up-fill" size={22} color={Colors.black} />
              )}
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[900],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  menuOptionsContainer: {
    paddingHorizontal: 4,
  },
  keyboardView: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingVertical: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.neutral[400],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  messageRow: {
    width: '100%',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  dateSeparator: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSeparatorText: {
    color: Colors.neutral[500],
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
  },
  messageRowNewSender: {
    marginTop: 16,
  },
  messageRowFromThem: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.neutral[700],
  },
  messageRowFromMe: {
    alignItems: 'flex-end',
    paddingRight: 12,
    borderRightWidth: 2,
    borderRightColor: Colors.brand.teal,
  },
  messageText: {
    color: Colors.neutral[50],
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
  },
  messageTextFromMe: {
    textAlign: 'right',
  },
  messageTime: {
    color: Colors.neutral[500],
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
    marginTop: 2,
  },
  messageTimeFromMe: {
    color: Colors.neutral[600],
    textAlign: 'right',
  },
  embedContent: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  embedContentFromMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  embedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  embedAuthorRowCompact: {
    gap: 6,
    marginBottom: 0,
  },
  embedAuthorRowFromMe: {
    flexDirection: 'row-reverse',
  },
  embedAuthorHandle: {
    flex: 1,
    color: Colors.neutral[100],
    fontSize: 14,
    fontFamily: 'Figtree-SemiBold',
  },
  embedAuthorHandleCompact: {
    fontSize: 12,
  },
  embedAuthorHandleFromMe: {
    color: Colors.neutral[50],
    textAlign: 'right',
  },
  embedDescription: {
    color: Colors.neutral[400],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
  },
  embedDescriptionFromMe: {
    color: Colors.neutral[300],
    textAlign: 'right',
  },
  embedUnavailable: {
    opacity: 0.85,
  },
  embedUnavailableText: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
  },
  embedUnavailableTextFromMe: {
    color: Colors.neutral[600],
  },
  embedVideoOuter: {
    alignSelf: 'flex-start',
    width: '100%',
    alignItems: 'flex-start',
  },
  embedVideoOuterFromMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  embedVideoBlock: {},
  embedVideoAuthorOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomLeftRadius: CHAT_EMBED_VIDEO_RADIUS,
    borderBottomRightRadius: CHAT_EMBED_VIDEO_RADIUS,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    minHeight: 36,
  },
  embedVideoCard: {
    overflow: 'hidden',
    backgroundColor: Colors.neutral[900],
    position: 'relative',
  },
  embedVideoThumbnailWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  embedVideoThumbnail: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  embedVideoPlaceholder: {
    backgroundColor: Colors.neutral[900],
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[900],
    backgroundColor: Colors.black,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.transparent,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.transparent,
    color: Colors.neutral[50],
    minHeight: 42,
    maxHeight: 120,
    paddingVertical: 9,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
    fontFamily: 'Figtree-Regular',
    fontSize: 18,
    lineHeight: 24,
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.FULL,
    width: 42,
    height: 42,
    alignItems: 'center',
    marginLeft: 8,
    overflow: 'hidden',
  },
  sendButtonFallback: {
    backgroundColor: Colors.neutral[200],
  },
  sendButtonGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  sendButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    color: Colors.neutral[400],
    fontSize: 16,
    padding: 20,
  },
});
