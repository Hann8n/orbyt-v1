import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { View, Text, FlatList, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import AtprotoService from '../../services/api/AtprotoService';
// Avatar import removed – using AuthorItem instead
import AuthorItem from './AuthorItem';
import { Colors } from './UI';
// VerificationBadge import removed – badges rendered via AuthorItem
import { Loading3FillIcon } from './Icon';

// Types
interface UserProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface AnchorPosition {
  x: number;
  y: number;
}

interface UserSearchModalProps {
  visible: boolean;
  onSelect: (user: UserProfile) => void;
  onRequestClose: () => void;
  searchQuery: string;
  anchorPosition?: AnchorPosition;
}

interface UseUserSearchTriggerProps {
  value: string;
  selection: { start: number; end: number };
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  onMentionInsert?: (user: UserProfile) => void;
}

interface HashtagSuggestion {
  tag: string;
}

interface RichTextSearchModalProps {
  visible: boolean;
  onSelectUser?: (user: UserProfile) => void;
  onSelectHashtag?: (hashtag: string) => void;
  onRequestClose: () => void;
  searchQuery: string;
  searchType: 'mention' | 'hashtag';
  anchorPosition?: AnchorPosition;
  containerStyle?: any;
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

// UserSearch overlay component (not a Modal)
export function UserSearchModal({
  visible,
  onSelect,
  onRequestClose: _onRequestClose,
  searchQuery,
  anchorPosition,
}: UserSearchModalProps) {
  // Use the same search as ExploreScreen
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
    refetch: _refetch,
  } = useInfiniteQuery<
    { profiles: UserProfile[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: UserProfile[]; cursor: string | null }, string | null>,
    ReturnType<typeof queryKeys.search.profiles>,
    string | null
  >({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: !!searchQuery && searchQuery.length > 0 && visible,
    staleTime: 30 * 1000,
  });

  const profiles = data?.pages.flatMap(page => page.profiles) || [];

  if (!visible) return null;

  return (
    <View
      style={[
        styles.overlay,
        anchorPosition ? { left: anchorPosition.x, top: anchorPosition.y } : null,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.modal}>
        {isLoading ? (
          <View style={styles.centered}>
            <Loading3FillIcon size={48} color={Colors.white} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Error loading users</Text>
          </View>
        ) : profiles.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={item => item.did}
            renderItem={({ item }) => (
              <AuthorItem
                handle={item.handle}
                displayName={item.displayName}
                avatar={item.avatar}
                textColor={Colors.white}
                backgroundColor={Colors.darkGray}
                size="medium"
                hideHandleLine={true}
                showArrow={false}
                onPress={() => onSelect(item)}
              />
            )}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 260 }}
          />
        )}
      </View>
      {/* Dismiss area (optional):
      <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
      */}
    </View>
  );
}

