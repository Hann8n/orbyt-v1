import { useState, useEffect, useRef, useCallback } from 'react';

/** Debounce helper for selection changes */
function useDebouncedSelection(
  selection: { start: number; end: number } | null,
  delay: number = 50
) {
  const [debounced, setDebounced] = useState(selection);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setDebounced(selection);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [selection, delay]);

  return debounced;
}
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type StyleProp,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { SquircleNativePressable } from './Squircle';
import { useInfiniteQuery, InfiniteData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import { ActorService } from '../../services/api/actor/ActorService';
import { AtprotoFeedService } from '../../services/api/feed/FeedService';
import { Colors, Avatar as UIAvatar } from './UI';
import { Typography, FontFamily } from '../../utils/components/typography';

// Types
export interface UserProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** Author row styling for `RichTextSearchModal` (video post description @/# search) and matching surfaces. */
export const RICH_TEXT_SEARCH_AUTHOR_ITEM_STYLE: ViewStyle = {
  paddingVertical: 6,
  paddingHorizontal: 12,
  marginBottom: 6,
};

/** Default `AuthorItem` props for rich-text user search (same as video post description mention picker). */
export const RICH_TEXT_SEARCH_AUTHOR_ITEM_DEFAULTS = {
  textColor: Colors.neutral[50],
  backgroundColor: Colors.neutral[975],
  size: 'large' as const,
  hideHandleLine: false,
  showArrow: false,
};

interface UserSearchModalProps {
  visible: boolean;
  onSelect: (user: UserProfile) => void;
  onRequestClose: () => void;
  searchQuery: string;
}

interface UseUserSearchTriggerProps {
  value: string;
  selection: { start: number; end: number };
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  onMentionInsert?: (user: UserProfile) => void;
}

export interface RichTextSearchModalProps {
  visible: boolean;
  onSelectUser?: (user: UserProfile) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onRequestClose: () => void;
  searchQuery: string;
  searchType: 'mention' | 'hashtag';
  containerStyle?: StyleProp<ViewStyle>;
}

// Helper: extract @mention query from text and cursor position
function getMentionQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|\s)@([\w.-]*)$/.exec(beforeCursor);
  if (match) {
    return {
      query: match[2],
      start: match.index + match[1].length,
      end: cursor,
    };
  }
  return null;
}

// Helper: extract #hashtag query from text and cursor position
function getHashtagQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|\s)#([\w]*)$/.exec(beforeCursor);
  if (match) {
    return {
      query: match[2],
      start: match.index + match[1].length,
      end: cursor,
    };
  }
  return null;
}

// Sub-components

const LoadingState = () => (
  <View style={styles.loadingWrapper}>
    <ActivityIndicator size="small" color={Colors.neutral[400]} />
  </View>
);

