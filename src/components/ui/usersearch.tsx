import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  type StyleProp,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { SquircleNativePressable } from './Squircle';
import { LinearGradient } from './LinearGradient';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import { AtprotoFeedService } from '../../services/api/feed/FeedService';
import AuthorItem from './AuthorItem';
import { Colors } from './UI';
import { FontFamily, Typography } from '../../utils/components/typography';
import { useProfileSearch, type UserProfile } from '../../hooks/useProfileSearch';
import { getSearchQuery } from '../../utils/searchQueryExtractors';

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

// Helper functions are now imported from searchQueryExtractors

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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  
  // Use shared profile search hook for mentions
  const {
    data: userData,
    isLoading: isLoadingUsers,
    isFetchingNextPage: isFetchingMoreUsers,
    fetchNextPage: fetchMoreUsers,
    hasNextPage: hasMoreUsers,
  } = useProfileSearch(deferredSearchQuery, {
    enabled: searchType === 'mention' && visible,
    staleTime: 30 * 1000,
  });

  const users = userData?.pages.flatMap(page => page.profiles) || [];

  // Hashtag suggestions from API — min 3 chars to avoid expensive searches on every keystroke
  const {
    data: hashtagSuggestionsData,
    isLoading: isLoadingHashtags,
  } = useQuery<string[]>({
    queryKey: queryKeys.search.hashtags(deferredSearchQuery),
    queryFn: () => AtprotoFeedService.searchHashtagSuggestions(deferredSearchQuery, 10),
    enabled: searchType === 'hashtag' && deferredSearchQuery.length >= 3 && visible,
    staleTime: 5 * 60 * 1000,
  });

  const hashtagSuggestions = hashtagSuggestionsData ?? [];

  if (!visible) return null;

  return (
    <View style={[styles.bannerContainer, containerStyle]}>
      {searchType === 'mention' ? (
        isLoadingUsers ? (
          <LoadingState />
        ) : users.length === 0 ? (
          <EmptyState message={t('feed.noUsersFound')} />
        ) : (
          <View style={styles.listContainer}>
            <FlatList
              data={users}
              keyExtractor={item => item.did}
              renderItem={({ item }) => (
                <AuthorItem
                  {...RICH_TEXT_SEARCH_AUTHOR_ITEM_DEFAULTS}
                  handle={item.handle}
                  did={item.did}
                  displayName={item.displayName}
                  avatar={item.avatar}
                  onPress={() => onSelectUser?.(item)}
                  style={RICH_TEXT_SEARCH_AUTHOR_ITEM_STYLE}
                />
              )}
              onEndReached={() => {
                if (hasMoreUsers && !isFetchingMoreUsers) fetchMoreUsers();
              }}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              keyboardShouldPersistTaps="handled"
              style={styles.resultsList}
              contentContainerStyle={styles.resultsListContent}
              scrollEnabled={true}
            />
            <LinearGradient
              colors={['transparent', Colors.neutral[975]]}
              locations={[0, 1]}
              style={styles.fadeGradient}
              pointerEvents="none"
            />
          </View>
        )
      ) : isLoadingHashtags ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      ) : hashtagSuggestions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('feed.noHashtagsFound')}</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={hashtagSuggestions}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <SquircleNativePressable
                style={styles.hashtagItem}
                onPress={() => onSelectHashtag?.(item)}
              >
                <Text style={styles.hashtagText}>
                  <Text style={styles.hashtagSymbol}>#</Text>
                  <Text style={styles.hashtagTag}>{item}</Text>
                </Text>
              </SquircleNativePressable>
            )}
            contentContainerStyle={styles.hashtagListContent}
            keyboardShouldPersistTaps="handled"
          />
        </View>
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
  const deferredValue = useDeferredValue(value);

  // Watch value/selection for @ mention or # hashtag using shared utility
  useEffect(() => {
    if (!selection) return undefined;
    
    const searchResult = getSearchQuery(deferredValue, selection.start, enableHashtags);
    
    // If modal is visible and user types a space, dismiss it.
    // Use the live `value` (not deferred) so the character at the current cursor is accurate.
    if (modalVisible && selection.start > 0 && value[selection.start - 1] === ' ') {
      setSearchQuery('');
      setSearchRange(null);
      setModalVisible(false);
      return;
    }

    if (searchResult) {
      setSearchQuery(searchResult.query.query);
      setSearchRange({ start: searchResult.query.start, end: searchResult.query.end });
      setSearchType(searchResult.type);
      setModalVisible(true);
    } else if (modalVisible) {
      setSearchQuery('');
      setSearchRange(null);
      setModalVisible(false);
    }
  }, [value, deferredValue, selection, modalVisible, enableHashtags]);

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
      autoCorrect: false,
      autoCapitalize: 'none' as const,
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
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.overlay.black85,
    zIndex: 1000,
  },
  modal: {
    backgroundColor: Colors.neutral[975],
    borderTopLeftRadius: BORDER_RADIUS.LARGE,
    borderTopRightRadius: BORDER_RADIUS.LARGE,
    maxHeight: '50%',
    minHeight: 200,
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.neutral[400],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    width: '100%',
  },
  resultsList: {
    flex: 1,
    width: '100%',
  },
  resultsListContent: {
    paddingHorizontal: 0,
    paddingBottom: 40,
  },
  fadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  hashtagListContent: {
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.LARGE,
    marginBottom: 0,
    backgroundColor: Colors.neutral[975],
  },
  hashtagText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
  },
  hashtagSymbol: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
  },
  hashtagTag: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.bold,
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