// Rich text search modal component (handles both mentions and hashtags)
export function RichTextSearchModal({
  visible,
  onSelectUser,
  onSelectHashtag,
  onRequestClose: _onRequestClose,
  searchQuery,
  searchType,
  anchorPosition: _anchorPosition,
  containerStyle,
}: RichTextSearchModalProps) {
  // User search query
  const {
    data: userData,
    isLoading: isLoadingUsers,
    isFetchingNextPage: isFetchingMoreUsers,
    fetchNextPage: fetchMoreUsers,
    hasNextPage: hasMoreUsers,
  } = useInfiniteQuery<
    { profiles: UserProfile[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: UserProfile[]; cursor: string | null }, string | null>,
    ReturnType<typeof queryKeys.search.profiles>,
    string | null
  >({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: searchType === 'mention' && !!searchQuery && searchQuery.length > 0 && visible,
    staleTime: 30 * 1000,
  });

  const users = userData?.pages.flatMap(page => page.profiles) || [];

  // Hashtag suggestions from API
  const { data: hashtagSuggestionsData, isLoading: isLoadingHashtags } = useInfiniteQuery<
    { hashtags: string[] },
    Error,
    InfiniteData<{ hashtags: string[] }, string | null>,
    any[],
    string | null
  >({
    queryKey: ['hashtagSuggestions', searchQuery],
    queryFn: async () => {
      const hashtags = await AtprotoService.searchHashtagSuggestions(searchQuery, 10);
      return { hashtags };
    },
    getNextPageParam: () => null, // No pagination for suggestions
    initialPageParam: null,
    enabled: searchType === 'hashtag' && visible,
    staleTime: 30 * 1000,
  });

  const hashtagSuggestions: HashtagSuggestion[] = React.useMemo(() => {
    if (searchType !== 'hashtag') return [];
    const hashtags = hashtagSuggestionsData?.pages[0]?.hashtags || [];
    return hashtags.map(tag => ({ tag }));
  }, [hashtagSuggestionsData, searchType]);

  if (!visible) return null;

  return (
    <View style={[styles.richTextSearchContainer, containerStyle]}>
      {searchType === 'mention' ? (
        isLoadingUsers ? (
          <View style={styles.centered}>
            <Loading3FillIcon size={48} color={Colors.white} />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <FlatList
              data={users}
              keyExtractor={item => item.did}
              renderItem={({ item }) => (
                <AuthorItem
                  handle={item.handle}
                  displayName={item.displayName}
                  avatar={item.avatar}
                  textColor={Colors.white}
                  backgroundColor={Colors.black}
                  size="large"
                  hideHandleLine={false}
                  showArrow={false}
                  onPress={() => onSelectUser?.(item)}
                  style={{
                    marginBottom: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                    paddingTop: 10,
                    paddingBottom: 10,
                  }}
                />
              )}
              onEndReached={() => {
                if (hasMoreUsers && !isFetchingMoreUsers) fetchMoreUsers();
              }}
              onEndReachedThreshold={0.5}
              keyboardShouldPersistTaps="handled"
              style={styles.resultsList}
              contentContainerStyle={styles.resultsListContent}
              scrollEnabled={true}
            />
            <LinearGradient
              colors={['transparent', Colors.black]}
              locations={[0, 1]}
              style={styles.fadeGradient}
              pointerEvents="none"
            />
          </View>
        )
      ) : isLoadingHashtags ? (
        <View style={styles.centered}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      ) : hashtagSuggestions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No hashtags found</Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={hashtagSuggestions}
            keyExtractor={item => item.tag}
            renderItem={({ item }) => (
              <Pressable style={styles.hashtagItem} onPress={() => onSelectHashtag?.(item.tag)}>
                <Text style={styles.hashtagText}>
                  <Text style={styles.hashtagSymbol}>#</Text>
                  <Text style={styles.hashtagTag}>{item.tag}</Text>
                </Text>
              </Pressable>
            )}
            contentContainerStyle={styles.hashtagListContent}
            keyboardShouldPersistTaps="handled"
            style={styles.resultsList}
            scrollEnabled={true}
          />
          <LinearGradient
            colors={['transparent', Colors.black]}
            locations={[0, 1]}
            style={styles.fadeGradient}
            pointerEvents="none"
          />
        </View>
      )}
    </View>
  );
}

// Hook to manage @-mention user search in any TextInput
export function useUserSearchTrigger({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  onMentionInsert,
}: UseUserSearchTriggerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const inputRef = useRef<any>(null);

  // Watch value/selection for @ mention
  useEffect(() => {
    if (!selection) return;
    const cursor = selection.start;
    const mention = getMentionQuery(value, cursor);
    if (mention && mention.query.length > 0) {
      // Defer state updates to avoid synchronous setState warnings in effects
      setTimeout(() => {
        setMentionQuery(mention.query);
        setMentionRange({ start: mention.start, end: mention.end });
        setModalVisible(true);
      }, 0);
    } else {
      setTimeout(() => {
        setMentionQuery('');
        setMentionRange(null);
        setModalVisible(false);
      }, 0);
    }
  }, [value, selection]);

  // Insert selected handle at the mention position
  const handleSelectUser = useCallback(
    (user: UserProfile) => {
      if (!mentionRange) return;
      const before = value.slice(0, mentionRange.start);
      const after = value.slice(mentionRange.end);
      const insert = `@${user.handle} `;
      const newValue = before + insert + after;
      onChangeText(newValue);
      setModalVisible(false);
      setMentionQuery('');
      setMentionRange(null);
      // Move cursor after inserted handle
      setTimeout(() => {
        if (onSelectionChange) {
          const pos = before.length + insert.length;
          onSelectionChange({ nativeEvent: { selection: { start: pos, end: pos } } });
        }
      }, 0);
      if (onMentionInsert) onMentionInsert(user);
    },
    [mentionRange, value, onChangeText, onSelectionChange, onMentionInsert]
  );

  return {
    inputProps: {
      ref: inputRef,
      value,
      onChangeText,
      selection,
      onSelectionChange,
      autoCorrect: false,
      autoCapitalize: 'none' as const,
    },
    userSearchModalProps: {
      visible: modalVisible,
      searchQuery: mentionQuery,
      onSelect: handleSelectUser,
      onRequestClose: () => setModalVisible(false),
    },
  };
}

