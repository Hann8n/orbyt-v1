import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  LayoutAnimation,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SquircleNativePressable } from './Squircle';
import { LinearGradient } from './LinearGradient';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import { AtprotoFeedService } from '../../services/api/feed/FeedService';
import AuthorItem from './AuthorItem';
import UI from './UI';
import { Colors } from './UI';
import { FontFamily, Typography, TextStyles } from '../../utils/components/typography';
import { useProfileSearch } from '../../hooks/useProfileSearch';
import { getSearchQuery } from '../../utils/searchQueryExtractors';
import type { ProfileViewBasic } from '../../services/api/types';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../utils/constants';

/** Author row styling for `SearchBanner` (video post description @/# search) and matching surfaces. */
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

export interface SearchBannerProps {
  visible: boolean;
  searchQuery: string;
  searchType: 'mention' | 'hashtag' | null;
  onSelectUser?: (user: ProfileViewBasic) => void;
  onSelectHashtag?: (hashtag: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  horizontalPillStyle?: boolean;
}

/** Renders mention/hashtag suggestion results above a TextInput. */
export function SearchBanner({
  visible,
  searchQuery,
  searchType,
  onSelectUser,
  onSelectHashtag,
  containerStyle,
  horizontalPillStyle = false,
}: SearchBannerProps) {
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const prevVisibleRef = useRef(visible);

  const {
    data: userData,
    isFetchingNextPage: isFetchingMoreUsers,
    fetchNextPage: fetchMoreUsers,
    hasNextPage: hasMoreUsers,
  } = useProfileSearch(deferredSearchQuery, {
    enabled: searchType === 'mention' && visible,
    staleTime: 30 * 1000,
  });

  const users = useMemo(
    () => userData?.pages.flatMap(page => page.profiles) ?? [],
    [userData]
  );

  const { data: hashtagSuggestionsData } = useQuery<string[]>({
    queryKey: queryKeys.search.hashtags(deferredSearchQuery),
    queryFn: () => AtprotoFeedService.searchHashtagSuggestions(deferredSearchQuery, 10),
    enabled: searchType === 'hashtag' && deferredSearchQuery.length >= 3 && visible,
    staleTime: 5 * 60 * 1000,
  });

  const hashtagSuggestions = hashtagSuggestionsData ?? [];

  const hasResults =
    (searchType === 'mention' && users.length > 0) ||
    (searchType === 'hashtag' && hashtagSuggestions.length > 0);

  useEffect(() => {
    if (prevVisibleRef.current !== visible) {
      LayoutAnimation.configureNext({
        duration: 150,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
      prevVisibleRef.current = visible;
    }
  }, [visible]);

  if (!visible || !hasResults) return null;

  const isMention = searchType === 'mention';
  const isHorizontal = horizontalPillStyle;

  if (isMention) {
    if (isHorizontal) {
      return (
        <View style={[styles.bannerContainer, containerStyle]}>
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
                  <UI.Avatar uri={item.avatar} size={28} style={styles.pillAvatar} />
                  <Text style={styles.pillContent} numberOfLines={1}>{item.handle}</Text>
                </SquircleNativePressable>
              )}
              onEndReached={() => {
                if (hasMoreUsers && !isFetchingMoreUsers) fetchMoreUsers();
              }}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              keyboardShouldPersistTaps="handled"
              style={styles.resultsList}
              contentContainerStyle={styles.horizontalListContent}
              scrollEnabled
              showsHorizontalScrollIndicator={false}
            />
            <LinearGradient
              colors={['transparent', Colors.neutral[975]]}
              locations={[0, 1]}
              style={styles.horizontalFadeGradient}
              pointerEvents="none"
            />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.bannerContainer, containerStyle]}>
        <View style={styles.listContainer}>
          <FlashList
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
          />
          <LinearGradient
            colors={['transparent', Colors.neutral[975]]}
            locations={[0, 1]}
            style={styles.fadeGradient}
            pointerEvents="none"
          />
        </View>
      </View>
    );
  }

