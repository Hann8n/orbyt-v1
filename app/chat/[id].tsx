import type { ComponentProps } from 'react';
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
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  Alert,
  Modal,
  useWindowDimensions,
  Linking,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import BlurredBackground from '../../src/components/ui/BlurredBackground';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { AppTrueSheet } from '../../src/utils/components/truesheet';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { Colors } from '../../src/theme';
import { BORDER_RADIUS } from '../../src/utils/constants';
import Icon, {
  BackArrowIcon,
  FlameFillIcon,
  FireFillIcon,
  MoreFillIcon,
} from '../../src/components/ui/Icon';
import { Avatar } from '../../src/components/ui/UI';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { itemSizeConfig, sharedItemStyles } from '../../src/components/ui/ItemStyles';
import { hexToRGBA } from '../../src/utils/formatting/colors';
import { useAvatarProfileRing } from '../../src/services/colors';
import { formatHandle } from '../../src/utils/formatting/handles';
import { queryKeys } from '../../src/utils/query/queryKeys';
import { getActiveStreak } from '../../src/utils/chat/streak';
import { format, parseISO, isValid, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { useProfileByDid, useBlockMutation } from '../../src/services/data/ProfileService';
import { useChatLogPolling } from '../../src/hooks/useChatLogPolling';
import { ChatService } from '../../src/services/api/chat/ChatService';
import AtprotoService from '../../src/services/api/AtprotoService';
import { useUserStore } from '../../src/stores/userStore';
import type { MessageView } from '../../src/services/api/types';
import { openPostInBluesky } from '../../src/utils/links/bluesky';
import { getVideoView } from '../../src/utils/video/helpers';
import { feedService } from '../../src/services/FeedService';
import type { ExtendedFeedViewPost, PostView } from '../../src/services/api/types';
import type { RichTextFacet } from '../../src/utils/types/richText';
import EmojiPicker from 'react-native-emoji-chooser';
import Animated, { FadeIn } from 'react-native-reanimated';

const EMBED_VIDEO_GRADIENT_SHIM = require('../../src/assets/embed-video-gradient-shim.png');

/** Chat message item: full MessageView from API (id, rev, text, facets?, embed?, sender, sentAt, reactions?, etc.) */
type MessageItem = MessageView & { sender?: { did: string } };

/** Quick-reaction emojis (aligned with Bluesky chat defaults) */
const QUICK_REACTIONS = ['❤️', '👍', '👀', '😢', '😂'] as const;

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

      if (symbol) parts.push({ text: symbol, isSemiBold: false, ...base });
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
  const parts = useMemo(() => formatChatRichTextParts(text, facets), [text, facets]);

  const handlePartPress = useCallback(
    (part: ChatRichTextPart) => {
      if (!part.kind) return;

      if (part.kind === 'mention' && part.identifier) {
        const clean = part.identifier.trim();
        if (!clean) return;
        router.navigate({
          pathname: '/profile/[did]',
          params: { did: clean },
        });
        return;
      }

      if (part.kind === 'hashtag' && part.identifier) {
        const clean = part.identifier.replace(/^#/, '').trim();
        if (!clean) return;
        router.navigate({
          pathname: '/(modals)/feed',
          params: {
            feedOption: `hashtag:${clean}`,
            backgroundColor: Colors.black,
            searchQuery: `#${clean}`,
          },
        });
        return;
      }

      if (part.kind === 'link' && part.href) {
        const raw = part.href.trim();
        if (!raw) return;
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        Linking.openURL(url).catch(() => {});
      }
    },
    [router]
  );

  return (
    <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
      {parts.map((part, index) => (
        <Text
          key={index}
          style={[
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

/** Shared author row: avatar + handle for both video and non-video embeds. Use authorAlwaysOnRight (e.g. video overlay) to keep avatar left, handle right regardless of isFromMe. */
function EmbedAuthor({
  author,
  size,
  isFromMe,
  compact,
  authorAlwaysOnRight,
}: {
  author: EmbedRecordShape['author'];
  size: number;
  isFromMe: boolean;
  compact?: boolean;
  /** When true, author handle is always on the right of the avatar (e.g. video overlay). */
  authorAlwaysOnRight?: boolean;
}) {
  const ringProps = useAvatarProfileRing(author?.did ?? null);
  if (!author) return null;
  const handle = formatHandle(author.handle) || author.did;
  return (
    <View
      style={[
        styles.embedAuthorRow,
        compact && styles.embedAuthorRowCompact,
        isFromMe && !authorAlwaysOnRight && styles.embedAuthorRowFromMe,
      ]}
    >
      <Avatar
        uri={author.avatar}
        type="profile"
        size={size}
        showRing={ringProps.showRing}
        ringColor={ringProps.ringColor}
        profileColors={ringProps.profileColors}
      />
      <Text
        style={[
          styles.embedAuthorHandle,
          compact && styles.embedAuthorHandleCompact,
          isFromMe && !authorAlwaysOnRight && styles.embedAuthorHandleFromMe,
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
const PICKER_WIDTH_EST = 310;
const PICKER_HEIGHT_EST = 56;
const PICKER_OFFSET = 4;
const SCREEN_PADDING = 8;

/** Message bounds in window coords (from measureInWindow). Used to root the reaction picker above or below the message. */
type MessageBounds = { top: number; bottom: number; left: number; width: number };

/** When set, nested content (e.g. embeds) calls this to open the reaction picker with the row's measured bounds. */
const ReactionPickerRowContext = createContext<(() => void) | null>(null);

/** Vertical band where the picker is allowed (between header and input row). */
function getPickerSafeVerticalRange(
  screenHeight: number,
  safeArea: { top: number; bottom: number }
): { minTop: number; maxTop: number } {
  const headerHeight = safeArea.top + 56;
  const footerHeight = 60 + safeArea.bottom;
  return {
    minTop: headerHeight,
    maxTop: screenHeight - footerHeight - PICKER_HEIGHT_EST,
  };
}

/** Picker top so it sits just above or just below the message, clamped to the safe band. */
function clampPickerTopToMessage(
  messageBounds: MessageBounds,
  safe: { minTop: number; maxTop: number }
): number {
  const topIfAbove = messageBounds.top - PICKER_HEIGHT_EST - PICKER_OFFSET;
  const topIfBelow = messageBounds.bottom + PICKER_OFFSET;
  const fitsAbove = topIfAbove >= safe.minTop;
  const top = fitsAbove ? topIfAbove : topIfBelow;
  return Math.max(safe.minTop, Math.min(safe.maxTop, top));
}

type ReactionPickerState = {
  messageId: string;
  messageBounds: MessageBounds | null;
  showFullSheet: boolean;
} | null;

/** Encapsulates reaction overlay + sheet state and open/close. Single closePicker() clears everything. */
function useReactionPicker() {
  const [state, setState] = useState<ReactionPickerState>(null);

  const openPicker = useCallback((messageId: string, bounds: MessageBounds | null) => {
    setState({ messageId, messageBounds: bounds, showFullSheet: false });
  }, []);

  const closePicker = useCallback(() => {
    setState(null);
  }, []);

  const openFullSheet = useCallback(() => {
    setState(prev => (prev ? { ...prev, showFullSheet: true } : null));
  }, []);

  return {
    state,
    openPicker,
    closePicker,
    openFullSheet,
    isOverlayVisible: state != null && !state.showFullSheet,
    isSheetVisible: state != null && state.showFullSheet,
  };
}

/** Wraps a message row: measures its own ref on long-press and provides that open action via context so embeds open the picker with correct position. */
function ChatMessageRow({
  messageId,
  onOpenPicker,
  entering,
  pressableStyle,
  children,
}: {
  messageId: string;
  onOpenPicker: (messageId: string, bounds: MessageBounds | null) => void;
  entering?: ComponentProps<typeof Animated.View>['entering'];
  pressableStyle: Parameters<typeof Pressable>[0]['style'];
  children: React.ReactNode;
}) {
  const rowRef = useRef<View | null>(null);
  const openWithBounds = useCallback(() => {
    const el = rowRef.current;
    if (el) {
      el.measureInWindow((x, y, w, h) => {
        onOpenPicker(messageId, { top: y, bottom: y + h, left: x, width: w });
      });
    } else {
      onOpenPicker(messageId, null);
    }
  }, [messageId, onOpenPicker]);

  return (
    <ReactionPickerRowContext.Provider value={openWithBounds}>
      <Animated.View entering={entering} ref={rowRef}>
        <Pressable onLongPress={openWithBounds} delayLongPress={400} style={pressableStyle}>
          {children}
        </Pressable>
      </Animated.View>
    </ReactionPickerRowContext.Provider>
  );
}

/** Overlay: positioned quick-reaction pill above or below the selected message; + opens full picker sheet. Selected = my reaction = current user accent (fallback orbyt green). */
function ReactionOverlayModal({
  visible,
  messageBounds,
  isFromMe,
  safeAreaInsets,
  onDismiss,
  onSelect,
  onOpenFullPicker,
  currentReactions,
  currentUserDid,
  sentAccentColor,
}: {
  visible: boolean;
  messageBounds: MessageBounds | null;
  isFromMe: boolean;
  safeAreaInsets: { top: number; bottom: number };
  onDismiss: () => void;
  onSelect: (value: string) => void;
  onOpenFullPicker: () => void;
  currentReactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  sentAccentColor?: string;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const defaultPosition = useMemo(
    () => ({ left: screenWidth / 2 - PICKER_WIDTH_EST / 2, top: 100 }),
    [screenWidth]
  );
  const [lastPosition, setLastPosition] = useState<{ left: number; top: number } | null>(null);
  const [lastMessageBounds, setLastMessageBounds] = useState<MessageBounds | null>(null);

  if (visible && messageBounds) {
    if (messageBounds !== lastMessageBounds) setLastMessageBounds(messageBounds);
    const rawLeft = isFromMe
      ? messageBounds.left + messageBounds.width - PICKER_WIDTH_EST
      : messageBounds.left;
    const left = Math.max(
      SCREEN_PADDING,
      Math.min(screenWidth - PICKER_WIDTH_EST - SCREEN_PADDING, rawLeft)
    );
    const safe = getPickerSafeVerticalRange(screenHeight, safeAreaInsets);
    const top = clampPickerTopToMessage(messageBounds, safe);
    if (lastPosition?.left !== left || lastPosition?.top !== top) {
      setLastPosition({ left, top });
    }
  }

  const position = useMemo(() => {
    if (messageBounds) {
      const rawLeft = isFromMe
        ? messageBounds.left + messageBounds.width - PICKER_WIDTH_EST
        : messageBounds.left;
      const left = Math.max(
        SCREEN_PADDING,
        Math.min(screenWidth - PICKER_WIDTH_EST - SCREEN_PADDING, rawLeft)
      );
      const safe = getPickerSafeVerticalRange(screenHeight, safeAreaInsets);
      const top = clampPickerTopToMessage(messageBounds, safe);
      return { left, top };
    }
    return lastPosition ?? defaultPosition;
  }, [
    messageBounds,
    isFromMe,
    screenWidth,
    screenHeight,
    safeAreaInsets,
    defaultPosition,
    lastPosition,
  ]);

  const positionStyle = useMemo(
    () => ({ left: position.left, top: position.top }),
    [position.left, position.top]
  );
  const hasReaction = (value: string) =>
    currentReactions?.some(r => r.value === value && r.sender?.did === currentUserDid) ?? false;

  const quickEmojis = useMemo(() => {
    const mine = (currentReactions ?? [])
      .filter(r => r.sender?.did === currentUserDid)
      .map(r => r.value ?? '')
      .filter(Boolean);
    return [...new Set([...mine, ...QUICK_REACTIONS])];
  }, [currentReactions, currentUserDid]);

  const boundsForCutout = messageBounds ?? lastMessageBounds;
  const dimBands = useMemo(() => {
    if (!boundsForCutout) return null;
    const { top: t, bottom: b, left: l, width: w } = boundsForCutout;
    const dimStyle = styles.reactionPickerDimBand;
    return (
      <>
        <View style={[dimStyle, styles.reactionPickerDimTop, { height: t }]} />
        <View style={[dimStyle, styles.reactionPickerDimBottom, { top: b }]} />
        <View
          style={[dimStyle, styles.reactionPickerDimLeft, { top: t, width: l, height: b - t }]}
        />
        <View
          style={[dimStyle, styles.reactionPickerDimRight, { top: t, left: l + w, height: b - t }]}
        />
      </>
    );
  }, [boundsForCutout]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.reactionPickerBackdrop}>
        {dimBands ?? <View style={[StyleSheet.absoluteFill, styles.reactionPickerDimBand]} />}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[styles.reactionPickerContent, positionStyle]}>
          {quickEmojis.map(value => {
            const selected = hasReaction(value);
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.reactionPickerButton,
                  {
                    backgroundColor: selected
                      ? (sentAccentColor ?? Colors.brand.teal)
                      : REACTION_CHIP_STYLE.bgDefault,
                    borderColor: REACTION_CHIP_STYLE.borderColorDefault,
                  },
                  selected && {
                    borderColor: sentAccentColor ?? REACTION_CHIP_STYLE.borderColorMine,
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => onSelect(value)}
              >
                <Text style={styles.reactionPickerEmoji}>{value}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={({ pressed }) => [
              styles.reactionPickerButton,
              styles.reactionPickerMoreButton,
              {
                backgroundColor: REACTION_CHIP_STYLE.bgDefault,
                borderColor: REACTION_CHIP_STYLE.borderColorDefault,
              },
              pressed && { opacity: 0.85 },
            ]}
            onPressIn={onOpenFullPicker}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="More emoji"
          >
            <Icon name="plus" size={20} color={Colors.neutral[400]} />
          </Pressable>
        </View>
      </View>
    </Modal>
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
        fontFamily: 'Figtree-Regular',
        fontSize: 16,
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
          fontFamily: 'Figtree-SemiBold',
          fontSize: 13,
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
        fontFamily: 'Figtree-Regular',
        fontSize: 16,
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
          fontFamily: 'Figtree-SemiBold',
          fontSize: 13,
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
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${value}`}
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
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.reactionSheetActiveEmpty}>No reactions yet</Text>
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
            placeholder: 'Search emoji…',
            placeholderTextColor: Colors.neutral[500],
            style: {
              fontFamily: 'Figtree-Regular',
              fontSize: 16,
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
  const router = useRouter();
  const openFromRow = useContext(ReactionPickerRowContext);
  const handleLongPress = openFromRow ?? onLongPress;
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
      router.navigate({
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
            onLongPress={handleLongPress}
            delayLongPress={delayLongPress}
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
            <View style={styles.embedVideoAuthorOverlay} pointerEvents="none">
              <Image
                source={EMBED_VIDEO_GRADIENT_SHIM}
                style={[StyleSheet.absoluteFill, styles.embedVideoGradientShim]}
                contentFit="cover"
              />
              <EmbedAuthor
                author={author}
                size={26}
                isFromMe={isFromMe}
                compact
                authorAlwaysOnRight
              />
            </View>
          </Pressable>
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
    <Pressable
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
                  accessibilityLabel={img.alt || 'Embed image'}
                />
              </View>
            );
          })}
        </View>
      )}
      <EmbedAuthor author={author} size={24} isFromMe={isFromMe} />
      <EmbedDescription text={text} isFromMe={isFromMe} />
    </Pressable>
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
  });

  const { data: convoById, isFetched: convoByIdFetched } = useQuery({
    queryKey: queryKeys.chat.conversations.detail(rawId),
    queryFn: () => ChatService.getConvo(rawId),
    enabled: !!rawId && !openByDid,
  });

  const convo = openByDid ? convoByMembers : convoById;
  const convoFetched = openByDid ? convoByMembersFetched : convoByIdFetched;
  const convoId = openByDid ? (convo?.id ?? '') : rawId;

  const { data: profile } = useProfileByDid(otherDid || null);
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
          onOpenPicker={reactionPicker.openPicker}
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
      reactionPicker,
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

  const handleViewProfile = useCallback(() => {
    TrueSheet.dismiss('chat-menu');
    if (otherDid) router.navigate({ pathname: '/profile/[did]', params: { did: otherDid } });
  }, [router, otherDid]);

  const muteConvoMutation = useMutation({
    mutationFn: (mute: boolean) =>
      mute ? ChatService.muteConvo(convoId) : ChatService.unmuteConvo(convoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.detail(convoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
      TrueSheet.dismiss('chat-menu');
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
      TrueSheet.dismiss('chat-menu');
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
          TrueSheet.dismiss('chat-menu');
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
      TrueSheet.dismiss('chat-menu');
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
              TrueSheet.dismiss('chat-menu');
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
        <Text style={styles.placeholder}>Invalid conversation</Text>
      </View>
    );
  }

  if (openByDid && !convoFetched) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Loading…</Text>
      </View>
    );
  }

  if (noConvoYet) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <BackArrowIcon size={30} color={Colors.neutral[50]} />
            </Pressable>
          </View>
        </View>
        <View style={styles.leftConvoPlaceholder}>
          <Text style={styles.placeholder}>No conversation with this user yet</Text>
        </View>
      </View>
    );
  }

  if (hasLeftConvo) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <BackArrowIcon size={30} color={Colors.neutral[50]} />
            </Pressable>
          </View>
        </View>
        <View style={styles.leftConvoPlaceholder}>
          <Text style={styles.placeholder}>You left this conversation</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <BackArrowIcon size={30} color={Colors.neutral[50]} />
          </Pressable>
        </View>
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
              showRing={otherRingProps.showRing}
              ringColor={otherRingProps.ringColor}
              profileColors={otherRingProps.profileColors}
              status={profile?.status}
            />
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          {showStreakInHeader && (
            <View style={styles.headerStreakBadge}>
              {streakCount < 7 ? (
                <FlameFillIcon size={14} color={Colors.orange[500]} />
              ) : (
                <FireFillIcon size={14} color="#dc2626" />
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
          <Pressable
            onPress={() => TrueSheet.present('chat-menu')}
            style={styles.menuButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Chat options"
          >
            <MoreFillIcon size={24} color={Colors.neutral[50]} />
          </Pressable>
        </View>
      </View>

      <ReactionOverlayModal
        visible={reactionPicker.isOverlayVisible}
        messageBounds={reactionPicker.state?.messageBounds ?? null}
        isFromMe={pickerMessage?.sender?.did === currentUserDid}
        safeAreaInsets={{ top: insets.top, bottom: insets.bottom }}
        onDismiss={reactionPicker.closePicker}
        onSelect={value => {
          if (reactionPicker.state?.messageId)
            handleReactionSelect(reactionPicker.state.messageId, value);
          reactionPicker.closePicker();
        }}
        onOpenFullPicker={reactionPicker.openFullSheet}
        currentReactions={pickerMessage?.reactions}
        currentUserDid={currentUserDid ?? undefined}
        sentAccentColor={sentMessageAccentColor}
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

      <VerticalListSheet
        name="chat-menu"
        onDismiss={() => {}}
        title={`Chat with ${formatHandle(profile?.handle) || 'user'}`}
        showCancelButton
        cancelButtonText="Cancel"
      >
        <View style={styles.menuOptionsContainer}>
          <VerticalListButton label="Go to profile" onPress={handleViewProfile} />
          <VerticalListButton
            label={isConvoMuted ? 'Unmute' : 'Mute conversation'}
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

      <VerticalListSheet
        name="chat-report-or-block"
        onDismiss={() => {}}
        title="Report or block"
        showCancelButton
        cancelButtonText="Cancel"
      >
        <View style={styles.menuOptionsContainer}>
          <VerticalListButton
            label={isBlocked ? 'Unblock account' : 'Block account'}
            onPress={() => {
              TrueSheet.dismiss('chat-report-or-block');
              handleBlockToggle();
            }}
            disabled={blockMutation.isPending || isBlockedByList}
          />
          <VerticalListButton
            label="Report conversation"
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
            showsVerticalScrollIndicator={false}
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
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {needsAccept ? (
          <View style={styles.acceptBar}>
            <OptionsButton
              label={acceptConvoMutation.isPending ? 'Accepting…' : 'Accept'}
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
                  label="Report or block"
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
                  label={leaveConvoMutation.isPending ? 'Declining…' : 'Decline'}
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
                onPressIn={() => {
                  // Keep focus anchored on the input so keyboard doesn't collapse
                  inputRef.current?.focus();
                }}
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
        )}
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom, backgroundColor: Colors.black }} />
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
    fontSize: 12,
    fontFamily: 'Figtree-SemiBold',
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
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  messageRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  dateSeparator: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSeparatorText: {
    color: Colors.neutral[500],
    fontSize: 13,
    fontFamily: 'Figtree-Medium',
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
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
  },
  messageTextSemiBold: {
    fontFamily: 'Figtree-SemiBold',
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
    fontSize: 12,
    fontFamily: 'Figtree-Regular',
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
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 11,
    color: REACTION_CHIP_STYLE.countColor,
    fontFamily: 'Figtree-Medium',
  },
  reactionCountOnAccent: {
    color: REACTION_CHIP_STYLE.countColorOnColoredBg,
  },
  reactionPickerBackdrop: {
    flex: 1,
    backgroundColor: hexToRGBA(Colors.black, 0),
  },
  reactionPickerDimBand: {
    position: 'absolute',
    backgroundColor: hexToRGBA(Colors.black, 0.4),
  },
  reactionPickerDimTop: {
    top: 0,
    left: 0,
    right: 0,
  },
  reactionPickerDimBottom: {
    left: 0,
    right: 0,
    bottom: 0,
  },
  reactionPickerDimLeft: {
    left: 0,
  },
  reactionPickerDimRight: {
    right: 0,
  },
  reactionPickerContent: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 28,
    backgroundColor: Colors.neutral[900],
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  reactionPickerButton: {
    width: REACTION_SHEET_CHIP_SIZE,
    height: REACTION_SHEET_CHIP_SIZE,
    borderRadius: REACTION_SHEET_CHIP_SIZE / 2,
    borderWidth: REACTION_CHIP_STYLE.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPickerEmoji: {
    fontSize: 24,
  },
  reactionPickerMoreButton: {
    borderLeftWidth: 1,
    borderLeftColor: REACTION_CHIP_STYLE.borderColorDefault,
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
    fontSize: 20,
  },
  reactionSheetActiveCount: {
    fontSize: 12,
    color: REACTION_CHIP_STYLE.countColor,
    fontFamily: 'Figtree-Medium',
  },
  reactionSheetActiveCountHighlight: {
    color: REACTION_CHIP_STYLE.countColorMine,
  },
  reactionSheetActiveCountOnColoredBg: {
    color: REACTION_CHIP_STYLE.countColorOnColoredBg,
  },
  reactionSheetActiveEmpty: {
    color: Colors.neutral[500],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
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
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[800],
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
  leftConvoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