// Hook to manage both @ mentions and # hashtags in any TextInput
export function useRichTextSearchTrigger({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  onMentionInsert,
}: UseUserSearchTriggerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'mention' | 'hashtag'>('mention');
  const [searchRange, setSearchRange] = useState<{ start: number; end: number } | null>(null);
  const inputRef = useRef<any>(null);

  // Watch value/selection for @ mention or # hashtag
  useEffect(() => {
    if (!selection) return;
    const cursor = selection.start;

    // If modal is visible and user types a space, dismiss it
    if (modalVisible && cursor > 0) {
      const charBeforeCursor = value[cursor - 1];
      if (charBeforeCursor === ' ') {
        setTimeout(() => {
          setModalVisible(false);
          setSearchQuery('');
          setSearchRange(null);
        }, 0);
        return;
      }
    }

    // Check for hashtag first (more specific pattern)
    const hashtag = getHashtagQuery(value, cursor);
    if (hashtag) {
      setTimeout(() => {
        setSearchQuery(hashtag.query);
        setSearchRange({ start: hashtag.start, end: hashtag.end });
        setSearchType('hashtag');
        setModalVisible(true);
      }, 0);
      return;
    }

    // Check for mention
    const mention = getMentionQuery(value, cursor);
    if (mention && mention.query.length > 0) {
      setTimeout(() => {
        setSearchQuery(mention.query);
        setSearchRange({ start: mention.start, end: mention.end });
        setSearchType('mention');
        setModalVisible(true);
      }, 0);
    } else {
      setTimeout(() => {
        setSearchQuery('');
        setSearchRange(null);
        setModalVisible(false);
      }, 0);
    }
  }, [value, selection, modalVisible]);

  // Insert selected user at the mention position
  const handleSelectUser = useCallback(
    (user: UserProfile) => {
      if (!searchRange || searchType !== 'mention') return;
      const before = value.slice(0, searchRange.start);
      const after = value.slice(searchRange.end);
      const insert = `@${user.handle} `;
      const newValue = before + insert + after;
      onChangeText(newValue);
      setModalVisible(false);
      setSearchQuery('');
      setSearchRange(null);
      // Move cursor after inserted handle
      setTimeout(() => {
        if (onSelectionChange) {
          const pos = before.length + insert.length;
          onSelectionChange({ nativeEvent: { selection: { start: pos, end: pos } } });
        }
      }, 0);
      if (onMentionInsert) onMentionInsert(user);
    },
    [searchRange, searchType, value, onChangeText, onSelectionChange, onMentionInsert]
  );

  // Insert selected hashtag at the hashtag position
  const handleSelectHashtag = useCallback(
    (hashtag: string) => {
      if (!searchRange || searchType !== 'hashtag') return;
      const before = value.slice(0, searchRange.start);
      const after = value.slice(searchRange.end);
      const insert = `#${hashtag} `;
      const newValue = before + insert + after;
      onChangeText(newValue);
      setModalVisible(false);
      setSearchQuery('');
      setSearchRange(null);
      // Move cursor after inserted hashtag
      setTimeout(() => {
        if (onSelectionChange) {
          const pos = before.length + insert.length;
          onSelectionChange({ nativeEvent: { selection: { start: pos, end: pos } } });
        }
      }, 0);
    },
    [searchRange, searchType, value, onChangeText, onSelectionChange]
  );

  return {
    inputProps: {
      ref: inputRef,
      value,
      onChangeText,
      selection,
      onSelectionChange,
      autoCorrect: false,
      autoCapitalize: searchType === 'hashtag' ? ('none' as const) : ('none' as const),
    },
    richTextSearchModalProps: {
      visible: modalVisible,
      searchQuery,
      searchType,
      onSelectUser: handleSelectUser,
      onSelectHashtag: handleSelectHashtag,
      onRequestClose: () => setModalVisible(false),
    },
  };
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 60 : 50, // Slightly more spacing from input
    zIndex: 9999,
    elevation: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  richTextSearchOverlay: {
    position: 'relative',
    width: '100%',
    marginTop: 8,
    zIndex: 1000,
    elevation: 10,
    pointerEvents: 'box-none',
  },
  richTextSearchContainer: {
    backgroundColor: Colors.black,
    width: '100%',
    flex: 1,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
  },
  resultsList: {
    flex: 1,
  },
  fadeGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  resultsListContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingBottom: 40,
    gap: 0,
  },
  modal: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    marginHorizontal: 0,
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    width: '100%',
    maxHeight: 200,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.darkGray,
  },
  avatar: {
    marginRight: 12,
  },
  displayName: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Firma-SemiBold',
  },
  handle: {
    color: Colors.lightGray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorText: {
    color: Colors.red,
    fontSize: 15,
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 15,
  },
  hashtagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderRadius: BORDER_RADIUS.LARGE,
    marginBottom: 0,
    backgroundColor: Colors.black,
  },
  hashtagText: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: 'Firma-Regular',
  },
  hashtagSymbol: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: 'Firma-Regular',
  },
  hashtagTag: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: 'Firma-SemiBold',
  },
  hashtagListContent: {
    paddingHorizontal: 0,
    paddingBottom: 40,
  },
});
