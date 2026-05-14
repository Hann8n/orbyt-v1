import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
  Pressable,
  Linking,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleView } from '@/components/ui/Squircle';
import { KeyboardStickyView, KeyboardChatScrollView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';

import { FlashList } from '@shopify/flash-list';
import { Link, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { AppTrueSheet, SHEET_STYLES } from '@/utils/components/truesheet';
import CommentInputFooter from '@/components/features/comments/CommentInputFooter';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { Colors } from '@/theme';
import { Typography, FontFamily, TextStyles } from '@/utils/components/typography';
import { APP_CONSTANTS, BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import Icon, {
  BackArrowIcon,
  CopyCuteFilledIcon,
  DeleteCuteFilledIcon,
  FlameFillIcon,
  FireFillIcon,
  MoreFillIcon,
  ThoughtCuteFilledIcon,
} from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/UI';
import { OptionsButton } from '@/components/ui/OptionsButton';
import VerticalListSheet, { VerticalListButton } from '@/components/ui/VerticalListSheet';
import AuthorItem from '@/components/ui/AuthorItem';
import { itemSizeConfig, sharedItemStyles } from '@/components/ui/ItemStyles';
import { VerificationBadge, BotBadge } from '@/components/features/badging';
import { formatHandle } from '@/utils/formatting/handles';
import { useAvatarProfileRing } from '@/services/colors';
import { queryKeys } from '@/utils/query/queryKeys';
import { chatReactQueryOptions } from '@/utils/query/chatQueryOptions';
import { getActiveStreak } from '@/utils/chat/streak';
import { format, parseISO, isValid } from 'date-fns';
import { useProfileByDid, useBlockMutation } from '@/services/data/ProfileService';
import { useChatMessages, useSendMessage, useChatReactions } from '@/hooks/chat';
import { buildChatListData } from '@/utils/chat/buildChatListData';
import { ChatService } from '@/services/api/chat/ChatService';
import { ModerationService } from '@/services/moderation/ModerationService';
import { useUserStore } from '@/stores/userStore';
import type { MessageView, PostView, ProfileViewBasic } from '@/services/api/types';
import { openPostInBluesky } from '@/utils/links/bluesky';
import { buildFeedModalHref, buildFullHeightVideoHref } from '@/utils/navigation/feedModalRoute';
import { useFeedModalTabSegment } from '@/utils/navigation/feedModalTabSegment';
import { seedChatEmbedVideoFeed } from '@/utils/chat/seedChatEmbedVideoFeed';
import { getVideoView } from '@/utils/video/helpers';
import { hexToRGBA, isColorDark } from '@/utils/formatting/colors';
import type { Label } from '@atproto/api/dist/client/types/com/atproto/label/defs';
import { RichText } from '@atproto/api';
import type { Main as RichTextFacet } from '@atproto/api/dist/client/types/app/bsky/richtext/facet';
import { formatRelativeDate } from '@/components/ui/RelativeDate';
import EmojiPicker from 'react-native-emoji-chooser';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue } from 'react-native-reanimated';

const EMBED_VIDEO_GRADIENT_SHIM = require('@/assets/embed-video-gradient-shim.png');

type MessageItem = MessageView & { sender?: { did: string } };

type ReactionShape = { value: string; sender?: { did?: string }; createdAt?: string };

function groupReactions(
  reactions: ReactionShape[] | undefined,
  currentUserDid: string | undefined
): Array<{ value: string; count: number; includesMe: boolean }> {
  if (!reactions?.length) return [];
  const map = new Map<string, { count: number; includesMe: boolean }>();
  for (const r of reactions) {
    const v = r.value ?? '';
    if (!v) continue;
    const prev = map.get(v);
    const isMe = !!currentUserDid && r.sender?.did === currentUserDid;
    if (prev) {
      prev.count += 1;
      prev.includesMe = prev.includesMe || isMe;
    } else {
      map.set(v, { count: 1, includesMe: isMe });
    }
  }
  return Array.from(map.entries()).map(([value, { count, includesMe }]) => ({
    value,
    count,
    includesMe,
  }));
}

type ChatListItem =
  | { type: 'message'; message: MessageItem; showTime: boolean; groupedWithPrevious: boolean }
  | { type: 'date'; dateKey: string; label: string };

function ChatMessageRichText({
  text,
  facets,
  isFromMe,
  fromMeAccentColor,
  fromMeTextColor,
}: {
  text: string;
  facets?: RichTextFacet[] | null | undefined;
  isFromMe: boolean;
  fromMeAccentColor?: string;
  fromMeTextColor?: string;
}) {
  const router = useRouter();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();
  const currentTab = useFeedModalTabSegment();

  const rt = useMemo(
    () => new RichText({ text: text || '', facets: facets ?? undefined }),
    [text, facets]
  );
  const segments = useMemo(() => Array.from(rt.segments()), [rt]);

  const messageTextStyle = useMemo(
    () => [
      styles.messageText,
      isFromMe && styles.messageTextFromMe,
      isFromMe && fromMeTextColor && { color: fromMeTextColor },
    ],
    [isFromMe, fromMeTextColor]
  );

  return (
    <Text style={messageTextStyle}>
      {segments.map((segment, i) => {
        const segText = segment.text ?? '';
        const keyBase = `chat-rt-${i}`;

        if (segment.isLink() && segment.link?.uri) {
          return (
            <Text
              key={`${keyBase}-link`}
              style={
                isFromMe
                  ? [
                      styles.messageTextLinkFromMe,
                      { color: fromMeAccentColor ?? Colors.brand.teal },
                    ]
                  : styles.messageTextLink
              }
              onPress={() => {
                const raw = segment.link!.uri!.trim();
                if (!raw) return;
                const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                Linking.openURL(url).catch(() => {});
              }}
            >
              {segText}
            </Text>
          );
        }

        if (segment.isMention() && segment.mention?.did) {
          const symbol = segText[0] || '@';
          const handle = segText.slice(1);
          return (
            <Text key={`${keyBase}-mention`} onPress={() => goToProfile(segment.mention!.did!)}>
              {symbol && <Text style={styles.messageTextMedium}>{symbol}</Text>}
              {handle && <Text style={styles.messageTextSemiBold}>{handle}</Text>}
            </Text>
          );
        }

        if (segment.isTag() && segment.tag?.tag) {
          const symbol = segText[0] || '#';
          const tag = segText.slice(1);
          return (
            <Text
              key={`${keyBase}-tag`}
              onPress={() => {
                const clean = tag.replace(/^#/, '').trim();
                if (!clean) return;
                router.navigate(
                  buildFeedModalHref(
                    { feedOption: `hashtag:${clean}`, initialIndex: '0', initialPostUri: '' },
                    currentTab
                  )
                );
              }}
            >
              {symbol && <Text style={styles.messageTextMedium}>{symbol}</Text>}
              {tag && <Text style={styles.messageTextSemiBold}>{tag}</Text>}
            </Text>
          );
        }

        return <Text key={`${keyBase}-plain`}>{segText}</Text>;
      })}
    </Text>
  );
}

function formatMessageTime(sentAt?: string): string {
  if (!sentAt) return '';
  const date = parseISO(sentAt);
  return isValid(date) ? format(date, 'h:mm a') : '';
}

function getMessagePreview(msg: MessageItem): string {
  if (msg.text != null && msg.text !== '') return msg.text;
  return i18n.t('chat.messageDeleted');
}

const EMBED_RECORD_VIEW = 'app.bsky.embed.record#view';
const EMBED_RECORD = 'app.bsky.embed.record';
const RECORD_VIEW_RECORD = 'app.bsky.embed.record#viewRecord';
const RECORD_VIEW_NOT_FOUND = 'app.bsky.embed.record#viewNotFound';
const RECORD_VIEW_BLOCKED = 'app.bsky.embed.record#viewBlocked';
const RECORD_VIEW_DETACHED = 'app.bsky.embed.record#viewDetached';

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

const CHAT_EMBED_VIDEO_WIDTH = 160;
const CHAT_EMBED_VIDEO_ASPECT = 9 / 16;
const CHAT_EMBED_VIDEO_RADIUS = BORDER_RADIUS.SMALL;
/** Bottom corner toward screen edge — text/caption bubbles only */
const CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS = BORDER_RADIUS.LARGE;

type EmbedImage = {
  thumb?: string;
  fullsize?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
};

function getVideoViewFromRecordEmbeds(
  embeds: EmbedRecordShape['embeds']
): { thumbnail: string | null; playlist?: string } | null {
  if (!embeds?.length) return null;
  for (let i = 0; i < embeds.length; i++) {
    const view = getVideoView(embeds[i] as PostView['embed']);
    if (view) return { thumbnail: view.thumbnail || null, playlist: view.playlist };
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

function getImagesFromRecordEmbeds(embeds: EmbedRecordShape['embeds']): EmbedImage[] {
  const result: EmbedImage[] = [];
  if (!embeds?.length) return result;
  for (let i = 0; i < embeds.length; i++) {
    const e = embeds[i] as {
      $type?: string;
      images?: EmbedImage[];
      media?: { $type?: string; images?: EmbedImage[] };
    };
    if (e?.$type === 'app.bsky.embed.images' || e?.$type === 'app.bsky.embed.images#view') {
      if (Array.isArray(e.images)) {
        for (const img of e.images) {
          if (img && (img.thumb || img.fullsize))
            result.push({
              thumb: img.thumb,
              fullsize: img.fullsize,
              alt: img.alt,
              aspectRatio: img.aspectRatio,
            });
        }
      }
    } else if (e?.$type === 'app.bsky.embed.recordWithMedia#view' && e.media) {
      const media = e.media as { $type?: string; images?: EmbedImage[] };
      if (
        (media.$type === 'app.bsky.embed.images' || media.$type === 'app.bsky.embed.images#view') &&
        Array.isArray(media.images)
      ) {
        for (const img of media.images) {
          if (img && (img.thumb || img.fullsize))
            result.push({
              thumb: img.thumb,
              fullsize: img.fullsize,
              alt: img.alt,
              aspectRatio: img.aspectRatio,
            });
        }
      }
    }
  }
  return result;
}

function isEmbedRecordView(embed: MessageView['embed'] | null | undefined): boolean {
  if (!embed || typeof embed !== 'object') return false;
  const t = (embed as { $type?: string }).$type;
  const isRecordEmbed = t === EMBED_RECORD_VIEW || t === EMBED_RECORD;
  return isRecordEmbed && 'record' in embed && (embed as { record?: unknown }).record != null;
}

function EmbedAuthor({
  author,
  isFromMe,
  compact,
  authorAlwaysOnRight,
}: {
  author: EmbedRecordShape['author'];
  isFromMe: boolean;
  compact?: boolean;
  /** When true, author handle is always on the right of the avatar (e.g. video overlay). */
  authorAlwaysOnRight?: boolean;
}) {
  if (!author) return null;
  const handle = author.handle?.trim() || author.did || '';
  if (!handle) return null;
  const textColor = isFromMe && !authorAlwaysOnRight ? Colors.neutral[50] : Colors.neutral[100];
  return (
    <View style={[styles.embedAuthorRow, compact && styles.embedAuthorRowCompact]}>
      <AuthorItem
        handle={handle}
        did={author.did ?? undefined}
        displayName={author.displayName}
        avatar={author.avatar}
        size={compact ? 'xsmall' : 'small'}
        showArrow={false}
        nonInteractive
        reverseRow={isFromMe && !authorAlwaysOnRight}
        textColor={textColor}
        backgroundColor={Colors.transparent}
        style={[
          styles.embedAuthorItem,
          isFromMe && !authorAlwaysOnRight && styles.embedAuthorItemFromMe,
        ]}
      />
    </View>
  );
}

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

function EmbedMetrics({
  replyCount,
  repostCount,
  likeCount,
  isFromMe,
}: {
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  isFromMe: boolean;
}) {
  const hasMetrics = (replyCount ?? 0) > 0 || (repostCount ?? 0) > 0 || (likeCount ?? 0) > 0;
  if (!hasMetrics) return null;

  const textColor = isFromMe ? Colors.neutral[300] : Colors.neutral[400];

  return (
    <View style={[styles.embedMetricsRow, isFromMe && styles.embedMetricsRowFromMe]}>
      {(replyCount ?? 0) > 0 && (
        <View style={styles.embedMetricItem}>
          <Icon name="chat" size={12} color={textColor} />
          <Text style={[styles.embedMetricText, { color: textColor }]}>{replyCount}</Text>
        </View>
      )}
      {(repostCount ?? 0) > 0 && (
        <View style={styles.embedMetricItem}>
          <Icon name="share_forward" size={12} color={textColor} />
          <Text style={[styles.embedMetricText, { color: textColor }]}>{repostCount}</Text>
        </View>
      )}
      {(likeCount ?? 0) > 0 && (
        <View style={styles.embedMetricItem}>
          <Icon name="heart" size={12} color={textColor} />
          <Text style={[styles.embedMetricText, { color: textColor }]}>{likeCount}</Text>
        </View>
      )}
    </View>
  );
}

/** Face-pile style overlap (px); smaller = more fanned out */
const REACTION_OVERLAP = 5;
const REACTION_CHIP_SIZE = 22;
/** Larger chips in picker sheet header and overlay */
const REACTION_SHEET_CHIP_SIZE = 40;

const REACTION_CHIP_STYLE = {
  borderWidth: 0,
  borderColorDefault: Colors.neutral[700],
  borderColorMine: Colors.neutral[600],
  bgDefault: Colors.neutral[800],
  bgMine: Colors.neutral[700],
  countColor: Colors.neutral[500],
  countColorMine: Colors.neutral[50],
  countColorOnColoredBg: Colors.black,
} as const;

function MessageReactions({
  reactions,
  currentUserDid,
  isFromMe,
  sentAccentColor,
  otherAccentColor,
}: {
  reactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  isFromMe: boolean;
  sentAccentColor?: string;
  otherAccentColor?: string;
}) {
  const grouped = groupReactions(reactions, currentUserDid);
  if (grouped.length === 0) return null;
  return (
    <View style={[styles.reactionsRow, isFromMe && styles.reactionsRowFromMe]}>
      {grouped.map(({ value, count, includesMe }, index) => {
        const isPill = count > 1;
        const bg = includesMe
          ? (sentAccentColor ?? Colors.brand.teal)
          : (otherAccentColor ?? REACTION_CHIP_STYLE.bgDefault);
        const isColoredBg = bg !== Colors.neutral[700] && bg !== Colors.neutral[800];
        const chipStyle = getReactionChipStyle({ isPill, index, bg });
        return (
          <View key={value} style={[styles.reactionChip, chipStyle]}>
            <Text style={styles.reactionEmoji}>{value}</Text>
            {count > 1 && (
              <Text
                style={[
                  styles.reactionCount,
                  isColoredBg ? styles.reactionCountOnAccent : undefined,
                ]}
              >
                {count}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const REACTION_PICKER_SHEET_NAME = 'chat-reaction-picker';
const CHAT_MESSAGE_ACTIONS_SHEET_NAME = 'chat-message-actions';
const CHAT_HEADER_MENU_SHEET_NAME = 'chat-header-menu';

/** Nested content (e.g. embeds) calls this to open the same reaction menu as long-press on the row. */
const ReactionPickerRowContext = createContext<(() => void) | null>(null);

type ReactionPickerState = { messageId: string; showFullSheet: true } | null;

/** Full emoji sheet; opened from the message actions sheet (“more emoji”) or reaction UI. */
function useReactionPicker() {
  const [state, setState] = useState<ReactionPickerState>(null);

  const openFullPicker = useCallback((messageId: string) => {
    setState({ messageId, showFullSheet: true });
  }, []);

  const closePicker = useCallback(() => {
    setState(null);
  }, []);

  return {
    state,
    openFullPicker,
    closePicker,
    isSheetVisible: state != null,
  };
}

function useMessageActionsSheet() {
  const [messageId, setMessageId] = useState<string | null>(null);
  const open = useCallback((id: string) => setMessageId(id), []);
  const close = useCallback(() => setMessageId(null), []);
  return { messageId, open, close, visible: messageId != null };
}

/** Segments in visual order: before embed → embed → caption → footer (meta). */
type ChatMessageRowSegments = {
  beforeEmbed: ReactNode | null;
  embed: ReactNode | null;
  caption: ReactNode | null;
  footer: ReactNode;
};

function ChatMessageRow({
  messageId,
  onOpenMessageActions,
  pressableStyle,
  segments,
}: {
  messageId: string;
  onOpenMessageActions: (messageId: string) => void;
  pressableStyle: StyleProp<ViewStyle>;
  segments: ChatMessageRowSegments;
}) {
  const openMessageActionsMenu = useCallback(() => {
    onOpenMessageActions(messageId);
  }, [messageId, onOpenMessageActions]);

  const { beforeEmbed, embed, caption, footer } = segments;

  const rowBody = (
    <>
      {beforeEmbed != null ? (
        <NativePressable
          delayLongPress={400}
          onLongPress={openMessageActionsMenu}
          style={styles.chatMessageLongPressZone}
        >
          {beforeEmbed}
        </NativePressable>
      ) : null}
      {beforeEmbed != null && embed ? <View style={styles.embedSpacing}>{embed}</View> : embed}
      {caption != null ? (
        <NativePressable
          delayLongPress={400}
          onLongPress={openMessageActionsMenu}
          style={styles.chatMessageLongPressZone}
        >
          {caption}
        </NativePressable>
      ) : null}
      <NativePressable
        delayLongPress={400}
        onLongPress={openMessageActionsMenu}
        style={styles.chatMessageLongPressZone}
      >
        {footer}
      </NativePressable>
    </>
  );

  return (
    <ReactionPickerRowContext.Provider value={openMessageActionsMenu}>
      <Animated.View style={styles.chatMessageRowAnimated}>
        <View style={pressableStyle}>{rowBody}</View>
      </Animated.View>
    </ReactionPickerRowContext.Provider>
  );
}

const EMOJI_PICKER_THEME = {
  light: {
    toolbar: {
      icon: { defaultColor: Colors.neutral[500], activeColor: Colors.brand.teal },
      container: {
        height: 0,
        overflow: 'hidden' as const,
        paddingVertical: 0,
        paddingHorizontal: 0,
      },
    },
    searchbar: {
      container: {
        backgroundColor: Colors.neutral[100],
        paddingHorizontal: 12,
        paddingVertical: 8,
      },
      textInput: {
        color: Colors.neutral[900],
        backgroundColor: Colors.neutral[200],
        fontFamily: FontFamily.regular,
        fontSize: Typography.sizes.subtitle,
        height: 40,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.MEDIUM,
      },
      placeholderColor: Colors.neutral[500],
    },
    flatList: {
      container: {
        backgroundColor: Colors.neutral[50],
        paddingBottom: 16,
      },
      section: {
        header: {
          color: Colors.neutral[600],
          fontFamily: FontFamily.semibold,
          fontSize: Typography.sizes.caption,
        },
      },
    },
  },
  dark: {
    toolbar: {
      icon: { defaultColor: Colors.neutral[500], activeColor: Colors.brand.teal },
      container: {
        height: 0,
        overflow: 'hidden' as const,
        paddingVertical: 0,
        paddingHorizontal: 0,
      },
    },
    searchbar: {
      container: {
        backgroundColor: Colors.neutral[900],
        paddingHorizontal: 12,
        paddingVertical: 8,
      },
      textInput: {
        color: Colors.neutral[50],
        backgroundColor: Colors.neutral[800],
        fontFamily: FontFamily.regular,
        fontSize: Typography.sizes.subtitle,
        height: 40,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: BORDER_RADIUS.MEDIUM,
      },
      placeholderColor: Colors.neutral[500],
    },
    flatList: {
      container: {
        backgroundColor: Colors.neutral[900],
        paddingBottom: 16,
      },
      section: {
        header: {
          color: Colors.neutral[400],
          fontFamily: FontFamily.semibold,
          fontSize: Typography.sizes.caption,
        },
      },
    },
  },
};

function ReactionPickerSheet({
  visible,
  onDismiss,
  onSelect,
  currentReactions,
  currentUserDid,
  sentAccentColor,
  otherAccentColor,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (value: string) => void;
  currentReactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  sentAccentColor?: string;
  otherAccentColor?: string;
}) {
  const { t } = useTranslation();
  const sheetRef = useRef<TrueSheet>(null);
  const grouped = useMemo(
    () => groupReactions(currentReactions, currentUserDid),
    [currentReactions, currentUserDid]
  );
  const handleSelect = useCallback(
    async (emoji: string) => {
      onSelect(emoji);
      try {
        await sheetRef.current?.dismiss();
      } catch {}
      onDismiss();
    },
    [onSelect, onDismiss]
  );

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (visible) {
      sheet.present().catch(() => {});
    } else {
      sheet.dismiss().catch(() => {});
    }
  }, [visible]);

  const maxHeight = 560;

  return (
    <AppTrueSheet
      ref={sheetRef}
      name={REACTION_PICKER_SHEET_NAME}
      variant="reactionPicker"
      maxContentHeight={maxHeight}
      onDidDismiss={onDismiss}
      scrollable
      header={
        <View style={styles.reactionSheetHeader}>
          {grouped.length > 0 ? (
            <View style={styles.reactionSheetActiveChips}>
              {grouped.map(({ value, count, includesMe }) => {
                const isPill = count > 1;
                const bg = includesMe
                  ? (sentAccentColor ?? Colors.brand.teal)
                  : (otherAccentColor ?? REACTION_CHIP_STYLE.bgDefault);
                const isColoredBg = bg !== Colors.neutral[700] && bg !== Colors.neutral[800];
                return (
                  <NativePressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.reactWith', { emoji: value })}
                    onPress={() => handleSelect(value)}
                    style={({ pressed }) => [
                      styles.reactionSheetActiveChip,
                      {
                        width: isPill ? undefined : REACTION_SHEET_CHIP_SIZE,
                        minWidth: REACTION_SHEET_CHIP_SIZE,
                        height: REACTION_SHEET_CHIP_SIZE,
                        borderRadius: REACTION_SHEET_CHIP_SIZE / 2,
                        paddingHorizontal: isPill ? 10 : 0,
                        backgroundColor: bg,
                        borderColor: includesMe
                          ? (sentAccentColor ?? REACTION_CHIP_STYLE.borderColorMine)
                          : REACTION_CHIP_STYLE.borderColorDefault,
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={styles.reactionSheetActiveEmoji}>{value}</Text>
                    {count > 1 && (
                      <Text
                        style={[
                          styles.reactionSheetActiveCount,
                          isColoredBg
                            ? styles.reactionSheetActiveCountOnColoredBg
                            : includesMe && styles.reactionSheetActiveCountHighlight,
                        ]}
                      >
                        {count}
                      </Text>
                    )}
                  </NativePressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.reactionSheetActiveEmpty}>{t('chat.noReactionsYet')}</Text>
          )}
        </View>
      }
    >
      <View style={styles.reactionSheetContent}>
        <EmojiPicker
          onSelect={handleSelect}
          mode="dark"
          lang="en"
          columnCount={6}
          theme={EMOJI_PICKER_THEME}
          searchBarProps={{
            placeholder: t('chat.searchEmoji'),
            placeholderTextColor: Colors.neutral[500],
            style: {
              fontFamily: FontFamily.regular,
              fontSize: Typography.sizes.subtitle,
              color: Colors.neutral[50],
              backgroundColor: Colors.neutral[800],
              height: 40,
              paddingHorizontal: 12,
              paddingVertical: 0,
              textAlignVertical: 'center',
              borderRadius: BORDER_RADIUS.MEDIUM,
            },
          }}
        />
      </View>
    </AppTrueSheet>
  );
}

function MessageActionsSheet({
  messageId,
  visible,
  onDismiss,
  canCopy,
  onRequestFullPicker,
  onCopy,
  onDelete,
}: {
  messageId: string | null;
  visible: boolean;
  onDismiss: () => void;
  canCopy: boolean;
  onRequestFullPicker: (messageId: string) => void;
  onCopy: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!visible || !messageId) {
      TrueSheet.dismiss(CHAT_MESSAGE_ACTIONS_SHEET_NAME).catch(() => {});
      return;
    }
    TrueSheet.present(CHAT_MESSAGE_ACTIONS_SHEET_NAME).catch(() => {});
  }, [visible, messageId]);

  const dismissAfter = useCallback(
    async (fn: () => void) => {
      fn();
      try {
        await TrueSheet.dismiss(CHAT_MESSAGE_ACTIONS_SHEET_NAME);
      } catch {}
      onDismiss();
    },
    [onDismiss]
  );

  const handleCopyPress = useCallback(() => {
    if (!messageId || !canCopy) return;
    void dismissAfter(() => onCopy(messageId));
  }, [canCopy, dismissAfter, messageId, onCopy]);

  const handleDeletePress = useCallback(() => {
    if (!messageId) return;
    void dismissAfter(() => onDelete(messageId));
  }, [dismissAfter, messageId, onDelete]);

  const handleReactPress = useCallback(() => {
    if (!messageId) return;
    onRequestFullPicker(messageId);
  }, [messageId, onRequestFullPicker]);

  return (
    <VerticalListSheet name={CHAT_MESSAGE_ACTIONS_SHEET_NAME} onDismiss={onDismiss}>
      {messageId ? (
        <View accessibilityViewIsModal>
          <VerticalListButton
            label={t('chat.react')}
            onPress={handleReactPress}
            leftContent={
              <View style={styles.messageActionsOptionLeading}>
                <ThoughtCuteFilledIcon size={22} color={Colors.neutral[50]} />
                <Text style={styles.messageActionsOptionTitle}>{t('chat.react')}</Text>
              </View>
            }
            style={[styles.messageActionsListButton, styles.messageActionsCopySurface]}
          />
          <VerticalListButton
            label={t('common.copy')}
            onPress={() => {
              void handleCopyPress();
            }}
            disabled={!canCopy}
            leftContent={
              <View style={styles.messageActionsOptionLeading}>
                <CopyCuteFilledIcon
                  size={22}
                  color={canCopy ? Colors.neutral[50] : Colors.neutral[600]}
                />
                <Text
                  style={[
                    styles.messageActionsOptionTitle,
                    !canCopy && styles.messageActionsOptionTitleMuted,
                  ]}
                >
                  {t('common.copy')}
                </Text>
              </View>
            }
            style={[
              styles.messageActionsListButton,
              canCopy ? styles.messageActionsCopySurface : styles.messageActionsCopySurfaceDisabled,
            ]}
          />
          <VerticalListButton
            label={t('chat.deleteMessageForMe')}
            danger
            onPress={() => {
              void handleDeletePress();
            }}
            leftContent={
              <View style={styles.messageActionsOptionLeading}>
                <DeleteCuteFilledIcon size={22} color={Colors.coral[300]} />
                <Text
                  style={[styles.messageActionsOptionTitle, styles.messageActionsOptionTitleDanger]}
                >
                  {t('chat.deleteMessageForMe')}
                </Text>
              </View>
            }
            style={styles.messageActionsListButton}
          />
        </View>
      ) : null}
    </VerticalListSheet>
  );
}

function ChatEmbeddedPost({
  embed,
  isFromMe,
  onLongPress,
  delayLongPress = 400,
}: {
  embed: NonNullable<MessageView['embed']>;
  isFromMe: boolean;
  onLongPress?: (e?: { nativeEvent: { pageX: number; pageY: number } }) => void;
  delayLongPress?: number;
}) {
  const openFromRow = useContext(ReactionPickerRowContext);
  const handleLongPress = openFromRow ?? onLongPress;
  const feedModalTab = useFeedModalTabSegment();
  const record = (embed as { record?: EmbedRecordShape }).record;
  if (!record || typeof record !== 'object') return null;

  const type = record.$type;

  if (type === RECORD_VIEW_NOT_FOUND || record.notFound === true) {
    return (
      <SquircleView
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post not found
        </Text>
      </SquircleView>
    );
  }
  if (type === RECORD_VIEW_BLOCKED || record.blocked === true) {
    return (
      <SquircleView
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post hidden
        </Text>
      </SquircleView>
    );
  }
  if (type === RECORD_VIEW_DETACHED || record.detached === true) {
    return (
      <SquircleView
        style={[
          styles.embedContent,
          isFromMe && styles.embedContentFromMe,
          styles.embedUnavailable,
        ]}
      >
        <Text style={[styles.embedUnavailableText, isFromMe && styles.embedUnavailableTextFromMe]}>
          Post unavailable
        </Text>
      </SquircleView>
    );
  }

  if (type !== RECORD_VIEW_RECORD || !record.uri || !record.author) return null;

  const author = record.author;
  const text = record.value?.text ?? '';
  const videoMeta = getVideoViewFromRecordEmbeds(record.embeds);
  const isVideo = !!videoMeta;

  if (isVideo) {
    const thumbnailUrl = videoMeta!.thumbnail;
    const videoHeight = CHAT_EMBED_VIDEO_WIDTH / CHAT_EMBED_VIDEO_ASPECT;
    const thumbnailStyle = {
      width: CHAT_EMBED_VIDEO_WIDTH,
      height: videoHeight,
    };
    const embedVideoCardLayoutStyle = {
      width: CHAT_EMBED_VIDEO_WIDTH,
      height: videoHeight,
      borderRadius: CHAT_EMBED_VIDEO_RADIUS,
      overflow: 'hidden' as const,
    };
    const videoThumbnailBody = (
      <>
        {thumbnailUrl ? (
          <View style={[styles.embedVideoThumbnailWrap, thumbnailStyle]}>
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
            <Icon name="video_camera_2" size={24} color={Colors.neutral[500]} />
          </View>
        )}
        <View style={styles.embedVideoAuthorOverlay} pointerEvents="none">
          <Image
            source={EMBED_VIDEO_GRADIENT_SHIM}
            style={[StyleSheet.absoluteFill, styles.embedVideoGradientShim]}
            contentFit="cover"
          />
          <EmbedAuthor author={author} isFromMe={isFromMe} compact authorAlwaysOnRight />
        </View>
      </>
    );
    const fullHeightVideoHref = buildFullHeightVideoHref({ postUri: record.uri }, feedModalTab);

    return (
      <View style={[styles.embedVideoOuter, isFromMe && styles.embedVideoOuterFromMe]}>
        <View style={[styles.embedVideoBlock, { width: CHAT_EMBED_VIDEO_WIDTH }]}>
          <SquircleView style={[styles.embedVideoCard, embedVideoCardLayoutStyle]}>
            <Link href={fullHeightVideoHref} asChild>
              <Pressable
                onPress={() => {
                  seedChatEmbedVideoFeed(record);
                }}
                onLongPress={handleLongPress}
                delayLongPress={delayLongPress}
                style={styles.embedVideoPressable}
                android_ripple={{ color: Colors.neutral[700] }}
              >
                {Platform.OS === 'ios' ? (
                  <Link.AppleZoom>
                    <View collapsable={false} style={styles.embedVideoAppleZoomInner}>
                      {videoThumbnailBody}
                    </View>
                  </Link.AppleZoom>
                ) : (
                  videoThumbnailBody
                )}
              </Pressable>
            </Link>
          </SquircleView>
        </View>
      </View>
    );
  }

  // Non-video (text/image/quote): open link in Bluesky app
  const onPressPost = () => {
    const uri = record.uri ?? '';
    if (!uri) return;
    openPostInBluesky(uri);
  };

  const embedImages = getImagesFromRecordEmbeds(record.embeds);
  const hasImages = embedImages.length > 0;

  const getClampedAspectRatio = (ar: number) => Math.max(0.5, Math.min(2.0, ar));
  const CHAT_EMBED_IMAGE_SIZE = 96;
  const CHAT_EMBED_IMAGE_SINGLE_MAX = 240;

  const engagementMetrics = {
    replyCount: record.replyCount,
    repostCount: record.repostCount,
    likeCount: record.likeCount,
  };

  const timestamp = record.indexedAt ? formatRelativeDate(record.indexedAt) : null;

  return (
    <SquircleView style={[styles.embedContent, isFromMe && styles.embedContentFromMe]}>
      <NativePressable
        onPress={onPressPost}
        onLongPress={handleLongPress}
        delayLongPress={delayLongPress}
        style={styles.embedContentPressable}
        android_ripple={{ color: Colors.neutral[700] }}
      >
        {hasImages && (
          <View
            style={[styles.embedImagesContainer, isFromMe && styles.embedImagesContainerFromMe]}
          >
            {embedImages.slice(0, 4).map((img, idx) => {
              const total = Math.min(embedImages.length, 4);
              const aspectRatio = img.aspectRatio
                ? getClampedAspectRatio(img.aspectRatio.width / img.aspectRatio.height)
                : 1;
              const isSingle = total === 1;
              const w = isSingle
                ? aspectRatio >= 1
                  ? CHAT_EMBED_IMAGE_SINGLE_MAX
                  : CHAT_EMBED_IMAGE_SINGLE_MAX * aspectRatio
                : CHAT_EMBED_IMAGE_SIZE;
              const h = isSingle
                ? aspectRatio >= 1
                  ? CHAT_EMBED_IMAGE_SINGLE_MAX / aspectRatio
                  : CHAT_EMBED_IMAGE_SINGLE_MAX
                : CHAT_EMBED_IMAGE_SIZE;
              return (
                <SquircleView
                  key={img.thumb || img.fullsize || idx}
                  style={[styles.embedImageWrap, { width: w, height: h }]}
                >
                  <Image
                    source={{ uri: img.thumb || img.fullsize }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessible
                    accessibilityLabel={img.alt || i18n.t('chat.embedImage')}
                  />
                </SquircleView>
              );
            })}
          </View>
        )}
        <EmbedAuthor author={author} isFromMe={isFromMe} />
        <EmbedDescription text={text} isFromMe={isFromMe} marginTop={hasImages ? 8 : 0} />
        <EmbedMetrics {...engagementMetrics} isFromMe={isFromMe} />
        {timestamp && (
          <Text style={[styles.embedTimestamp, isFromMe && { textAlign: 'right' }]}>
            {timestamp}
          </Text>
        )}
      </NativePressable>
    </SquircleView>
  );
}

const getReactionChipStyle = ({
  isPill,
  index,
  bg,
}: {
  isPill: boolean;
  index: number;
  bg: string;
}) => ({
  width: isPill ? undefined : REACTION_CHIP_SIZE,
  minWidth: REACTION_CHIP_SIZE,
  height: REACTION_CHIP_SIZE,
  paddingHorizontal: isPill ? 6 : 0,
  borderRadius: REACTION_CHIP_SIZE / 2,
  marginLeft: index === 0 ? 0 : -REACTION_OVERLAP,
  backgroundColor: bg,
  borderWidth: 1,
  borderColor: Colors.black,
});
const isDid = (id: string) => typeof id === 'string' && id.startsWith('did:');

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; did?: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const rawId = params.id ?? '';
  const otherDid = params.did ?? rawId;
  const [inputText, setInputText] = useState('');
  const [inputSelection, setInputSelection] = useState({ start: 0, end: 0 });
  const composerHeight = useSharedValue(0);
  const currentUserDid = useUserStore(s => s.currentUser?.did);
  const currentUserAvatar = useUserStore(s => s.currentUser?.avatar ?? null);

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView
        {...props}
        inverted
        extraContentPadding={composerHeight}
        keyboardLiftBehavior="whenAtEnd"
      />
    ),
    []
  );

  const openByDid = isDid(rawId);
  const members = useMemo(
    () => (currentUserDid && openByDid ? [currentUserDid, rawId].sort() : null),
    [currentUserDid, openByDid, rawId]
  );

  const { data: convoByMembers, isFetched: convoByMembersFetched } = useQuery({
    queryKey: [
      ...queryKeys.chat.conversations.all,
      'byMembers',
      members?.[0] ?? '',
      members?.[1] ?? '',
    ] as const,
    queryFn: () => ChatService.getConvoForMembers(members!),
    enabled: !!members && members.length === 2,
    ...chatReactQueryOptions,
  });

  const { data: convoById, isFetched: convoByIdFetched } = useQuery({
    queryKey: queryKeys.chat.conversations.detail(rawId),
    queryFn: () => ChatService.getConvo(rawId),
    enabled: !!rawId && !openByDid,
    ...chatReactQueryOptions,
  });

  const convo = openByDid ? convoByMembers : convoById;
  const convoFetched = openByDid ? convoByMembersFetched : convoByIdFetched;
  const convoId = openByDid ? (convo?.id ?? '') : rawId;

  const otherUserBasicProfile = useMemo(() => {
    if (!convo || !otherDid) return null;
    const members = (convo as unknown as { members?: ProfileViewBasic[] })?.members;
    if (!members) return null;
    return members.find((m: ProfileViewBasic) => m.did === otherDid) || null;
  }, [convo, otherDid]);

  const {
    data: otherUserFullProfile,
    isError: profileIsError,
    isFetched: profileFetched,
  } = useProfileByDid(otherDid || null);

  const profile = useMemo(() => {
    if (!otherUserBasicProfile) return otherUserFullProfile;
    if (!otherUserFullProfile) return otherUserBasicProfile;
    return { ...otherUserBasicProfile, ...otherUserFullProfile };
  }, [otherUserBasicProfile, otherUserFullProfile]);

  const isOtherUserUnavailable =
    !!otherDid &&
    ((profileFetched && profileIsError) ||
      (!!profile?.handle && profile.handle.endsWith('.invalid')));
  const otherRingProps = useAvatarProfileRing(otherDid || null);
  const currentUserRingProps = useAvatarProfileRing(currentUserDid ?? null);
  const sentMessageAccentColor = currentUserRingProps.ringColor || Colors.brand.teal;
  /** Outgoing bubble surface + rim: use profile colors directly */
  const sentBubbleBlendedStyle = useMemo(
    () => ({
      backgroundColor: currentUserRingProps.profileColors?.backgroundColor || Colors.neutral[900],
      borderColor: currentUserRingProps.profileColors?.backgroundColor || Colors.neutral[900],
    }),
    [currentUserRingProps.profileColors]
  );
  /** Text color based on background luminance: white for dark backgrounds, black for light backgrounds */
  const sentMessageTextColor = useMemo(() => {
    const bgColor = currentUserRingProps.profileColors?.backgroundColor || Colors.neutral[900];
    return isColorDark(bgColor) ? Colors.neutral[50] : Colors.neutral[900];
  }, [currentUserRingProps.profileColors]);
  const otherUserAccentColor = otherRingProps.ringColor || Colors.neutral[700];
  const headerAvatarSize = itemSizeConfig.medium.avatarSize;
  const headerBadgeSize = itemSizeConfig.large.badgeTextSize;
  const reactionPicker = useReactionPicker();
  const {
    messageId: messageActionsTargetId,
    open: openMessageActionsSheet,
    close: closeMessageActionsSheet,
    visible: messageActionsSheetVisible,
  } = useMessageActionsSheet();
  const isInConvo = !!convo;
  const hasLeftConvo = convoFetched && convo === null && !openByDid;
  const noConvoYet = openByDid && convoFetched && !convo;
  const isConvoMuted = (convo as { muted?: boolean } | null)?.muted ?? false;
  const lastMsgSenderDid =
    convo?.lastMessage && typeof convo.lastMessage === 'object' && 'sender' in convo.lastMessage
      ? (convo.lastMessage as { sender?: { did?: string } }).sender?.did
      : undefined;
  const needsAccept =
    (convo as { status?: string } | null)?.status === 'request' &&
    lastMsgSenderDid != null &&
    lastMsgSenderDid !== currentUserDid;
  const blockMutation = useBlockMutation();
  const isBlocked = !!(
    (profile as ProfileViewBasic)?.viewer?.blocking ||
    (profile as ProfileViewBasic)?.viewer?.blockingByList
  );
  const isBlockedByList = !!(profile as ProfileViewBasic)?.viewer?.blockingByList;

  const {
    messages,
    isLoading: messagesLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useChatMessages(isInConvo ? convoId : undefined);

  const sendMessageMutation = useSendMessage(isInConvo ? convoId : undefined);

  const reactionMutation = useChatReactions(
    isInConvo ? convoId : undefined,
    currentUserDid ?? undefined,
    {
      onError: () => {
        reactionPicker.closePicker();
        closeMessageActionsSheet();
      },
    }
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        inputRef.current?.blur();
      };
    }, [])
  );

  const handleReactionSelect = useCallback(
    (messageId: string, value: string) => {
      const raw = messages ?? [];
      const msg = raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined;
      const reactions = msg?.reactions ?? [];
      const hasReaction = reactions.some(
        (r: ReactionShape) => r.value === value && r.sender?.did === currentUserDid
      );
      reactionMutation.mutate({ messageId, value, add: !hasReaction });
    },
    [messages, currentUserDid, reactionMutation]
  );

  const handleCopyMessage = useCallback(
    async (messageId: string) => {
      const raw = messages ?? [];
      const msg = raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined;
      const text = msg?.text?.trim() ?? '';
      if (!text) return;
      try {
        await Clipboard.setStringAsync(text);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    },
    [messages]
  );

  const deleteMessageForSelfMutation = useMutation({
    mutationFn: (messageId: string) => ChatService.deleteMessageForSelf(convoId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.infinite(convoId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
    },
    onError: () => {
      Alert.alert(t('common.error'), t('errors.failedTryAgain'));
    },
  });

  const handleDeleteMessageForSelf = useCallback(
    (messageId: string) => {
      Alert.alert(t('chat.deleteMessageForMe'), t('chat.deleteMessageConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteMessageForSelfMutation.mutate(messageId),
        },
      ]);
    },
    [deleteMessageForSelfMutation, t]
  );

  const actionsTargetMessage = useMemo(() => {
    if (!messageActionsTargetId) return null;
    const raw = messages ?? [];
    return (
      (raw.find((m: { id?: string }) => m.id === messageActionsTargetId) as
        | MessageItem
        | undefined) ?? null
    );
  }, [messageActionsTargetId, messages]);

  const handleOpenMessageActions = useCallback(
    (messageId: string) => {
      openMessageActionsSheet(messageId);
    },
    [openMessageActionsSheet]
  );

  const handleRequestFullPickerFromActions = useCallback(
    (messageId: string) => {
      closeMessageActionsSheet();
      requestIdleCallback(
        () => {
          reactionPicker.openFullPicker(messageId);
        },
        { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
      );
    },
    [closeMessageActionsSheet, reactionPicker.openFullPicker]
  );

  const latestMessageId = useMemo(() => {
    const rawMessages = (messages ?? []) as MessageItem[];
    return rawMessages[0]?.id;
  }, [messages]);

  const readSyncRef = useRef<{ convoId: string; latestMessageId: string | undefined }>({
    convoId: '',
    latestMessageId: undefined,
  });
  const updateReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const UPDATE_READ_DEBOUNCE_MS = 1500;

  useEffect(() => {
    if (!convoId || convo === null) return;
    readSyncRef.current = { convoId, latestMessageId };

    if (updateReadTimeoutRef.current != null) {
      clearTimeout(updateReadTimeoutRef.current);
      updateReadTimeoutRef.current = null;
    }

    const markRead = (cid: string, mid: string | undefined) => {
      ChatService.updateRead(cid, mid)
        .then(updatedConvo => {
          queryClient.setQueryData(queryKeys.chat.conversations.detail(cid), updatedConvo);
          queryClient.invalidateQueries({ queryKey: queryKeys.unread.summary() });
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
        })
        .catch(() => {});
    };

    updateReadTimeoutRef.current = setTimeout(() => {
      updateReadTimeoutRef.current = null;
      markRead(convoId, latestMessageId);
    }, UPDATE_READ_DEBOUNCE_MS);

    return () => {
      if (updateReadTimeoutRef.current != null) {
        clearTimeout(updateReadTimeoutRef.current);
        updateReadTimeoutRef.current = null;
      }
      const { convoId: cid, latestMessageId: mid } = readSyncRef.current;
      if (cid) {
        markRead(cid, mid);
      }
    };
  }, [convoId, convo, latestMessageId, queryClient]);

  const listData = useMemo(() => buildChatListData((messages ?? []) as MessageItem[]), [messages]);

  const renderListItem = useCallback(
    ({ item }: { item: ChatListItem; index: number }) => {
      if (item.type === 'date') {
        return (
          <View style={styles.dateSeparator}>
            <View style={styles.dateSeparatorLine} />
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
            <View style={styles.dateSeparatorLine} />
          </View>
        );
      }
      const msg = item.message;
      const isFromMe = msg.sender?.did === currentUserDid;
      const isNewSender = !item.groupedWithPrevious;
      const hasEmbed = isEmbedRecordView(msg.embed);
      const record =
        hasEmbed && msg.embed ? (msg.embed as { record?: EmbedRecordShape }).record : undefined;
      const hasVideoEmbed = !!record && !!getVideoViewFromRecordEmbeds(record.embeds);
      const hasMessageText = msg.text != null && msg.text !== '';
      const showVideoCaption = hasVideoEmbed && hasMessageText;
      const beforeEmbedRaw: ReactNode =
        hasMessageText && !hasVideoEmbed ? (
          <ChatMessageRichText
            text={msg.text}
            facets={msg.facets}
            isFromMe={!!isFromMe}
            fromMeAccentColor={sentMessageAccentColor}
            fromMeTextColor={sentMessageTextColor}
          />
        ) : (!msg.text || msg.text === '') && !hasEmbed ? (
          <Text
            style={[
              styles.messageText,
              isFromMe && styles.messageTextFromMe,
              isFromMe && sentMessageTextColor && { color: sentMessageTextColor },
            ]}
          >
            {getMessagePreview(msg)}
          </Text>
        ) : null;

      const shouldBubbleText =
        beforeEmbedRaw != null &&
        (Boolean(hasMessageText && !hasVideoEmbed) ||
          Boolean((!msg.text || msg.text === '') && !hasEmbed));

      const beforeEmbed: ReactNode =
        shouldBubbleText && beforeEmbedRaw != null ? (
          <SquircleView
            style={[
              styles.messageBubble,
              isFromMe ? styles.messageBubbleMe : styles.messageBubbleThem,
              isFromMe ? sentBubbleBlendedStyle : null,
            ]}
          >
            {beforeEmbedRaw}
            {isFromMe ? (
              <>
                <View
                  style={[
                    styles.bubbleRightArrow,
                    { backgroundColor: sentBubbleBlendedStyle.backgroundColor },
                  ]}
                />
                <View
                  style={[styles.bubbleRightArrowOverlap, { backgroundColor: Colors.neutral[975] }]}
                />
              </>
            ) : (
              <>
                <View style={[styles.bubbleLeftArrow, { backgroundColor: Colors.neutral[900] }]} />
                <View style={styles.bubbleLeftArrowOverlap} />
              </>
            )}
          </SquircleView>
        ) : (
          beforeEmbedRaw
        );

      const embedNode: ReactNode =
        hasEmbed && msg.embed ? (
          <ChatEmbeddedPost embed={msg.embed} isFromMe={!!isFromMe} delayLongPress={400} />
        ) : null;

      const captionNode: ReactNode = showVideoCaption ? (
        <SquircleView
          style={[
            styles.messageBubble,
            styles.videoCaptionBubble,
            isFromMe ? styles.messageBubbleMe : styles.messageBubbleThem,
            isFromMe ? sentBubbleBlendedStyle : null,
          ]}
        >
          <ChatMessageRichText
            text={msg.text}
            facets={msg.facets}
            isFromMe={!!isFromMe}
            fromMeAccentColor={sentMessageAccentColor}
            fromMeTextColor={sentMessageTextColor}
          />
          {isFromMe ? (
            <>
              <View
                style={[
                  styles.bubbleRightArrow,
                  { backgroundColor: sentBubbleBlendedStyle.backgroundColor },
                ]}
              />
              <View
                style={[styles.bubbleRightArrowOverlap, { backgroundColor: Colors.neutral[975] }]}
              />
            </>
          ) : (
            <>
              <View style={[styles.bubbleLeftArrow, { backgroundColor: Colors.neutral[900] }]} />
              <View style={styles.bubbleLeftArrowOverlap} />
            </>
          )}
        </SquircleView>
      ) : null;

      const footerNode: ReactNode = (
        <View style={[styles.messageMetaRow, isFromMe && styles.messageMetaRowFromMe]}>
          {!isFromMe && item.showTime && msg.sentAt && (
            <Text style={styles.messageTime}>{formatMessageTime(msg.sentAt)}</Text>
          )}
          <MessageReactions
            reactions={(msg as MessageItem).reactions}
            currentUserDid={currentUserDid ?? undefined}
            isFromMe={!!isFromMe}
            sentAccentColor={sentMessageAccentColor}
            otherAccentColor={otherUserAccentColor}
          />
          {isFromMe && item.showTime && msg.sentAt && (
            <Text style={[styles.messageTime, styles.messageTimeFromMe]}>
              {formatMessageTime(msg.sentAt)}
            </Text>
          )}
        </View>
      );

      return (
        <ChatMessageRow
          messageId={msg.id}
          onOpenMessageActions={handleOpenMessageActions}
          pressableStyle={[
            styles.messageRow,
            isFromMe ? styles.messageRowFromMe : styles.messageRowFromThem,
            isNewSender && styles.messageRowNewSender,
            hasEmbed && styles.messageRowEmbed,
            hasVideoEmbed && styles.messageRowVideoEmbed,
          ]}
          segments={{
            beforeEmbed,
            embed: embedNode,
            caption: captionNode,
            footer: footerNode,
          }}
        />
      );
    },
    [
      currentUserDid,
      sentMessageAccentColor,
      sentMessageTextColor,
      sentBubbleBlendedStyle,
      otherUserAccentColor,
      handleOpenMessageActions,
    ]
  );

  const keyExtractor = useCallback((item: ChatListItem) => {
    if (item.type === 'date') return `date-${item.dateKey}`;
    return item.message.id;
  }, []);

  const getItemType = useCallback((item: ChatListItem) => {
    return item.type === 'date' ? 'date' : 'message';
  }, []);

  const handleBack = useCallback(() => router.back(), [router]);

  const { navigateToProfile: goToProfileFromChat } = useProfileChannelNavigation();

  const handleViewProfile = useCallback(() => {
    if (isOtherUserUnavailable) {
      Alert.alert(t('chat.profileUnavailableTitle'), t('chat.profileUnavailableMessage'));
      return;
    }
    if (otherDid) goToProfileFromChat(otherDid);
  }, [goToProfileFromChat, otherDid, isOtherUserUnavailable, t]);

  const muteConvoMutation = useMutation({
    mutationFn: (mute: boolean) =>
      mute ? ChatService.muteConvo(convoId) : ChatService.unmuteConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
    },
  });

  const handleMuteToggle = useCallback(() => {
    muteConvoMutation.mutate(!isConvoMuted);
  }, [isConvoMuted, muteConvoMutation]);

  const leaveConvoMutation = useMutation({
    mutationFn: () => ChatService.leaveConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
      router.back();
    },
  });

  const acceptConvoMutation = useMutation({
    mutationFn: () => ChatService.acceptConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
    },
  });

  const handleLeaveConvo = useCallback(() => {
    Alert.alert(t('chat.leaveConversation'), t('chat.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('chat.leave'), style: 'destructive', onPress: () => leaveConvoMutation.mutate() },
    ]);
  }, [leaveConvoMutation, t]);

  const [isReportSubmitting, setIsReportSubmitting] = useState(false);

  const reportConversation = useCallback(
    async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
      if (!otherDid) return;
      setIsReportSubmitting(true);
      try {
        const success = await ModerationService.reportContent(otherDid, reasonType);
        if (success) {
          Alert.alert(t('common.thankYou'), t('chat.conversationReported'));
        } else {
          Alert.alert(t('common.error'), t('chat.failedToSubmitReport'));
        }
      } catch {
        Alert.alert(t('common.error'), t('chat.failedToSubmitReport'));
      } finally {
        setIsReportSubmitting(false);
      }
    },
    [otherDid, t]
  );

  const handleReportConversation = useCallback(() => {
    if (!otherDid) return;
    Alert.alert(t('chat.reportConversationTitle'), t('chat.reportReasonPrompt'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('alerts.spam'), onPress: () => reportConversation('spam') },
      { text: t('alerts.harmfulContent'), onPress: () => reportConversation('violation') },
      { text: t('alerts.misleading'), onPress: () => reportConversation('misleading') },
      { text: t('alerts.sexualContent'), onPress: () => reportConversation('sexual') },
      { text: t('alerts.rudeOffensive'), onPress: () => reportConversation('rude') },
      { text: t('alerts.other'), onPress: () => reportConversation('other') },
    ]);
  }, [otherDid, reportConversation, t]);

  const handleBlockToggle = useCallback(() => {
    const did = profile?.did ?? otherDid ?? '';
    if (!did) return;
    if (blockMutation.isPending || isBlockedByList) return;
    const handle =
      profile?.handle && profile.handle.length > 0 ? profile.handle : 'unknown.invalid';
    if (isBlocked) {
      blockMutation.mutate({ did, handle, isBlocked: false });
    } else {
      Alert.alert(t('chat.blockUser'), t('chat.blockUserConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('alerts.block'),
          style: 'destructive',
          onPress: () => {
            blockMutation.mutate({ did, handle, isBlocked: true });
            router.back();
          },
        },
      ]);
    }
  }, [profile, otherDid, isBlocked, isBlockedByList, blockMutation, router, t]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(text, {
      onSuccess: () => {
        setInputText('');
      },
    });
  }, [inputText, sendMessageMutation]);

  const pickerMessage = useMemo(() => {
    const messageId = reactionPicker.state?.messageId;
    if (!messageId) return null;
    const raw = messages ?? [];
    return (
      (raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined) ?? null
    );
  }, [reactionPicker.state?.messageId, messages]);

  const headerTop = insets.top + 4;

  const rawMessages = messages ?? [];
  const latestSentAt =
    rawMessages[0] &&
    typeof rawMessages[0] === 'object' &&
    (rawMessages[0] as { sentAt?: string }).sentAt
      ? (rawMessages[0] as { sentAt: string }).sentAt
      : undefined;
  const { show: showStreakInHeader, count: streakCount } = getActiveStreak(
    latestSentAt,
    rawMessages,
    currentUserDid ?? undefined
  );

  const headerHandleRaw = profile?.handle?.trim() ?? '';
  const headerHandleTitle =
    headerHandleRaw !== ''
      ? formatHandle(headerHandleRaw)
      : otherDid !== ''
        ? otherDid.slice(0, 22)
        : '';

  if (!convoId && !openByDid) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>{t('chat.invalidConversation')}</Text>
      </View>
    );
  }

  if (openByDid && !convoFetched) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>{t('chat.loading')}</Text>
      </View>
    );
  }

  if (noConvoYet) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerLeft}>
            <NativePressable
              onPress={handleBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <BackArrowIcon size={30} color={Colors.neutral[50]} />
            </NativePressable>
          </View>
        </View>
        <View style={styles.leftConvoPlaceholder}>
          <Text style={styles.placeholder}>{t('chat.noConversationYet')}</Text>
        </View>
      </View>
    );
  }

  if (hasLeftConvo) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerLeft}>
            <NativePressable
              onPress={handleBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <BackArrowIcon size={30} color={Colors.neutral[50]} />
            </NativePressable>
          </View>
        </View>
        <View style={styles.leftConvoPlaceholder}>
          <Text style={styles.placeholder}>{t('chat.youLeftConversation')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerLeft}>
          <NativePressable
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <BackArrowIcon size={30} color={Colors.neutral[50]} />
          </NativePressable>
        </View>
        <View style={styles.headerCenter}>
          <NativePressable
            onPress={handleViewProfile}
            style={styles.headerTitleBlock}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.viewProfile')}
          >
            <View style={sharedItemStyles.avatarContainer}>
              <Avatar uri={profile?.avatar} type="profile" size={headerAvatarSize} />
            </View>
            <View style={styles.headerTitleColumn}>
              <View style={styles.headerNameRow}>
                {headerHandleTitle !== '' ? (
                  <Text style={sharedItemStyles.accountDisplayName} numberOfLines={1}>
                    {headerHandleTitle}
                  </Text>
                ) : null}
                {headerHandleRaw ? (
                  <VerificationBadge
                    handle={headerHandleRaw}
                    textSize={headerBadgeSize}
                    textColor={Colors.neutral[50]}
                  />
                ) : null}
                {headerHandleRaw ? (
                  <BotBadge
                    handle={headerHandleRaw}
                    did={otherDid}
                    labels={profile?.labels as Label[] | undefined}
                    textSize={headerBadgeSize}
                    textColor={Colors.neutral[50]}
                  />
                ) : null}
              </View>
            </View>
          </NativePressable>
        </View>
        <View style={styles.headerRight}>
          {showStreakInHeader && (
            <View style={styles.headerStreakBadge}>
              {streakCount < 7 ? (
                <FlameFillIcon size={14} color={Colors.orange[500]} />
              ) : (
                <FireFillIcon size={14} color={Colors.coral[600]} />
              )}
              <Text
                style={[
                  styles.headerStreakBadgeText,
                  streakCount < 7
                    ? styles.headerStreakBadgeTextFlame
                    : styles.headerStreakBadgeTextFire,
                ]}
              >
                {streakCount}
              </Text>
            </View>
          )}
          <NativePressable
            style={styles.menuButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.chatOptions')}
            onPress={() => {
              TrueSheet.present(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
            }}
          >
            <MoreFillIcon size={24} color={Colors.neutral[50]} />
          </NativePressable>
        </View>
      </View>

      {isOtherUserUnavailable ? (
        <View style={styles.otherUserUnavailableBanner}>
          <Text style={styles.otherUserUnavailableBannerText}>
            {t('chat.otherUserUnavailableHint')}
          </Text>
        </View>
      ) : null}

      <MessageActionsSheet
        messageId={messageActionsTargetId}
        visible={messageActionsSheetVisible}
        onDismiss={closeMessageActionsSheet}
        canCopy={!!(actionsTargetMessage?.text && actionsTargetMessage.text.trim().length > 0)}
        onRequestFullPicker={handleRequestFullPickerFromActions}
        onCopy={handleCopyMessage}
        onDelete={handleDeleteMessageForSelf}
      />

      <ReactionPickerSheet
        visible={reactionPicker.isSheetVisible}
        onDismiss={reactionPicker.closePicker}
        onSelect={value => {
          if (reactionPicker.state?.messageId)
            handleReactionSelect(reactionPicker.state.messageId, value);
          reactionPicker.closePicker();
        }}
        currentReactions={pickerMessage?.reactions}
        currentUserDid={currentUserDid ?? undefined}
        sentAccentColor={sentMessageAccentColor}
        otherAccentColor={otherUserAccentColor}
      />

      <VerticalListSheet name={CHAT_HEADER_MENU_SHEET_NAME} onDismiss={() => {}}>
        {!isOtherUserUnavailable ? (
          <VerticalListButton
            label={t('chat.goToProfile')}
            onPress={() => {
              TrueSheet.dismiss(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
              handleViewProfile();
            }}
          />
        ) : null}
        <VerticalListButton
          label={isConvoMuted ? t('chat.unmute') : t('chat.muteConversation')}
          onPress={() => {
            TrueSheet.dismiss(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
            handleMuteToggle();
          }}
          disabled={muteConvoMutation.isPending}
        />
        <VerticalListButton
          label={isBlocked ? t('chat.unblockAccount') : t('chat.blockAccount')}
          onPress={() => {
            TrueSheet.dismiss(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
            handleBlockToggle();
          }}
          disabled={blockMutation.isPending || isBlockedByList}
        />
        <VerticalListButton
          label={t('chat.reportConversation')}
          onPress={() => {
            TrueSheet.dismiss(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
            handleReportConversation();
          }}
          disabled={isReportSubmitting}
        />
        <VerticalListButton
          label={t('chat.leaveConversation')}
          danger
          onPress={() => {
            TrueSheet.dismiss(CHAT_HEADER_MENU_SHEET_NAME).catch(() => {});
            handleLeaveConvo();
          }}
          disabled={leaveConvoMutation.isPending}
        />
      </VerticalListSheet>

      <VerticalListSheet name="chat-report-or-block" onDismiss={() => {}}>
        <Text style={SHEET_STYLES.sheetScreenTitle}>{t('chat.reportOrBlock')}</Text>
        <View>
          <VerticalListButton
            label={isBlocked ? t('chat.unblockAccount') : t('chat.blockAccount')}
            onPress={() => {
              TrueSheet.dismiss('chat-report-or-block');
              handleBlockToggle();
            }}
            disabled={blockMutation.isPending || isBlockedByList}
          />
          <VerticalListButton
            label={t('chat.reportConversation')}
            onPress={() => {
              TrueSheet.dismiss('chat-report-or-block');
              handleReportConversation();
            }}
            disabled={isReportSubmitting}
          />
        </View>
      </VerticalListSheet>

      <View style={styles.chatBody}>
        <FlashList
          data={listData}
          renderItem={renderListItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          drawDistance={400}
          extraData={{ listLength: listData.length }}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          inverted
          ItemSeparatorComponent={ChatFlashListItemSeparator}
          showsVerticalScrollIndicator={
            listData.length >= SCROLL_INDICATOR_CONSTANTS.CHAT_MESSAGES_MIN_ITEMS
          }
          keyboardShouldPersistTaps="handled"
          renderScrollComponent={renderScrollComponent}
          onEndReached={
            hasNextPage
              ? () => {
                  fetchNextPage();
                }
              : undefined
          }
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            !messagesLoading && convoId ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t('chat.noMessagesYet')}</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.loadingOlderMessages}>
                <ActivityIndicator size="small" color={Colors.neutral[500]} />
              </View>
            ) : null
          }
        />

        <KeyboardStickyView>
          {needsAccept ? (
            <View style={styles.acceptBar}>
              <OptionsButton
                label={acceptConvoMutation.isPending ? t('common.accepting') : t('common.accept')}
                onPress={() => acceptConvoMutation.mutate()}
                disabled={acceptConvoMutation.isPending || leaveConvoMutation.isPending}
                linkType="none"
                style={styles.acceptBarOptionButton}
                containerStyle={[
                  styles.acceptBarOptionButtonInner,
                  styles.acceptBarOptionButtonCenter,
                  styles.acceptBarButtonAcceptBg,
                ]}
                textStyle={[styles.acceptBarOptionButtonText, styles.acceptBarButtonAcceptText]}
              />
              <View style={styles.acceptBarRowActions}>
                <View style={styles.acceptBarOptionButtonWrap}>
                  <OptionsButton
                    label={t('chat.reportOrBlock')}
                    onPress={() => TrueSheet.present('chat-report-or-block')}
                    disabled={acceptConvoMutation.isPending || leaveConvoMutation.isPending}
                    destructive
                    linkType="none"
                    style={styles.acceptBarOptionButton}
                    containerStyle={[
                      styles.acceptBarOptionButtonInner,
                      styles.acceptBarOptionButtonCenter,
                    ]}
                    textStyle={styles.acceptBarOptionButtonText}
                  />
                </View>
                <View style={styles.acceptBarOptionButtonWrap}>
                  <OptionsButton
                    label={
                      leaveConvoMutation.isPending ? t('common.declining') : t('common.decline')
                    }
                    onPress={() => leaveConvoMutation.mutate()}
                    disabled={acceptConvoMutation.isPending || leaveConvoMutation.isPending}
                    linkType="none"
                    style={styles.acceptBarOptionButton}
                    containerStyle={[
                      styles.acceptBarOptionButtonInner,
                      styles.acceptBarOptionButtonCenter,
                    ]}
                    textStyle={styles.acceptBarOptionButtonText}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.chatComposerFooter}>
              <CommentInputFooter
                value={inputText}
                onChangeText={setInputText}
                inputSelection={inputSelection}
                onSelectionChange={e => setInputSelection(e.nativeEvent.selection)}
                placeholder={t('chat.messagePlaceholder')}
                onSubmit={handleSend}
                isPosting={sendMessageMutation.isPending}
                maxLength={1000}
                inputRef={inputRef}
                currentUserAvatar={currentUserAvatar}
                submitAccessibilityLabel={t('a11y.sendMessage')}
                showAvatar
                hideMediaAddButton
                onHeightChange={h => {
                  composerHeight.value = h;
                }}
              />
            </View>
          )}
        </KeyboardStickyView>
      </View>
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
    paddingHorizontal: 10,
    paddingBottom: 6,
    backgroundColor: Colors.black,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.neutral[975],
  },
  acceptBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.neutral[975],
    backgroundColor: Colors.black,
  },
  acceptBarButtonAcceptBg: {
    backgroundColor: Colors.brand.teal,
  },
  acceptBarButtonAcceptText: {
    color: Colors.black,
  },
  acceptBarRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  acceptBarOptionButtonWrap: {
    flex: 1,
  },
  acceptBarOptionButton: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  acceptBarOptionButtonInner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  acceptBarOptionButtonCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBarOptionButtonText: {
    textAlign: 'center',
  },
  headerLeft: {
    width: 88,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
  },
  headerTitleColumn: {
    minWidth: 0,
    maxWidth: '100%',
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',

    maxWidth: '100%',
  },
  headerRight: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerStreakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.neutral[975],
    gap: 4,
  },
  headerStreakBadgeText: {
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.semibold,
  },
  headerStreakBadgeTextFlame: {
    color: Colors.orange[500],
  },
  headerStreakBadgeTextFire: {
    color: Colors.coral[600],
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  otherUserUnavailableBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.black,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.neutral[975],
  },
  otherUserUnavailableBannerText: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.caption,
  },
  chatBody: {
    flex: 1,
  },
  loadingOlderMessages: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
  },
  listItemSeparator: {
    height: 4,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.neutral[300],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  messageRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  chatMessageRowAnimated: {
    width: '100%',
  },
  chatMessageLongPressZone: {
    alignSelf: 'stretch',
  },
  /** Same pattern as login `dividerContainer` / `divider` / `dividerText` (Or divider). */
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.neutral[500],
    opacity: 0.3,
  },
  dateSeparatorText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
    marginHorizontal: 16,
  },
  messageRowNewSender: {
    marginTop: 12,
  },
  messageRowFromThem: {
    alignItems: 'flex-start',
  },
  messageRowFromMe: {
    alignItems: 'flex-end',
  },
  messageRowEmbed: {},
  messageRowVideoEmbed: {
    maxWidth: '100%',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  messageBubbleMe: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS,
  },
  messageBubbleThem: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS,
    backgroundColor: Colors.neutral[900],
  },
  videoCaptionBubble: {
    marginTop: 4,
    paddingVertical: 8,
  },
  bubbleRightArrow: {
    position: 'absolute',
    width: 20,
    height: 25,
    bottom: 0,
    borderBottomLeftRadius: 25,
    right: -10,
  },
  bubbleRightArrowOverlap: {
    position: 'absolute',
    width: 20,
    height: 35,
    bottom: -6,
    borderBottomLeftRadius: 18,
    right: -20,
  },
  bubbleLeftArrow: {
    position: 'absolute',
    backgroundColor: Colors.neutral[900],
    width: 20,
    height: 25,
    bottom: 0,
    borderBottomRightRadius: 25,
    left: -10,
  },
  bubbleLeftArrowOverlap: {
    position: 'absolute',
    backgroundColor: Colors.neutral[975],
    width: 20,
    height: 35,
    bottom: -6,
    borderBottomRightRadius: 18,
    left: -20,
  },
  messageText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
  },
  messageTextMedium: {
    fontFamily: Typography.families.medium,
  },
  messageTextSemiBold: {
    fontFamily: Typography.families.bold,
  },
  messageTextLink: {
    color: Colors.brand.teal,
    textDecorationLine: 'underline',
  },
  messageTextLinkFromMe: {
    textDecorationLine: 'underline',
  },
  messageTextFromMe: {
    textAlign: 'right',
  },
  messageTime: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
  },
  messageTimeFromMe: {
    color: Colors.neutral[600],
    textAlign: 'right',
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  messageMetaRowFromMe: {
    alignSelf: 'flex-end',
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactionsRowFromMe: {
    alignSelf: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: REACTION_CHIP_STYLE.borderWidth,
  },
  reactionEmoji: {
    fontSize: Typography.sizes.caption,
  },
  reactionCount: {
    ...TextStyles.captionExtraSmall,
    color: REACTION_CHIP_STYLE.countColor,
    fontFamily: FontFamily.medium,
  },
  reactionCountOnAccent: {
    color: REACTION_CHIP_STYLE.countColorOnColoredBg,
  },
  reactionSheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[800],
    backgroundColor: Colors.neutral[975],
  },
  reactionSheetActiveChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  reactionSheetActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: REACTION_CHIP_STYLE.borderWidth,
    gap: 4,
  },
  reactionSheetActiveEmoji: {
    fontSize: Typography.sizes.h3,
  },
  reactionSheetActiveCount: {
    fontSize: Typography.sizes.caption,
    color: REACTION_CHIP_STYLE.countColor,
    fontFamily: FontFamily.medium,
  },
  reactionSheetActiveCountHighlight: {
    color: REACTION_CHIP_STYLE.countColorMine,
  },
  reactionSheetActiveCountOnColoredBg: {
    color: REACTION_CHIP_STYLE.countColorOnColoredBg,
  },
  reactionSheetActiveEmpty: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
  },
  reactionSheetContent: {
    flex: 1,
    minHeight: 360,
    backgroundColor: Colors.neutral[975],
  },
  /** Same vertical rhythm as VerticalListSheet `listButtonMargin` */
  messageActionsListButton: {
    marginHorizontal: 0,
    marginBottom: 8,
  },
  /** Lift copy row off sheet neutral[975] (OptionsButton default surface is neutral[900]) */
  messageActionsCopySurface: {
    backgroundColor: Colors.neutral[800],
  },
  messageActionsCopySurfaceDisabled: {
    backgroundColor: hexToRGBA(Colors.neutral[800], 0.52),
  },
  messageActionsOptionLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  /** Matches OptionsButton `menuOptionText` (VerticalList sheets) */
  messageActionsOptionTitle: {
    flex: 1,
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
  },
  messageActionsOptionTitleMuted: {
    color: Colors.neutral[600],
  },
  messageActionsOptionTitleDanger: {
    color: Colors.coral[300],
  },
  embedContent: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    maxWidth: '90%',
    alignSelf: 'flex-start',
    backgroundColor: Colors.neutral[900],
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    borderBottomRightRadius: BORDER_RADIUS.LARGE,
    borderBottomLeftRadius: CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[800],
    overflow: 'hidden',
  },
  embedContentPressable: {
    width: '100%',
  },
  embedContentFromMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    borderBottomRightRadius: CHAT_BUBBLE_OUTSIDE_BOTTOM_RADIUS,
    borderBottomLeftRadius: BORDER_RADIUS.LARGE,
  },
  embedImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  embedSpacing: {
    marginTop: 8,
  },
  embedImagesContainerFromMe: {
    alignSelf: 'flex-end',
  },
  embedImageWrap: {
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.SMALL,
  },
  embedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  embedAuthorRowCompact: {
    marginBottom: 0,
  },
  embedAuthorItem: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
  },
  embedAuthorItemFromMe: {
    alignSelf: 'flex-end',
  },
  embedDescription: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.bodySmall,
    marginTop: 4,
  },
  embedDescriptionFromMe: {
    color: Colors.neutral[300],
    textAlign: 'right',
  },
  embedMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  embedMetricsRowFromMe: {
    alignSelf: 'flex-end',
  },
  embedMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  embedMetricText: {
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
    color: Colors.neutral[400],
  },
  embedTimestamp: {
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    color: Colors.neutral[500],
    marginTop: 4,
  },
  embedUnavailable: {
    opacity: 0.85,
  },
  embedUnavailableText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
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
    top: 0,
    zIndex: 2,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomLeftRadius: CHAT_EMBED_VIDEO_RADIUS,
    borderBottomRightRadius: CHAT_EMBED_VIDEO_RADIUS,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    minHeight: 36,
  },
  embedVideoGradientShim: {
    transform: [{ scaleY: -1 }],
    opacity: 1,
  },
  embedVideoCard: {
    backgroundColor: Colors.neutral[900],
    position: 'relative',
  },
  embedVideoPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  embedVideoAppleZoomInner: {
    flex: 1,
    width: '100%',
    height: '100%',
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
  chatComposerFooter: {
    backgroundColor: Colors.neutral[975],
  },
  placeholder: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.subtitle,
    padding: 20,
  },
  leftConvoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

function ChatFlashListItemSeparator() {
  return <View style={styles.listItemSeparator} />;
}