const EmptyState = ({ message }: { message: string }) => (
  <View style={styles.emptyWrapper}>
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

const UserPill = ({ user, onPress }: { user: UserProfile; onPress: () => void }) => (
  <SquircleNativePressable
    style={styles.compactUserCard}
    onPress={onPress}
  >
    <UIAvatar uri={user.avatar} size={24} style={styles.compactAvatar} />
    <Text style={styles.compactHandle} numberOfLines={1}>
      {user.handle}
    </Text>
  </SquircleNativePressable>
);

const HashtagPill = ({ tag, onPress }: { tag: string; onPress: () => void }) => (
  <SquircleNativePressable
    style={styles.hashtagItem}
    onPress={onPress}
  >
    <Text style={styles.hashtagSymbol}>#</Text>
    <Text style={styles.hashtagTag}>{tag}</Text>
  </SquircleNativePressable>
);

// Unified search banner component (handles both mentions and hashtags)
interface SearchBannerProps {
  visible: boolean;
  searchQuery: string;
  searchType: 'mention' | 'hashtag' | null;
  onSelectUser?: (user: UserProfile) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onRequestClose: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

function SearchBanner({
  visible,
  searchQuery,
  searchType,
  onSelectUser,
  onSelectHashtag,
  onRequestClose,
  containerStyle,
}: SearchBannerProps) {
  const { t } = useTranslation();

  // User search query
  const {
    data: userData,
    isLoading: isLoadingUsers,
  } = useInfiniteQuery<
    { profiles: UserProfile[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: UserProfile[]; cursor: string | null }, string | null>,
    ReturnType<typeof queryKeys.search.profiles>,
    string | null
  >({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return ActorService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: visible && searchType === 'mention' && searchQuery.length > 0,
    staleTime: 30 * 1000,
  });

  const users = userData?.pages.flatMap(page => page.profiles) || [];

  // Hashtag suggestions from API — min 3 chars to avoid expensive searches on every keystroke
  const { data: hashtagSuggestionsData, isLoading: isLoadingHashtags, error: hashtagError } = useQuery<
    { hashtags: string[] },
    Error,
    { hashtags: string[] },
    ReturnType<typeof queryKeys.search.hashtags>
  >({
    queryKey: queryKeys.search.hashtags(searchQuery),
    queryFn: async () => {
      const hashtags = await AtprotoFeedService.searchHashtagSuggestions(searchQuery, 10);
      return { hashtags };
    },
    enabled: visible && searchType === 'hashtag' && searchQuery.length >= 3,
    staleTime: 5 * 60 * 1000,
  });

  const hashtagSuggestions = searchType === 'hashtag' ? (hashtagSuggestionsData?.hashtags || []) : [];

  if (!visible) return null;

  return (
    <View style={[styles.bannerContainer, containerStyle]}>
      {searchType === 'mention' ? (
        isLoadingUsers ? (
          <LoadingState />
        ) : users.length === 0 ? (
          <EmptyState message={t('feed.noUsersFound')} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.horizontalListContent}
          >
            {users.map(user => (
              <UserPill
                key={user.did}
                user={user}
                onPress={() => {
                  onSelectUser?.(user);
                }}
              />
            ))}
          </ScrollView>
        )
      ) : searchQuery.length < 3 ? (
        <EmptyState message={t('feed.typeMoreForHashtags')} />
      ) : isLoadingHashtags ? (
        <LoadingState />
      ) : hashtagError ? (
        <EmptyState message={t('feed.errorLoadingHashtags')} />
      ) : hashtagSuggestions.length === 0 ? (
        <EmptyState message={t('feed.noHashtagsFound')} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.horizontalListContent}
        >
          {hashtagSuggestions.map(tag => (
            <HashtagPill
              key={tag}
              tag={tag}
              onPress={() => {
                onSelectHashtag?.(tag);
                onRequestClose();
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// Legacy wrapper for backward compatibility
export function UserSearchModal({
  visible,
  onSelect,
  onRequestClose,
  searchQuery,
}: UserSearchModalProps) {
  return (
    <SearchBanner
      visible={visible}
      searchQuery={searchQuery}
      searchType="mention"
      onSelectUser={onSelect}
      onRequestClose={onRequestClose}
    />
  );
}

// Legacy wrapper for backward compatibility
export function RichTextSearchModal({
  visible,
  onSelectUser,
  onSelectHashtag,
  onRequestClose,
  searchQuery,
  searchType,
  containerStyle,
}: RichTextSearchModalProps) {
  return (
    <SearchBanner
      visible={visible}
      searchQuery={searchQuery}
      searchType={searchType}
      onSelectUser={onSelectUser}
      onSelectHashtag={onSelectHashtag}
      onRequestClose={onRequestClose}
      containerStyle={containerStyle}
    />
  );
}

// Unified hook to manage @ mentions and # hashtags in any TextInput
interface UseSearchTriggerProps extends UseUserSearchTriggerProps {
  /** Enable hashtag search (#) in addition to mention search (@) */
  enableHashtags?: boolean;
}

function useSearchTrigger({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  onMentionInsert,
  enableHashtags = false,
}: UseSearchTriggerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'mention' | 'hashtag'>('mention');
  const [searchRange, setSearchRange] = useState<{ start: number; end: number } | null>(null);
  
  // Track cursor position after insertion for controlled selection prop
  const pendingCursorPosRef = useRef<number | null>(null);
  
  // Debounce selection for mention detection (reduces re-renders during typing)
  const debouncedSelection = useDebouncedSelection(selection, 50);

  // Watch value/selection for @ mention or # hashtag
  useEffect(() => {
    if (!debouncedSelection) return;
    
    const cursor = debouncedSelection.start;

    // If modal is visible and user types a space, dismiss it
    if (modalVisible && cursor > 0 && value[cursor - 1] === ' ') {
      setSearchQuery('');
      setSearchRange(null);
      setModalVisible(false);
      return;
    }

    if (enableHashtags) {
      const hashtag = getHashtagQuery(value, cursor);
      if (hashtag) {
        setSearchQuery(hashtag.query);
        setSearchRange({ start: hashtag.start, end: hashtag.end });
        setSearchType('hashtag');
        setModalVisible(true);
        return;
      }
    }

    const mention = getMentionQuery(value, cursor);
    if (mention && mention.query.length > 0) {
      setSearchQuery(mention.query);
      setSearchRange({ start: mention.start, end: mention.end });
      setSearchType('mention');
      setModalVisible(true);
    } else if (modalVisible) {
      setSearchQuery('');
      setSearchRange(null);
      setModalVisible(false);
    }
  }, [value, debouncedSelection, modalVisible, enableHashtags]);

  // Clear pending cursor position after it's been applied
  useEffect(() => {
    if (pendingCursorPosRef.current !== null && selection.start === pendingCursorPosRef.current) {
      pendingCursorPosRef.current = null;
    }
  }, [selection]);

  // Insert selected user at the mention position
  const handleSelectUser = useCallback((user: UserProfile) => {
    if (!searchRange || searchType !== 'mention') return;
    const before = value.slice(0, searchRange.start);
    const after = value.slice(searchRange.end);
    const insert = `@${user.handle} `;
    const newValue = before + insert + after;
    const newCursorPos = searchRange.start + insert.length;
    
    // Store the intended cursor position for controlled selection prop
    pendingCursorPosRef.current = newCursorPos;
    
    onChangeText(newValue);
    setModalVisible(false);
    setSearchQuery('');
    setSearchRange(null);
    onMentionInsert?.(user);
  }, [searchRange, searchType, value, onChangeText, onMentionInsert]);

  // Insert selected hashtag at the hashtag position
  const handleSelectHashtag = useCallback((hashtag: string) => {
    if (!searchRange || searchType !== 'hashtag') return;
    const before = value.slice(0, searchRange.start);
    const after = value.slice(searchRange.end);
    const insert = `#${hashtag} `;
    const newValue = before + insert + after;
    const newCursorPos = searchRange.start + insert.length;
    
    // Store the intended cursor position for controlled selection prop
    pendingCursorPosRef.current = newCursorPos;
    
    onChangeText(newValue);
    setModalVisible(false);
    setSearchQuery('');
    setSearchRange(null);
  }, [searchRange, searchType, value, onChangeText]);

  // Compute selection prop: use pending position if available, otherwise undefined (uncontrolled)
  const selectionProp = pendingCursorPosRef.current !== null
    ? { start: pendingCursorPosRef.current, end: pendingCursorPosRef.current }
    : undefined;

  return {
    inputProps: {
      value,
      onChangeText,
      onSelectionChange,
      selection: selectionProp,
    },
    modalProps: {
      visible: modalVisible,
      searchQuery,
      searchType,
      onSelectUser: handleSelectUser,
      onSelectHashtag: handleSelectHashtag,
      onRequestClose: () => setModalVisible(false),
    },
  };
}

// Legacy wrapper for backward compatibility
export function useUserSearchTrigger(props: UseUserSearchTriggerProps) {
  const { inputProps, modalProps } = useSearchTrigger({ ...props, enableHashtags: false });
  return {
    inputProps,
    userSearchModalProps: {
      visible: modalProps.visible,
      searchQuery: modalProps.searchQuery,
      onSelect: modalProps.onSelectUser,
      onRequestClose: modalProps.onRequestClose,
    },
  };
}

// Legacy wrapper for backward compatibility
export function useRichTextSearchTrigger(props: UseUserSearchTriggerProps) {
  const { inputProps, modalProps } = useSearchTrigger({ ...props, enableHashtags: true });
  return {
    inputProps,
    richTextSearchModalProps: {
      visible: modalProps.visible,
      searchQuery: modalProps.searchQuery,
      searchType: modalProps.searchType,
      onSelectUser: modalProps.onSelectUser,
      onSelectHashtag: modalProps.onSelectHashtag,
      onRequestClose: modalProps.onRequestClose,
    },
  };
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: Colors.neutral[975],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.neutral[925],
    width: '100%',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 0,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  horizontalListContent: {
    paddingHorizontal: 16,
    paddingVertical: 0,
    gap: 4,
    alignItems: 'flex-start',
  },
  loadingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    width: '100%',
  },
  emptyWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    width: '100%',
  },
  emptyText: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 6,
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    flexShrink: 0,
  },
  hashtagSymbol: {
    color: Colors.neutral[50],
    fontFamily: FontFamily.regular,
    fontSize: Typography.sizes.body,
  },
  hashtagTag: {
    color: Colors.neutral[50],
    fontFamily: FontFamily.bold,
    fontSize: Typography.sizes.body,
  },
  compactUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginRight: 6,
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
    gap: 6,
  },
  compactAvatar: {
    flexShrink: 0,
  },
  compactHandle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.bold,
    flex: 1,
    textAlign: 'left',
    paddingRight: 4,
  },
});
