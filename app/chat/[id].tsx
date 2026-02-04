import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
  useWindowDimensions,
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
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../src/utils/components/truesheet/utils';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import { Colors } from '../../src/theme';
import { BORDER_RADIUS } from '../../src/utils/constants';
import Icon, { BackArrowIcon, MoreFillIcon } from '../../src/components/ui/Icon';
import { Avatar } from '../../src/components/ui/UI';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { itemSizeConfig, sharedItemStyles } from '../../src/components/ui/ItemStyles';
import { useOrbytColors } from '../../src/hooks/useOrbytColors';
import { getProfileColors, hexToRGBA, pickLighterHex } from '../../src/utils/formatting/colors';
import { formatHandle } from '../../src/utils/formatting/handles';
import { queryKeys } from '../../src/utils/query/queryKeys';
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
import EmojiPicker from 'react-native-emoji-chooser';

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
} as const;

/** Display reactions under a message; overlapping stack like face pile; accent for sent messages */
function MessageReactions({
  reactions,
  currentUserDid,
  isFromMe,
  accentColor,
}: {
  reactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  isFromMe: boolean;
  accentColor?: string;
}) {
  const grouped = groupReactions(reactions, currentUserDid);
  if (grouped.length === 0) return null;
  return (
    <View style={[styles.reactionsRow, isFromMe && styles.reactionsRowFromMe]}>
      {grouped.map(({ value, count, includesMe }, index) => {
        const isPill = count > 1;
        const useAccent = isFromMe ? includesMe : true;
        const bg = useAccent
          ? (accentColor ?? REACTION_CHIP_STYLE.bgMine)
          : REACTION_CHIP_STYLE.bgDefault;
        const chipStyle = getReactionChipStyle({ isPill, index, bg });
        return (
          <View key={value} style={[styles.reactionChip, chipStyle]}>
            <Text style={styles.reactionEmoji}>{value}</Text>
            {count > 1 && (
              <Text
                style={[
                  styles.reactionCount,
                  useAccent && accentColor
                    ? styles.reactionCountOnAccent
                    : includesMe && styles.reactionCountHighlight,
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
const PICKER_OFFSET_ABOVE = 12;
const SCREEN_PADDING = 16;

/** Overlay: positioned quick-reaction pill at touch; + opens full picker sheet */
function ReactionOverlayModal({
  visible,
  touchPosition,
  onDismiss,
  onSelect,
  onOpenFullPicker,
  currentReactions,
  currentUserDid,
  accentColor,
}: {
  visible: boolean;
  touchPosition: { x: number; y: number } | null;
  onDismiss: () => void;
  onSelect: (value: string) => void;
  onOpenFullPicker: () => void;
  currentReactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  accentColor?: string;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const position = useMemo(() => {
    if (!touchPosition) {
      return { left: screenWidth / 2 - PICKER_WIDTH_EST / 2, top: 100 };
    }
    const left = Math.max(
      SCREEN_PADDING,
      Math.min(
        screenWidth - PICKER_WIDTH_EST - SCREEN_PADDING,
        touchPosition.x - PICKER_WIDTH_EST / 2
      )
    );
    const preferredTop = touchPosition.y - PICKER_HEIGHT_EST - PICKER_OFFSET_ABOVE;
    const top =
      preferredTop < SCREEN_PADDING
        ? touchPosition.y + PICKER_OFFSET_ABOVE
        : Math.min(preferredTop, screenHeight - PICKER_HEIGHT_EST - SCREEN_PADDING);
    return { left, top };
  }, [touchPosition, screenWidth, screenHeight]);

  const positionStyle = useMemo(
    () => ({ left: position.left, top: position.top }),
    [position.left, position.top]
  );
  const hasReaction = (value: string) =>
    currentReactions?.some(r => r.value === value && r.sender?.did === currentUserDid) ?? false;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.reactionPickerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[styles.reactionPickerContent, positionStyle]}>
          {QUICK_REACTIONS.map(value => {
            const selected = hasReaction(value);
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.reactionPickerButton,
                  {
                    backgroundColor: selected
                      ? (accentColor ?? REACTION_CHIP_STYLE.bgMine)
                      : REACTION_CHIP_STYLE.bgDefault,
                    borderColor: REACTION_CHIP_STYLE.borderColorDefault,
                  },
                  selected && { borderColor: accentColor ?? REACTION_CHIP_STYLE.borderColorMine },
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

/** TrueSheet with full emoji picker; opened when user taps + on overlay */
function ReactionPickerSheet({
  visible,
  onDismiss,
  onSelect,
  currentReactions,
  currentUserDid,
  accentColor,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (value: string) => void;
  currentReactions: ReactionShape[] | undefined;
  currentUserDid: string | undefined;
  accentColor?: string;
}) {
  const sheetRef = useRef<TrueSheet>(null);
  const { height: screenHeight } = useWindowDimensions();
  const grouped = useMemo(
    () => groupReactions(currentReactions, currentUserDid),
    [currentReactions, currentUserDid]
  );
  useEffect(() => {
    if (visible) {
      safePresent(REACTION_PICKER_SHEET_NAME).catch(() => {});
    } else {
      safeDismiss(REACTION_PICKER_SHEET_NAME).catch(() => {});
    }
  }, [visible]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      safeDismiss(REACTION_PICKER_SHEET_NAME)
        .then(onDismiss)
        .catch(() => {});
    },
    [onSelect, onDismiss]
  );

  return (
    <TrueSheet
      ref={sheetRef}
      name={REACTION_PICKER_SHEET_NAME}
      detents={['auto']}
      maxHeight={Math.round(screenHeight * 0.75)}
      backgroundColor={Colors.neutral[900]}
      onDidDismiss={onDismiss}
      grabber
      grabberOptions={{
        width: 42,
        height: 4,
        topMargin: 8,
        cornerRadius: 2,
        color: 'rgba(243, 245, 254, 0.5)',
        adaptive: false,
      }}
      insetAdjustment="never"
      scrollable
      header={
        <View style={styles.reactionSheetHeader}>
          {grouped.length > 0 ? (
            <View style={styles.reactionSheetActiveChips}>
              {grouped.map(({ value, count, includesMe }) => {
                const isPill = count > 1;
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
                        backgroundColor:
                          accentColor ??
                          (includesMe ? REACTION_CHIP_STYLE.bgMine : REACTION_CHIP_STYLE.bgDefault),
                        borderColor:
                          accentColor ??
                          (includesMe
                            ? REACTION_CHIP_STYLE.borderColorMine
                            : REACTION_CHIP_STYLE.borderColorDefault),
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={styles.reactionSheetActiveEmoji}>{value}</Text>
                    {count > 1 && (
                      <Text
                        style={[
                          styles.reactionSheetActiveCount,
                          includesMe && styles.reactionSheetActiveCountHighlight,
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
    </TrueSheet>
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
  onLongPress?: (e: { nativeEvent: { pageX: number; pageY: number } }) => void;
  delayLongPress?: number;
}) {
  const router = useRouter();
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
            onLongPress={onLongPress}
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
            <SkiaGradientOverlay style={styles.embedVideoAuthorOverlay} pointerEvents="none">
              <EmbedAuthor author={author} size={20} isFromMe={isFromMe} compact />
            </SkiaGradientOverlay>
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
      onLongPress={onLongPress}
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
  const sentMessageAccentBorderStyle = useMemo(
    () => ({ borderRightColor: sentMessageAccentColor }),
    [sentMessageAccentColor]
  );
  const otherUserAccentColor =
    pickLighterHex(profileColors.backgroundColor, profileColors.foregroundColor) ||
    Colors.neutral[700];
  const otherMessageAccentBorderStyle = useMemo(
    () => ({ borderLeftColor: otherUserAccentColor }),
    [otherUserAccentColor]
  );
  const headerConfig = itemSizeConfig.large;
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showReportOrBlockSheet, setShowReportOrBlockSheet] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionPickerTouch, setReactionPickerTouch] = useState<{ x: number; y: number } | null>(
    null
  );
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false);

  const { data: convo } = useQuery({
    queryKey: queryKeys.chat.conversations.detail(convoId),
    queryFn: () => ChatService.getConvo(convoId),
    enabled: !!convoId,
  });

  const isConvoMuted = (convo as { muted?: boolean } | null)?.muted ?? false;
  const convoStatus = (convo as { status?: 'request' | 'accepted' } | null)?.status;
  const needsAccept = convoStatus === 'request';
  const blockMutation = useBlockMutation();
  const isBlocked = !!(profile?.viewer?.blocking || profile?.viewer?.blockingByList);
  const isBlockedByList = !!profile?.viewer?.blockingByList;

  const { data: messagesData } = useQuery({
    queryKey: queryKeys.chat.messages.byConversation(convoId),
    queryFn: () => ChatService.getMessages(convoId, null),
    enabled: !!convoId,
    refetchOnWindowFocus: false,
  });

  // Merge new messages/reactions from getLog into cache so chats update in near real time
  useChatLogPolling(convoId, queryClient);

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
      setReactionPickerMessageId(null);
      if (context?.prev != null) {
        queryClient.setQueryData(queryKeys.chat.messages.byConversation(convoId), context.prev);
      }
    },
    onSuccess: () => {
      setReactionPickerMessageId(null);
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

  useEffect(() => {
    if (!convoId) return;
    readSyncRef.current = { convoId, latestMessageId };

    const markRead = () => {
      ChatService.updateRead(convoId, latestMessageId)
        .then(() => {
          void queryClient.refetchQueries({ queryKey: queryKeys.unread.summary() });
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
        })
        .catch(() => {});
    };

    markRead();

    return () => {
      const { convoId: cid, latestMessageId: mid } = readSyncRef.current;
      if (cid) {
        ChatService.updateRead(cid, mid)
          .then(() => {
            void queryClient.refetchQueries({ queryKey: queryKeys.unread.summary() });
            queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
          })
          .catch(() => {});
      }
    };
  }, [convoId, latestMessageId, queryClient]);

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
      const record =
        hasEmbed && msg.embed ? (msg.embed as { record?: EmbedRecordShape }).record : undefined;
      const hasVideoEmbed = !!record && !!getVideoViewFromRecordEmbeds(record.embeds);
      const onLongPress = (e: { nativeEvent: { pageX: number; pageY: number } }) => {
        setReactionPickerMessageId(msg.id);
        setReactionPickerTouch({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      };
      return (
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={400}
          style={[
            styles.messageRow,
            isFromMe ? styles.messageRowFromMe : styles.messageRowFromThem,
            isNewSender && styles.messageRowNewSender,
            isFromMe && !hasEmbed && sentMessageAccentBorderStyle,
            !isFromMe && !hasEmbed && otherMessageAccentBorderStyle,
            hasEmbed && styles.messageRowEmbed,
            hasVideoEmbed && styles.messageRowVideoEmbed,
          ]}
        >
          {msg.text != null && msg.text !== '' && (
            <Text style={[styles.messageText, isFromMe && styles.messageTextFromMe]}>
              {msg.text}
            </Text>
          )}
          {hasEmbed && msg.embed && (
            <ChatEmbeddedPost
              embed={msg.embed}
              isFromMe={!!isFromMe}
              onLongPress={onLongPress}
              delayLongPress={400}
            />
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
              accentColor={isFromMe ? sentMessageAccentColor : otherUserAccentColor}
            />
            {isFromMe && item.showTime && msg.sentAt && (
              <Text style={[styles.messageTime, styles.messageTimeFromMe]}>
                {formatMessageTime(msg.sentAt)}
              </Text>
            )}
          </View>
        </Pressable>
      );
    },
    [
      currentUserDid,
      sentMessageAccentColor,
      otherUserAccentColor,
      sentMessageAccentBorderStyle,
      otherMessageAccentBorderStyle,
    ]
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
    if (!reactionPickerMessageId) return null;
    const raw = messagesData?.messages ?? [];
    return (
      (raw.find((m: { id?: string }) => m.id === reactionPickerMessageId) as
        | MessageItem
        | undefined) ?? null
    );
  }, [reactionPickerMessageId, messagesData?.messages]);

  const pickerMessageAccentColor =
    pickerMessage?.sender?.did === currentUserDid ? sentMessageAccentColor : otherUserAccentColor;

  const canSend = !needsAccept && inputText.trim().length > 0 && !sendMessageMutation.isPending;
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
              ringColor={otherUserAccentColor}
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

      <ReactionOverlayModal
        visible={!!reactionPickerMessageId && !showFullEmojiPicker}
        touchPosition={reactionPickerTouch}
        onDismiss={() => {
          setReactionPickerMessageId(null);
          setReactionPickerTouch(null);
        }}
        onSelect={value => {
          if (reactionPickerMessageId) handleReactionSelect(reactionPickerMessageId, value);
          setReactionPickerMessageId(null);
          setReactionPickerTouch(null);
        }}
        onOpenFullPicker={() => setShowFullEmojiPicker(true)}
        currentReactions={pickerMessage?.reactions}
        currentUserDid={currentUserDid ?? undefined}
        accentColor={pickerMessageAccentColor}
      />

      <ReactionPickerSheet
        visible={showFullEmojiPicker}
        onDismiss={() => {
          setShowFullEmojiPicker(false);
          setReactionPickerMessageId(null);
          setReactionPickerTouch(null);
        }}
        onSelect={value => {
          if (reactionPickerMessageId) handleReactionSelect(reactionPickerMessageId, value);
          setShowFullEmojiPicker(false);
          setReactionPickerMessageId(null);
          setReactionPickerTouch(null);
        }}
        currentReactions={pickerMessage?.reactions}
        currentUserDid={currentUserDid ?? undefined}
        accentColor={pickerMessageAccentColor}
      />

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

      <VerticalListSheet
        visible={showReportOrBlockSheet}
        onDismiss={() => setShowReportOrBlockSheet(false)}
        title="Report or block"
        showCancelButton
        cancelButtonText="Cancel"
        name="chat-report-or-block"
        detents={['auto']}
      >
        <View style={styles.menuOptionsContainer}>
          <VerticalListButton
            label={isBlocked ? 'Unblock account' : 'Block account'}
            onPress={() => {
              setShowReportOrBlockSheet(false);
              handleBlockToggle();
            }}
            disabled={blockMutation.isPending || isBlockedByList}
          />
          <VerticalListButton
            label="Report conversation"
            onPress={() => {
              setShowReportOrBlockSheet(false);
              handleReportConversation();
            }}
            disabled={isReportSubmitting}
          />
        </View>
      </VerticalListSheet>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {listData.length > 0 ? (
          <FlashList
            data={listData}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            getItemType={(item: ChatListItem) => (item.type === 'date' ? 'date' : 'message')}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{
              startRenderingFromBottom: true,
              autoscrollToBottomThreshold: 100,
            }}
          />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {messagesData ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No messages yet</Text>
              </View>
            ) : null}
          </ScrollView>
        )}

        {needsAccept ? (
          <View style={[styles.acceptBar, { paddingBottom: inputBottom }]}>
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
                  onPress={() => setShowReportOrBlockSheet(true)}
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
        )}
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
    borderBottomColor: Colors.neutral[800],
  },
  acceptBar: {
    paddingHorizontal: 10,
    paddingTop: 10,
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
    justifyContent: 'flex-end',
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
  messageRowEmbed: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  messageRowVideoEmbed: {
    paddingLeft: 0,
    paddingRight: 0,
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
  reactionCountHighlight: {
    color: REACTION_CHIP_STYLE.countColorMine,
  },
  reactionCountOnAccent: {
    color: REACTION_CHIP_STYLE.countColorMine,
  },
  reactionPickerBackdrop: {
    flex: 1,
    backgroundColor: hexToRGBA(Colors.black, 0.4),
  },
  reactionPickerContent: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    paddingTop: 8,
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
});
