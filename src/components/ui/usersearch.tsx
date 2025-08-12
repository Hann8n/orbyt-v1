import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Keyboard,
  Animated,
} from 'react-native';
import { useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { createQueryKeys } from '../../services/FeedService';
import AtprotoService from '../../services/api/AtprotoService';
import { Avatar } from './UI';
import AuthorItem from './AuthorItem';
import { Colors } from './UI';
import VerificationBadge from '../features/verification/VerificationBadge';

// Animated shimmer component
const ProfileShimmer = () => {
  const shimmerAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startShimmer = () => {
      shimmerAnimation.setValue(0);
      Animated.timing(shimmerAnimation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: false,
      }).start(() => startShimmer());
    };
    startShimmer();
  }, [shimmerAnimation]);

  const shimmerOpacity = shimmerAnimation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 }}>
      <Animated.View 
        style={{ 
          width: 36, 
          height: 36, 
          borderRadius: 18, 
          backgroundColor: Colors.mediumGray,
          marginRight: 12,
          opacity: shimmerOpacity,
        }} 
      />
      <View style={{ flex: 1 }}>
        <Animated.View 
          style={{ 
            width: 120, 
            height: 16, 
            backgroundColor: Colors.mediumGray, 
            borderRadius: 4, 
            marginBottom: 4,
            opacity: shimmerOpacity,
          }} 
        />
        <Animated.View 
          style={{ 
            width: 80, 
            height: 12, 
            backgroundColor: Colors.mediumGray, 
            borderRadius: 4,
            opacity: shimmerOpacity,
          }} 
        />
      </View>
    </View>
  );
};

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

// UserSearch overlay component (not a Modal)
export function UserSearchModal({
  visible,
  onSelect,
  onRequestClose,
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
    refetch,
  } = useInfiniteQuery<
    { profiles: UserProfile[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: UserProfile[]; cursor: string | null }, string | null>,
    ReturnType<typeof createQueryKeys.search.profiles>,
    string | null
  >({
    queryKey: createQueryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: !!searchQuery && searchQuery.length > 0 && visible,
    staleTime: 30 * 1000,
  });

  const profiles = data?.pages.flatMap((page) => page.profiles) || [];

  if (!visible) return null;

  return (
    <View style={[styles.overlay, anchorPosition ? { left: anchorPosition.x, top: anchorPosition.y } : null]} pointerEvents="box-none">
      <View style={styles.modal}>
        {isLoading ? (
          <View>
            <ProfileShimmer />
            <ProfileShimmer />
            <ProfileShimmer />
          </View>
        ) : error ? (
          <View style={styles.centered}><Text style={styles.errorText}>Error loading users</Text></View>
        ) : profiles.length === 0 ? (
          <View style={styles.centered}><Text style={styles.emptyText}>No users found</Text></View>
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
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onRequestClose} />
      */}
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
      setMentionQuery(mention.query);
      setMentionRange({ start: mention.start, end: mention.end });
      setModalVisible(true);
    } else {
      setMentionQuery('');
      setMentionRange(null);
      setModalVisible(false);
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
  modal: {
    backgroundColor: Colors.darkGray,
    borderRadius: 12,
    marginHorizontal: 16,
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 260,
    maxWidth: 400,
    width: '90%',
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
});