  // Hashtag results
  if (isHorizontal) {
    return (
      <View style={[styles.bannerContainer, containerStyle]}>
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
      </View>
    );
  }

  return (
    <View style={[styles.bannerContainer, containerStyle]}>
      <View style={styles.listContainer}>
        <FlashList
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
    </View>
  );
}

interface UseSearchTriggerProps {
  value: string;
  selection: { start: number; end: number };
  onChangeText: (text: string) => void;
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  onMentionInsert?: (user: ProfileViewBasic) => void;
  inputRef?: React.RefObject<TextInput | null>;
  enableHashtags?: boolean;
  horizontalPillStyle?: boolean;
}

/** Detects live @mention / #hashtag queries and returns props for a TextInput + SearchBanner. */
export function useSearchTrigger({
  value,
  selection,
  onChangeText,
  onSelectionChange,
  onMentionInsert,
  inputRef,
  enableHashtags = false,
  horizontalPillStyle = false,
}: UseSearchTriggerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'mention' | 'hashtag'>('mention');
  const [searchRange, setSearchRange] = useState<{ start: number; end: number } | null>(null);
  const suppressNextQueryRef = useRef(false);

  useEffect(() => {
    if (!selection) {
      setSearchQuery('');
      setSearchRange(null);
      return;
    }

    if (suppressNextQueryRef.current) {
      suppressNextQueryRef.current = false;
      return;
    }

    const result = getSearchQuery(value, selection.start, enableHashtags);

    if (result) {
      setSearchQuery(result.query.query);
      setSearchRange({ start: result.query.start, end: result.query.end });
      setSearchType(result.type);
    } else {
      setSearchQuery('');
      setSearchRange(null);
    }
  }, [value, selection?.start, enableHashtags]);

  const placeCursor = useCallback((pos: number) => {
    requestAnimationFrame(() => {
      inputRef?.current?.setNativeProps({ selection: { start: pos, end: pos } });
    });
  }, [inputRef]);

  const handleSelectUser = useCallback(
    (user: ProfileViewBasic) => {
      if (!searchRange || searchType !== 'mention') return;
      const before = value.slice(0, searchRange.start);
      const after = value.slice(searchRange.end);
      const insert = `@${user.handle} `;
      const newValue = before + insert + after;
      const newCursorPos = searchRange.start + insert.length;

      suppressNextQueryRef.current = true;
      onChangeText(newValue);
      placeCursor(newCursorPos);
      setSearchQuery('');
      setSearchRange(null);
      onMentionInsert?.(user);
    },
    [searchRange, searchType, value, onChangeText, placeCursor, onMentionInsert]
  );

  const handleSelectHashtag = useCallback(
    (hashtag: string) => {
      if (!searchRange || searchType !== 'hashtag') return;
      const before = value.slice(0, searchRange.start);
      const after = value.slice(searchRange.end);
      const insert = `#${hashtag} `;
      const newValue = before + insert + after;
      const newCursorPos = searchRange.start + insert.length;

      suppressNextQueryRef.current = true;
      onChangeText(newValue);
      placeCursor(newCursorPos);
      setSearchQuery('');
      setSearchRange(null);
    },
    [searchRange, searchType, value, onChangeText, placeCursor]
  );

  return {
    inputProps: {
      value,
      onChangeText,
      onSelectionChange,
      autoCorrect: false,
      autoCapitalize: 'none' as const,
    },
    bannerProps: {
      visible: searchQuery.length > 0 && searchRange !== null,
      searchQuery,
      searchType,
      onSelectUser: handleSelectUser,
      onSelectHashtag: handleSelectHashtag,
      horizontalPillStyle,
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
    paddingVertical: 4,
    paddingHorizontal: 0,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  listContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  resultsList: {
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
    gap: 8,
  },
  horizontalFadeGradient: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 60,
  },
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
