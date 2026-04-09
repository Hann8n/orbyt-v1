import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
  ScrollView,
  Alert,
  Pressable,
  useWindowDimensions,
  Linking,
  Keyboard,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import BlurredBackground from '@/components/ui/BlurredBackground';
import { FlashList } from '@shopify/flash-list';
import { Link, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  COMPOSER_STYLES,
  getFooterBottomPadding,
} from '@/utils/components/truesheet';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { Colors } from '@/theme';
import { Typography, FontFamily, fontSizeFor } from '@/utils/components/typography';
import { APP_CONSTANTS, BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import Icon, {
  BackArrowIcon,
  FlameFillIcon,
  FireFillIcon,
  MoreFillIcon,
} from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/UI';
import { OptionsButton } from '@/components/ui/OptionsButton';
import VerticalListSheet, { VerticalListButton } from '@/components/ui/VerticalListSheet';
import AuthorItem from '@/components/ui/AuthorItem';
import { itemSizeConfig, sharedItemStyles } from '@/components/ui/ItemStyles';
import { useAvatarProfileRing } from '@/services/colors';
import { queryKeys } from '@/utils/query/queryKeys';
import { chatReactQueryOptions } from '@/utils/query/chatQueryOptions';
import { getActiveStreak } from '@/utils/chat/streak';
import { format, parseISO, isValid, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { useProfileByDid, useBlockMutation } from '@/services/data/ProfileService';
import { useChatLogPolling } from '@/hooks/useChatLogPolling';
import { ChatService } from '@/services/api/chat/ChatService';
import { ModerationService } from '@/services/moderation/ModerationService';
import { useUserStore } from '@/stores/userStore';
import type { MessageView } from '@/services/api/types';
import { openPostInBluesky } from '@/utils/links/bluesky';
import { buildFeedModalHref, buildFullHeightVideoHref } from '@/utils/navigation/feedModalRoute';
import { useFeedModalTabSegment } from '@/utils/navigation/feedModalTabSegment';
import { seedChatEmbedVideoFeed } from '@/utils/chat/seedChatEmbedVideoFeed';
import { getVideoView } from '@/utils/video/helpers';
import { hexToRGBA } from '@/utils/formatting/colors';
import type { PostView } from '@/services/api/types';
import type { RichTextFacet } from '@/utils/types/richText';
import EmojiPicker from 'react-native-emoji-chooser';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction, MenuComponentRef } from '@react-native-menu/menu';

const EMBED_VIDEO_GRADIENT_SHIM = require('@/assets/embed-video-gradient-shim.png');

/** Chat message item: full MessageView from API (id, rev, text, facets?, embed?, sender, sentAt, reactions?, etc.) */
type MessageItem = MessageView & { sender?: { did: string } };

/** Reaction shape from chat.bsky.convo messageView */
type ReactionShape = { value: string; sender?: { did?: string }; createdAt?: string };

/** Group reactions by emoji value: { value, count, includesMe } */
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

/** Window in minutes for grouping consecutive messages from same sender */
const MESSAGE_GROUP_WINDOW_MINUTES = 5;

/** List item: message or date separator */
type ChatListItem =
  | { type: 'message'; message: MessageItem; showTime: boolean; groupedWithPrevious: boolean }
  | { type: 'date'; dateKey: string; label: string };

type ChatRichTextPart = {
  text: string;
  isSemiBold?: boolean;
  isSymbol?: boolean;
  kind?: 'mention' | 'hashtag' | 'link';
  identifier?: string;
  href?: string;
};

function formatChatRichTextParts(
  text: string,
  facets?: RichTextFacet[] | null
): ChatRichTextPart[] {
  if (!text) return [{ text: '', isSemiBold: false }];
  if (!facets || facets.length === 0) return [{ text, isSemiBold: false }];

  const parts: ChatRichTextPart[] = [];
  const textBytes = new TextEncoder().encode(text);
  let lastByteIndex = 0;
  const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  for (const facet of sortedFacets) {
    const start = Math.max(0, Math.min(textBytes.length, facet.index.byteStart));
    const end = Math.max(start, Math.min(textBytes.length, facet.index.byteEnd));

    if (start > lastByteIndex) {
      const beforeText = new TextDecoder().decode(textBytes.slice(lastByteIndex, start));
      if (beforeText) parts.push({ text: beforeText, isSemiBold: false });
    }

    const facetText = new TextDecoder().decode(textBytes.slice(start, end));
    const features = facet.features ?? [];
    const mentionFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#mention');
    const hashtagFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#tag');
    const linkFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#link');

    const isMention = !!mentionFeature;
    const isHashtag = !!hashtagFeature;
    const isLink = !!linkFeature;

    if (isMention || isHashtag) {
      const symbol = facetText[0];
      const textAfterSymbol = facetText.slice(1);
      const base: Omit<ChatRichTextPart, 'text' | 'isSemiBold'> = {
        kind: isMention ? 'mention' : 'hashtag',
        identifier:
          textAfterSymbol ||
          (isMention
            ? mentionFeature?.did || mentionFeature?.uri || ''
            : hashtagFeature?.tag || ''),
      };

      if (symbol) parts.push({ text: symbol, isSemiBold: false, isSymbol: true, ...base });
      if (textAfterSymbol) parts.push({ text: textAfterSymbol, isSemiBold: true, ...base });
    } else if (isLink) {
      const href = linkFeature?.uri || facetText;
      parts.push({
        text: facetText,
        isSemiBold: false,
        kind: 'link',
        href,
      });
    } else {
      parts.push({ text: facetText, isSemiBold: false });
    }

    lastByteIndex = end;
  }

  if (lastByteIndex < textBytes.length) {
    const remainingText = new TextDecoder().decode(textBytes.slice(lastByteIndex));
    if (remainingText) parts.push({ text: remainingText, isSemiBold: false });
  }

  return parts.length > 0 ? parts : [{ text, isSemiBold: false }];
}

function ChatMessageRichText({
  text,
  facets,
  isFromMe,
}: {
  text: string;
  facets?: RichTextFacet[] | null;
  isFromMe: boolean;
}) {
  const router = useRouter();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();
  const currentTab = useFeedModalTabSegment();
  const parts = useMemo(() => formatChatRichTextParts(text, facets), [text, facets]);

  const handlePartPress = useCallback(
    (part: ChatRichTextPart) => {
      if (!part.kind) return;

      if (part.kind === 'mention' && part.identifier) {
        const clean = part.identifier.trim();
        if (!clean) return;
        goToProfile(clean);
        return;
      }

      if (part.kind === 'hashtag' && part.identifier) {
        const clean = part.identifier.replace(/^#/, '').trim();
        if (!clean) return;
        router.navigate(
          buildFeedModalHref(
            {
              feedOption: `hashtag:${clean}`,
              initialIndex: '0',
              initialPostUri: '',
            },
            currentTab
          )
        );
        return;
      }

      if (part.kind === 'link' && part.href) {
        const raw = part.href.trim();
        if (!raw) return;
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        Linking.openURL(url).catch(() => {});
      }
    },
    [goToProfile, router, currentTab]
  );

  return (
    <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
      {parts.map((part, index) => (
        <Text
          key={index}
          style={[
            part.isSymbol && styles.messageTextMedium,
            part.isSemiBold && styles.messageTextSemiBold,
            part.kind === 'link' &&
              (isFromMe ? styles.messageTextLinkFromMe : styles.messageTextLink),
          ]}
          onPress={part.kind ? () => handlePartPress(part) : undefined}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function getDateGroupLabel(sentAt: string): string {
  const date = parseISO(sentAt);
  if (!isValid(date)) return '';
  if (isToday(date)) return i18n.t('chat.today');
  if (isYesterday(date)) return i18n.t('chat.yesterday');
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
  return i18n.t('chat.messageDeleted');
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

type EmbedImage = {
  thumb?: string;
  fullsize?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
};

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

/** Get images/GIFs from record.embeds (app.bsky.embed.images#view or recordWithMedia with images) */
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
  return (
    (embed as { $type?: string }).$type === EMBED_RECORD_VIEW &&
    'record' in embed &&
    (embed as { record?: unknown }).record != null
  );
}

/** Shared author row for both video and non-video embeds (AuthorItem for verification/bot badges). Use authorAlwaysOnRight (e.g. video overlay) to keep avatar left, handle right regardless of isFromMe. */
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

/** Face-pile style overlap (px); smaller = more fanned out */
const REACTION_OVERLAP = 5;
const REACTION_CHIP_SIZE = 22;
/** Larger chips in picker sheet header and overlay */
const REACTION_SHEET_CHIP_SIZE = 40;

/** Shared chip appearance (message row, overlay buttons, sheet header) */
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

/** Display reactions under a message. Color by reaction sender: my reaction = current user accent (fallback orbyt green); their reaction = other author accent (fallback grey). */
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

/** Nested content (e.g. embeds) calls this to open the same reaction menu as long-press on the row. */
const ReactionPickerRowContext = createContext<(() => void) | null>(null);

type ReactionPickerState = { messageId: string; showFullSheet: true } | null;

/** Full emoji sheet; long-press menu has React (opens sheet), Copy, Delete. */
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

function ChatMessageRow({
  messageId,
  message,
  onOpenFullReactionPicker,
  onCopyMessage,
  onDeleteMessageForSelf,
  entering,
  pressableStyle,
  children,
}: {
  messageId: string;
  message: MessageItem;
  onOpenFullReactionPicker: (messageId: string) => void;
  onCopyMessage: (messageId: string) => void;
  onDeleteMessageForSelf: (messageId: string) => void;
  entering?: ComponentProps<typeof Animated.View>['entering'];
  pressableStyle: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<MenuComponentRef>(null);
  const openMenu = useCallback(() => {
    menuRef.current?.show();
  }, []);

  const canCopyMessage = !!(message.text && message.text.trim().length > 0);

  const menuActions = useMemo<MenuAction[]>(() => {
    const reactAction: MenuAction = {
      id: 'react',
      title: t('chat.react'),
    };

    const copyAction: MenuAction = {
      id: 'copy',
      title: t('common.copy'),
      attributes: { disabled: !canCopyMessage },
    };

    const deleteAction: MenuAction = {
      id: 'delete_for_me',
      title: t('chat.deleteMessageForMe'),
      attributes: { destructive: true },
    };

    return [reactAction, copyAction, deleteAction];
  }, [t, canCopyMessage]);

  const onPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event?: string } }) => {
      const id = nativeEvent?.event;
      if (!id) return;
      if (id === 'react') {
        // Let the native menu finish closing before presenting the sheet (avoids overlapping animations / odd “fly away” motion).
        requestIdleCallback(
          () => {
            onOpenFullReactionPicker(messageId);
          },
          { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
        );
        return;
      }
      if (id === 'copy') {
        onCopyMessage(messageId);
        return;
      }
      if (id === 'delete_for_me') {
        onDeleteMessageForSelf(messageId);
        return;
      }
    },
    [messageId, onOpenFullReactionPicker, onCopyMessage, onDeleteMessageForSelf]
  );

  return (
    <ReactionPickerRowContext.Provider value={openMenu}>
      <Animated.View entering={entering} style={styles.chatMessageRowAnimated}>
        <MenuView
          ref={menuRef}
          actions={menuActions}
          onPressAction={onPressAction}
          shouldOpenOnLongPress
          themeVariant="dark"
          style={styles.chatMessageMenuView}
        >
          <View style={pressableStyle}>{children}</View>
        </MenuView>
      </Animated.View>
    </ReactionPickerRowContext.Provider>
  );
}

/** Emoji picker theme matching app design system */
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

/** TrueSheet with full emoji picker; opened when user taps + on overlay. Chip color by reaction sender: my = sent accent (fallback teal), their = other accent (fallback grey). */
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
  const { height: screenHeight } = useWindowDimensions();
  const grouped = useMemo(
    () => groupReactions(currentReactions, currentUserDid),
    [currentReactions, currentUserDid]
  );
  const handleSelect = useCallback(
    async (emoji: string) => {
      onSelect(emoji);
      try {
        await sheetRef.current?.dismiss();
      } catch {
        // ignore dismiss errors
      }
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

  const maxHeight = Math.round(screenHeight * 0.75);

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

  // Video embed: 9:16 card → `/(tabs)/…/full-height-video` via Link (seed feed on press; iOS: Link.AppleZoom)
  if (isVideo) {
    const thumbnailUrl = videoMeta!.thumbnail;
    const videoHeight = CHAT_EMBED_VIDEO_WIDTH / CHAT_EMBED_VIDEO_ASPECT;
    const thumbnailStyle = {
      width: CHAT_EMBED_VIDEO_WIDTH,
      height: videoHeight,
      borderRadius: CHAT_EMBED_VIDEO_RADIUS,
    };
    const embedVideoCardLayoutStyle = {
      width: CHAT_EMBED_VIDEO_WIDTH,
      height: videoHeight,
      borderRadius: CHAT_EMBED_VIDEO_RADIUS,
    };
    const videoThumbnailBody = (
      <>
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
          <Link href={fullHeightVideoHref} asChild>
            <Pressable
              onPress={() => {
                seedChatEmbedVideoFeed(record);
              }}
              onLongPress={handleLongPress}
              delayLongPress={delayLongPress}
              style={StyleSheet.flatten([styles.embedVideoCard, embedVideoCardLayoutStyle])}
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
  const CHAT_EMBED_IMAGE_SIZE = 80;
  const CHAT_EMBED_IMAGE_SINGLE_MAX = 180;

  return (
    <NativePressable
      onPress={onPressPost}
      onLongPress={handleLongPress}
      delayLongPress={delayLongPress}
      style={[styles.embedContent, isFromMe && styles.embedContentFromMe]}
      android_ripple={{ color: Colors.neutral[700] }}
    >
      {hasImages && (
        <View style={[styles.embedImagesContainer, isFromMe && styles.embedImagesContainerFromMe]}>
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
              <View
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
              </View>
            );
          })}
        </View>
      )}
      <EmbedAuthor author={author} isFromMe={isFromMe} />
      <EmbedDescription text={text} isFromMe={isFromMe} />
    </NativePressable>
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
  const currentUserDid = useUserStore(s => s.currentUser?.did);

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

  const {
    data: profile,
    isError: profileIsError,
    isFetched: profileFetched,
  } = useProfileByDid(otherDid || null);

  const isOtherUserUnavailable =
    !!otherDid &&
    ((profileFetched && profileIsError) ||
      (!!profile?.handle && profile.handle.endsWith('.invalid')));
  const otherRingProps = useAvatarProfileRing(otherDid || null);
  const currentUserRingProps = useAvatarProfileRing(currentUserDid ?? null);
  const sentMessageAccentColor = currentUserRingProps.ringColor || Colors.brand.teal;
  const sentMessageAccentBorderStyle = useMemo(
    () => ({ borderRightColor: sentMessageAccentColor }),
    [sentMessageAccentColor]
  );
  const otherUserAccentColor = otherRingProps.ringColor || Colors.neutral[700];
  const otherMessageAccentBorderStyle = useMemo(
    () => ({ borderLeftColor: otherUserAccentColor }),
    [otherUserAccentColor]
  );
  const headerConfig = itemSizeConfig.large;
  const reactionPicker = useReactionPicker();
  const closePickerRef = useRef(reactionPicker.closePicker);
  closePickerRef.current = reactionPicker.closePicker;

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
  const isBlocked = !!(profile?.viewer?.blocking || profile?.viewer?.blockingByList);
  const isBlockedByList = !!profile?.viewer?.blockingByList;

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: queryKeys.chat.messages.byConversation(convoId),
    queryFn: () => ChatService.getMessages(convoId, null),
    enabled: !!convoId && isInConvo,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    ...chatReactQueryOptions,
  });

  // Dismiss keyboard when leaving the route
  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        inputRef.current?.blur();
      };
    }, [])
  );

  useChatLogPolling(isInConvo ? convoId : undefined, queryClient);

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

  const reactionMutation = useMutation({
    mutationFn: async ({
      messageId,
      value,
      add,
    }: {
      messageId: string;
      value: string;
      add: boolean;
    }) =>
      add
        ? ChatService.addReaction(convoId, messageId, value)
        : ChatService.removeReaction(convoId, messageId, value),
    onMutate: async ({ messageId, value, add }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.chat.messages.byConversation(convoId),
      });
      const prev = queryClient.getQueryData<{ messages: MessageItem[]; cursor: string | null }>(
        queryKeys.chat.messages.byConversation(convoId)
      );
      queryClient.setQueryData(
        queryKeys.chat.messages.byConversation(convoId),
        (old: { messages: MessageItem[]; cursor: string | null } | undefined) => {
          if (!old?.messages) return old;
          const messages = old.messages.map((msg: MessageItem) => {
            if (msg.id !== messageId) return msg;
            const reactions = [...(msg.reactions ?? [])];
            if (add) {
              reactions.push({
                value,
                sender: { did: currentUserDid ?? '' },
                createdAt: new Date().toISOString(),
              });
            } else {
              const i = reactions.findIndex(
                (r: ReactionShape) => r.value === value && r.sender?.did === currentUserDid
              );
              if (i >= 0) reactions.splice(i, 1);
            }
            return { ...msg, reactions };
          });
          return { ...old, messages };
        }
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      closePickerRef.current();
      if (context?.prev != null) {
        queryClient.setQueryData(queryKeys.chat.messages.byConversation(convoId), context.prev);
      }
    },
    onSuccess: () => {
      closePickerRef.current();
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.all,
      });
    },
  });

  const handleReactionSelect = useCallback(
    (messageId: string, value: string) => {
      const raw = messagesData?.messages ?? [];
      const msg = raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined;
      const reactions = msg?.reactions ?? [];
      const hasReaction = reactions.some(
        (r: ReactionShape) => r.value === value && r.sender?.did === currentUserDid
      );
      reactionMutation.mutate({ messageId, value, add: !hasReaction });
    },
    [messagesData?.messages, currentUserDid, reactionMutation]
  );

  const handleCopyMessage = useCallback(
    async (messageId: string) => {
      const raw = messagesData?.messages ?? [];
      const msg = raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined;
      const text = msg?.text?.trim() ?? '';
      if (!text) return;
      try {
        await Clipboard.setStringAsync(text);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // ignore clipboard failures
      }
    },
    [messagesData?.messages]
  );

  const deleteMessageForSelfMutation = useMutation({
    mutationFn: (messageId: string) => ChatService.deleteMessageForSelf(convoId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.byConversation(convoId),
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

  // Newest message id (getMessages returns newest first); pass to updateRead so server marks read up to this message
  const latestMessageId = useMemo(() => {
    const messages = (messagesData?.messages ?? []) as MessageItem[];
    return messages[0]?.id;
  }, [messagesData?.messages]);

  const readSyncRef = useRef<{ convoId: string; latestMessageId: string | undefined }>({
    convoId: '',
    latestMessageId: undefined,
  });
  const updateReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previousConvoIdRef = useRef<string | null>(null);
  const shouldAnimateEnteringRef = useRef(false);

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

  // Bluesky getMessages returns newest first; we reverse to oldest-first so last index = newest (bottom with startRenderingFromBottom)
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
      const hasReactions = (msg.reactions ?? []).length > 0;
      const showTime = !sameSenderAsNext || !nextWithinWindow || hasReactions;

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

  if (convoId != null && convoId !== previousConvoIdRef.current) {
    previousConvoIdRef.current = convoId;
    // Animate only when we're actually loading (no cache); if we have data already, skip
    shouldAnimateEnteringRef.current =
      messagesLoading || (messagesData?.messages?.length ?? 0) === 0;
  }

  useLayoutEffect(() => {
    if (listData.length === 0) return;
    const t = setTimeout(() => {
      shouldAnimateEnteringRef.current = false;
    }, 1000);
    return () => clearTimeout(t);
  }, [listData.length]);

  const renderListItem = useCallback(
    ({ item, index }: { item: ChatListItem; index: number }) => {
      const shouldAnimate = shouldAnimateEnteringRef.current;
      const staggerDelay = Math.min((listData.length - 1 - index) * 45, 720);
      const entering = shouldAnimate ? FadeIn.duration(200).delay(staggerDelay) : undefined;
      if (item.type === 'date') {
        return (
          <Animated.View entering={entering} style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </Animated.View>
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
      return (
        <ChatMessageRow
          messageId={msg.id}
          message={msg}
          onOpenFullReactionPicker={reactionPicker.openFullPicker}
          onCopyMessage={handleCopyMessage}
          onDeleteMessageForSelf={handleDeleteMessageForSelf}
          entering={entering}
          pressableStyle={[
            styles.messageRow,
            isFromMe ? styles.messageRowFromMe : styles.messageRowFromThem,
            isNewSender && styles.messageRowNewSender,
            isFromMe && !hasEmbed && sentMessageAccentBorderStyle,
            !isFromMe && !hasEmbed && otherMessageAccentBorderStyle,
            hasEmbed && styles.messageRowEmbed,
            hasVideoEmbed && styles.messageRowVideoEmbed,
          ]}
        >
          {hasMessageText && !hasVideoEmbed && (
            <ChatMessageRichText
              text={msg.text}
              facets={(msg as { facets?: RichTextFacet[] | null }).facets ?? null}
              isFromMe={!!isFromMe}
            />
          )}
          {hasEmbed && msg.embed && (
            <ChatEmbeddedPost embed={msg.embed} isFromMe={!!isFromMe} delayLongPress={400} />
          )}
          {showVideoCaption && (
            <View
              style={[
                styles.videoCaptionContainer,
                isFromMe
                  ? styles.videoCaptionContainerFromMe
                  : styles.videoCaptionContainerFromThem,
                isFromMe ? sentMessageAccentBorderStyle : otherMessageAccentBorderStyle,
              ]}
            >
              <ChatMessageRichText
                text={msg.text}
                facets={(msg as { facets?: RichTextFacet[] | null }).facets ?? null}
                isFromMe={!!isFromMe}
              />
            </View>
          )}
          {(!msg.text || msg.text === '') && !hasEmbed && (
            <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
              {getMessagePreview(msg)}
            </Text>
          )}
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
        </ChatMessageRow>
      );
    },
    [
      listData.length,
      currentUserDid,
      sentMessageAccentColor,
      otherUserAccentColor,
      sentMessageAccentBorderStyle,
      otherMessageAccentBorderStyle,
      reactionPicker.openFullPicker,
      handleCopyMessage,
      handleDeleteMessageForSelf,
    ]
  );

  const keyExtractor = useCallback((item: ChatListItem) => {
    if (item.type === 'date') return `date-${item.dateKey}`;
    return item.message.id;
  }, []);

  const getItemType = useCallback((item: ChatListItem) => {
    return item.type === 'date' ? 'date' : 'message';
  }, []);

  const maintainVisibleContentPositionConfig = useMemo(
    () => ({
      startRenderingFromBottom: true,
      autoscrollToBottomThreshold: 0.2,
    }),
    []
  );

  const listItemSeparator = useMemo(() => {
    const ListItemSeparator = () => <View style={styles.listItemSeparator} />;
    ListItemSeparator.displayName = 'ListItemSeparator';
    return ListItemSeparator;
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
  }, [
    profile?.did,
    profile?.handle,
    otherDid,
    isBlocked,
    isBlockedByList,
    blockMutation,
    router,
    t,
  ]);

  const headerChatMenuActions = useMemo((): MenuAction[] => {
    const items: MenuAction[] = [];
    if (!isOtherUserUnavailable) {
      items.push({ id: 'profile', title: t('chat.goToProfile') });
    }
    items.push(
      {
        id: 'mute',
        title: isConvoMuted ? t('chat.unmute') : t('chat.muteConversation'),
        attributes: { disabled: muteConvoMutation.isPending },
      },
      {
        id: 'block',
        title: isBlocked ? t('chat.unblockAccount') : t('chat.blockAccount'),
        attributes: { disabled: blockMutation.isPending || isBlockedByList },
      },
      {
        id: 'report',
        title: t('chat.reportConversation'),
        attributes: { disabled: isReportSubmitting },
      },
      {
        id: 'leave',
        title: t('chat.leaveConversation'),
        attributes: { destructive: true, disabled: leaveConvoMutation.isPending },
      }
    );
    return items;
  }, [
    isOtherUserUnavailable,
    isConvoMuted,
    t,
    muteConvoMutation.isPending,
    isReportSubmitting,
    isBlocked,
    blockMutation.isPending,
    isBlockedByList,
    leaveConvoMutation.isPending,
  ]);

  const handleChatHeaderMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event?: string } }) => {
      const id = nativeEvent?.event;
      if (!id) return;
      if (id === 'profile') {
        handleViewProfile();
        return;
      }
      if (id === 'mute') {
        handleMuteToggle();
        return;
      }
      if (id === 'report') {
        handleReportConversation();
        return;
      }
      if (id === 'block') {
        handleBlockToggle();
        return;
      }
      if (id === 'leave') {
        handleLeaveConvo();
        return;
      }
    },
    [
      handleViewProfile,
      handleMuteToggle,
      handleReportConversation,
      handleBlockToggle,
      handleLeaveConvo,
    ]
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(text);
  }, [inputText, sendMessageMutation]);

  const pickerMessage = useMemo(() => {
    const messageId = reactionPicker.state?.messageId;
    if (!messageId) return null;
    const raw = messagesData?.messages ?? [];
    return (
      (raw.find((m: { id?: string }) => m.id === messageId) as MessageItem | undefined) ?? null
    );
  }, [reactionPicker.state?.messageId, messagesData?.messages]);

  const canSend = !needsAccept && inputText.trim().length > 0 && !sendMessageMutation.isPending;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const headerTop = insets.top + 4;

  const rawMessages = messagesData?.messages ?? [];
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
        <View style={[sharedItemStyles.accountButtonContent, styles.headerCenter]}>
          <NativePressable
            onPress={handleViewProfile}
            style={sharedItemStyles.avatarContainer}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.viewProfile')}
          >
            <Avatar
              uri={profile?.avatar}
              type="profile"
              size={headerConfig.avatarSize}
              showRing={otherRingProps.showRing}
              ringColor={otherRingProps.ringColor}
              profileColors={otherRingProps.profileColors}
              status={profile?.status}
            />
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
          <MenuView
            title=""
            actions={headerChatMenuActions}
            onPressAction={handleChatHeaderMenuAction}
            shouldOpenOnLongPress={false}
            themeVariant="dark"
            isAnchoredToRight
          >
            <NativePressable
              style={styles.menuButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.chatOptions')}
            >
              <MoreFillIcon size={24} color={Colors.neutral[50]} />
            </NativePressable>
          </MenuView>
        </View>
      </View>

      {isOtherUserUnavailable ? (
        <View style={styles.otherUserUnavailableBanner}>
          <Text style={styles.otherUserUnavailableBannerText}>
            {t('chat.otherUserUnavailableHint')}
          </Text>
        </View>
      ) : null}

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

      <VerticalListSheet
        name="chat-report-or-block"
        onDismiss={() => {}}
        title={t('chat.reportOrBlock')}
        showCancelButton
        cancelButtonText={t('common.cancel')}
      >
        <View style={styles.menuOptionsContainer}>
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

      <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
        {listData.length > 0 ? (
          <FlashList
            data={listData}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            drawDistance={400}
            extraData={{ listLength: listData.length }}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={listItemSeparator}
            showsVerticalScrollIndicator={
              listData.length >= SCROLL_INDICATOR_CONSTANTS.CHAT_MESSAGES_MIN_ITEMS
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            maintainVisibleContentPosition={maintainVisibleContentPositionConfig}
          />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {!messagesLoading && messagesData && (messagesData.messages?.length ?? 0) === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t('chat.noMessagesYet')}</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

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
                  label={leaveConvoMutation.isPending ? t('common.declining') : t('common.decline')}
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
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('chat.messagePlaceholder')}
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
              <NativePressable
                style={[styles.sendButton, !useLiquidGlass && styles.sendButtonFallback]}
                onPressIn={() => {
                  // Keep focus anchored on the input so keyboard doesn't collapse
                  inputRef.current?.focus();
                }}
                onPress={handleSend}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('a11y.sendMessage')}
              >
                {useLiquidGlass ? (
                  <>
                    <GlassView
                      style={styles.sendButtonGlass}
                      glassEffectStyle="clear"
                      tintColor={hexToRGBA(Colors.neutral[50], 1)}
                      isInteractive
                    />
                    <View style={styles.sendButtonContent} pointerEvents="none">
                      <Icon name="up" size={22} color={Colors.black} />
                    </View>
                  </>
                ) : (
                  <Icon name="up" size={22} color={Colors.black} />
                )}
              </NativePressable>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
      <View style={[styles.footerSpacer, { height: getFooterBottomPadding(insets.bottom) }]} />
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
    borderBottomColor: Colors.neutral[800],
  },
  acceptBar: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[800],
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.neutral[900],
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
    backgroundColor: Colors.neutral[900],
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[800],
  },
  otherUserUnavailableBannerText: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.caption,
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
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  listItemSeparator: {
    height: 6,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
  },
  messageRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  chatMessageRowAnimated: {
    width: '100%',
  },
  chatMessageMenuView: {
    width: '100%',
    alignSelf: 'stretch',
  },
  dateSeparator: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSeparatorText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
  },
  messageRowNewSender: {
    marginTop: 10,
  },
  messageRowFromThem: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: Colors.neutral[700],
  },
  messageRowFromMe: {
    alignItems: 'flex-end',
    paddingRight: 10,
    borderRightWidth: 2,
    borderRightColor: Colors.brand.teal,
  },
  messageRowEmbed: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  messageRowVideoEmbed: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  videoCaptionContainer: {
    width: CHAT_EMBED_VIDEO_WIDTH,
    maxWidth: '85%',
    marginTop: 6,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: Colors.transparent,
    borderLeftWidth: 2,
    borderRightWidth: 2,
  },
  videoCaptionContainerFromMe: {
    alignSelf: 'flex-end',
    paddingRight: 10,
    borderLeftWidth: 0,
  },
  videoCaptionContainerFromThem: {
    alignSelf: 'flex-start',
    paddingLeft: 10,
    borderRightWidth: 0,
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
    color: Colors.brand.teal,
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
    fontSize: fontSizeFor(11),
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
    backgroundColor: Colors.neutral[900],
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
    backgroundColor: Colors.neutral[900],
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
  embedImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  embedImagesContainerFromMe: {
    alignSelf: 'flex-end',
  },
  embedImageWrap: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  embedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
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
    overflow: 'hidden',
    backgroundColor: Colors.neutral[900],
    position: 'relative',
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
  inputRow: COMPOSER_STYLES.inputRow,
  inputWrapper: COMPOSER_STYLES.inputWrapper,
  input: {
    ...COMPOSER_STYLES.textInput,
    ...(Platform.OS === 'android' && { includeFontPadding: false }),
  },
  sendButton: COMPOSER_STYLES.sendButton,
  sendButtonFallback: COMPOSER_STYLES.sendButtonFallback,
  sendButtonGlass: COMPOSER_STYLES.sendButtonGlassBg,
  sendButtonContent: COMPOSER_STYLES.sendButtonContent,
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
  footerSpacer: {
    backgroundColor: Colors.black,
  },
});
