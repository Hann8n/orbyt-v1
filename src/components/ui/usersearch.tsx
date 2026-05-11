import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SquircleNativePressable } from './Squircle';
import { LinearGradient } from './LinearGradient';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import { AtprotoFeedService } from '../../services/api/feed/FeedService';
import AuthorItem from './AuthorItem';
import UI from './UI';
import { Colors } from './UI';
import { FontFamily, Typography, TextStyles } from '../../utils/components/typography';
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
  searchQuery: string;
  searchType: 'mention' | 'hashtag';
  containerStyle?: StyleProp<ViewStyle>;
  /** Use horizontal pill style (for comment footer) vs vertical list style (for video post screen) */
  horizontalPillStyle?: boolean;
}

// Helper functions are now imported from searchQueryExtractors

// Unified search banner component (handles both mentions and hashtags)
interface SearchBannerProps {
  visible: boolean;
  searchQuery: string;
  searchType: 'mention' | 'hashtag' | null;
  onSelectUser?: (user: UserProfile) => void;
  onSelectHashtag?: (hashtag: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  /** Use horizontal pill style (for comment footer) vs vertical list style (for video post screen) */
  horizontalPillStyle?: boolean;
}

function SearchBanner({
  visible,
  searchQuery,
  searchType,
  onSelectUser,
  onSelectHashtag,
  containerStyle,
  horizontalPillStyle = false,
}: SearchBannerProps) {
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Use shared profile search hook for mentions
  // Use a ref to track previous results and avoid flashing during search
  const prevUsersRef = useRef<UserProfile[]>([]);

  const {
    data: userData,
    isFetchingNextPage: isFetchingMoreUsers,
    fetchNextPage: fetchMoreUsers,
    hasNextPage: hasMoreUsers,
    isFetching: isFetchingUsers,
  } = useProfileSearch(deferredSearchQuery, {
    enabled: searchType === 'mention' && visible,
    staleTime: 30 * 1000,
  });

  const currentUsers = userData?.pages.flatMap(page => page.profiles) || [];
  // Keep showing previous results while loading new ones to prevent flashing
  const users = currentUsers.length > 0
    ? currentUsers
    : isFetchingUsers
      ? prevUsersRef.current
      : [];
  // Update ref when we have real results
  if (currentUsers.length > 0) {
    prevUsersRef.current = currentUsers;
  }

  // Hashtag suggestions from API — min 3 chars to avoid expensive searches on every keystroke
  const prevHashtagsRef = useRef<string[]>([]);

  const { data: hashtagSuggestionsData, isFetching: isFetchingHashtags } = useQuery<string[]>({
    queryKey: queryKeys.search.hashtags(deferredSearchQuery),
    queryFn: () => AtprotoFeedService.searchHashtagSuggestions(deferredSearchQuery, 10),
    enabled: searchType === 'hashtag' && deferredSearchQuery.length >= 3 && visible,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const currentHashtags = hashtagSuggestionsData ?? [];
  // Keep showing previous results while loading new ones to prevent flashing
  const hashtagSuggestions = currentHashtags.length > 0
    ? currentHashtags
    : isFetchingHashtags
      ? prevHashtagsRef.current
      : [];
  // Update ref when we have real results
  if (currentHashtags.length > 0) {
    prevHashtagsRef.current = currentHashtags;
  }

  if (!visible) return null;

  return (
    <View style={[styles.bannerContainer, containerStyle]}>
      {searchType === 'mention' && users.length > 0 ? (
        horizontalPillStyle ? (
          <View style={styles.listContainer}>
            <FlatList
              data={users}
              keyExtractor={(item, index) => `${item.did}-${index}`}
              horizontal
              renderItem={({ item }) => (
                <SquircleNativePressable
                  style={styles.horizontalPill}
                  onPress={() => onSelectUser?.(item)}
                >
                  <UI.Avatar
                    uri={item.avatar}
                    size={28}
                    style={styles.pillAvatar}
                  />
                  <Text style={styles.pillContent}>{item.handle}</Text>
                </SquircleNativePressable>
              )}
              onEndReached={() => {
                if (hasMoreUsers && !isFetchingMoreUsers) fetchMoreUsers();
              }}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              keyboardShouldPersistTaps="handled"
              style={styles.resultsList}
              contentContainerStyle={styles.horizontalListContent}
              scrollEnabled={true}
              showsHorizontalScrollIndicator={false}
            />
            <LinearGradient
              colors={['transparent', Colors.neutral[975]]}
              locations={[0, 1]}
              style={styles.horizontalFadeGradient}
              pointerEvents="none"
            />
          </View>
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
      ) : horizontalPillStyle && hashtagSuggestions.length > 0 ? (
        <View style={styles.listContainer}>
          <FlatList
            data={hashtagSuggestions}
            keyExtractor={item => item}
            horizontal
            renderItem={({ item }) => (
              <SquircleNativePressable
                style={styles.hashtagPill}
                onPress={() => onSelectHashtag?.(item)}
              >
                <Text style={styles.pillText}>
                  <Text style={styles.pillPrefix}>#</Text>
                  <Text style={styles.pillContent}>{item}</Text>
                </Text>
              </SquircleNativePressable>
            )}
            contentContainerStyle={styles.horizontalListContent}
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
          />
        </View>
      ) : hashtagSuggestions.length > 0 ? (
        <View style={styles.listContainer}>
          <FlatList
            data={hashtagSuggestions}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <SquircleNativePressable
                style={styles.verticalHashtagItem}
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
      ) : null}
    </View>
  );
}

// Legacy wrapper for backward compatibility
export function UserSearchModal({
  visible,
  onSelect,
  searchQuery,
}: UserSearchModalProps) {
  return (
    <SearchBanner
      visible={visible}
      searchQuery={searchQuery}
      searchType="mention"
      onSelectUser={onSelect}
    />
  );
}

// Legacy wrapper for backward compatibility
export function RichTextSearchModal({
  visible,
  onSelectUser,
  onSelectHashtag,
  searchQuery,
  searchType,
  containerStyle,
  horizontalPillStyle = false,
}: RichTextSearchModalProps) {
  return (
    <SearchBanner
      visible={visible}
      searchQuery={searchQuery}
      searchType={searchType}
      onSelectUser={onSelectUser}
      onSelectHashtag={onSelectHashtag}
      containerStyle={containerStyle}
      horizontalPillStyle={horizontalPillStyle}
    />
  );
}

// Unified hook to manage @ mentions and # hashtags in any TextInput
interface UseSearchTriggerProps extends UseUserSearchTriggerProps {
  /** Enable hashtag search (#) in addition to mention search (@) */
  enableHashtags?: boolean;
  /** Use horizontal pill style (for comment footer) vs vertical list style (for video post screen) */
  horizontalPillStyle?: boolean;
}

function useSearchTrigger({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  onMentionInsert,
  enableHashtags = false,
  horizontalPillStyle = false,
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
      horizontalPillStyle,
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
      horizontalPillStyle: modalProps.horizontalPillStyle,
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
    minHeight: 36,
    paddingVertical: 4,
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
  horizontalListContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 8,
  },
  horizontalFadeGradient: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 60,
  },
  // Shared horizontal pill style for profiles (with nested avatar)
  horizontalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 6,
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
  },
  // Hashtag pill (normal left padding, no avatar)
  hashtagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 6,
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.neutral[800],
  },
  pillAvatar: {
    flexShrink: 0,
    marginRight: 6,
  },
  pillText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pillPrefix: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.medium,
  },
  pillContent: {
    ...TextStyles.profileHandleSmall,
    color: Colors.neutral[50],
    textTransform: 'lowercase',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  // Vertical list hashtag style (unaffected)
  verticalHashtagItem: {
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
});
