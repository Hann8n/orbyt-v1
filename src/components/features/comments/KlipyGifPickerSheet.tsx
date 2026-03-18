import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  type ListRenderItem,
} from 'react-native';
import { Image } from 'expo-image';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';

import { AppTrueSheet } from '@/utils/components/truesheet';
import { DEFAULT_GRABBER_OPTIONS } from '@/utils/components/truesheet/trueSheetPresets';
import { Colors } from '@/theme';
import { BORDER_RADIUS, ICON_SIZES } from '@/utils/constants';
import { Typography } from '@/utils/components/typography';
import Icon from '@/components/ui/Icon';
import { useKlipySearch, useKlipyTrending } from '@/hooks/klipy/useKlipyGifs';
import type { KlipyItem, KlipyKind } from '@/services/klipy/KlipyService';
import TabNavigation from '@/components/layout/header/TabNavigation';

export interface KlipyGifPickerSheetProps {
  sheetRef: React.RefObject<TrueSheet | null>;
  onSelect: (item: KlipyItem) => void;
  onClose: () => void;
}

const GRID_COLUMNS = 3;

const KIND_OPTIONS: Array<{ kind: KlipyKind; label: string }> = [
  { kind: 'gif', label: 'GIFs' },
  { kind: 'sticker', label: 'Stickers' },
  { kind: 'meme', label: 'Memes' },
  { kind: 'emoji', label: 'Emojis' },
];

const KlipyGifPickerSheet: React.FC<KlipyGifPickerSheetProps> = ({
  sheetRef,
  onSelect,
  onClose,
}) => {
  const scrollY = useMemo(() => new Animated.Value(0), []);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KlipyKind>('gif');
  const trimmed = query.trim();

  // Universal search (query all kinds, then filter locally via chips)
  const gifSearch = useKlipySearch('gif', trimmed);
  const stickerSearch = useKlipySearch('sticker', trimmed);
  const memeSearch = useKlipySearch('meme', trimmed);
  const emojiSearch = useKlipySearch('emoji', trimmed);

  const gifTrending = useKlipyTrending('gif');
  const stickerTrending = useKlipyTrending('sticker');
  const memeTrending = useKlipyTrending('meme');
  const emojiTrending = useKlipyTrending('emoji');

  const items = useMemo(() => {
    const sources =
      trimmed.length > 0
        ? [gifSearch, stickerSearch, memeSearch, emojiSearch]
        : [gifTrending, stickerTrending, memeTrending, emojiTrending];

    const merged = sources.flatMap(src => (src.data?.pages ?? []).flatMap(p => p.items));
    const filtered = merged.filter(it => it.kind === kindFilter);

    // De-dupe by kind+id (IDs can overlap across kinds)
    const seen = new Set<string>();
    const uniq: KlipyItem[] = [];
    for (const it of filtered) {
      const key = `${it.kind}:${String(it.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (it.previewUrl && it.fullUrl) uniq.push(it);
    }
    return uniq;
  }, [
    trimmed,
    kindFilter,
    gifSearch,
    stickerSearch,
    memeSearch,
    emojiSearch,
    gifTrending,
    stickerTrending,
    memeTrending,
    emojiTrending,
  ]);

  const onEndReached = useCallback(() => {
    const sources = trimmed.length
      ? [
          { kind: 'gif' as const, q: gifSearch },
          { kind: 'sticker' as const, q: stickerSearch },
          { kind: 'meme' as const, q: memeSearch },
          { kind: 'emoji' as const, q: emojiSearch },
        ]
      : [
          { kind: 'gif' as const, q: gifTrending },
          { kind: 'sticker' as const, q: stickerTrending },
          { kind: 'meme' as const, q: memeTrending },
          { kind: 'emoji' as const, q: emojiTrending },
        ];

    const activeSources = sources.filter(s => s.kind === kindFilter);

    // Fetch next page for any active sources that can paginate.
    for (const s of activeSources) {
      if (s.q.hasNextPage && !s.q.isFetchingNextPage) {
        s.q.fetchNextPage();
      }
    }
  }, [
    trimmed.length,
    kindFilter,
    gifSearch,
    stickerSearch,
    memeSearch,
    emojiSearch,
    gifTrending,
    stickerTrending,
    memeTrending,
    emojiTrending,
  ]);

  const renderItem: ListRenderItem<KlipyItem> = useCallback(
    ({ item }) => {
      return (
        <Pressable
          style={styles.tile}
          onPress={() => onSelect(item)}
          android_ripple={{ color: Colors.overlay.white10 }}
        >
          <Image source={{ uri: item.previewUrl }} style={styles.tileImage} contentFit="cover" />
        </Pressable>
      );
    },
    [onSelect]
  );

  const keyExtractor = useCallback((it: KlipyItem) => `${it.kind}:${String(it.id)}`, []);

  const placeholder = 'Search KLIPY';

  const tabs = useMemo(() => KIND_OPTIONS.map(opt => ({ id: opt.kind, label: opt.label })), []);
  const tabsOpacity = scrollY.interpolate({
    inputRange: [0, 20, 40],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <AppTrueSheet
      ref={sheetRef}
      name="klipy-gif-picker"
      detents={[1]}
      grabber
      grabberOptions={DEFAULT_GRABBER_OPTIONS}
      onDidDismiss={onClose}
      scrollable
      header={
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <Icon name="search" size={ICON_SIZES.MEDIUM} color={Colors.neutral[300]} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={Colors.neutral[500]}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {trimmed.length > 0 && (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.clearButton}
                android_ripple={{ color: Colors.overlay.white10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="close" size={18} color={Colors.neutral[200]} />
              </Pressable>
            )}
          </View>
        </View>
      }
    >
      <View style={styles.container}>
        <Animated.FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={GRID_COLUMNS}
          ListHeaderComponent={
            <Animated.View style={[styles.tabsBarContainer, { opacity: tabsOpacity }]}>
              <TabNavigation
                tabs={tabs}
                activeTab={kindFilter}
                onTabPress={tabId => setKindFilter(tabId as KlipyKind)}
                variant="comments"
                textColor={Colors.neutral[50]}
                reserveViewToggleSpace={false}
                style={styles.kindTabs}
              />
            </Animated.View>
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.8}
          contentContainerStyle={styles.listContent}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
          })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    backgroundColor: Colors.black,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 8,
  },
  tabsBarContainer: {
    backgroundColor: Colors.black,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.overlay.white10,
  },
  kindTabs: {
    paddingVertical: 0,
    marginTop: 0,
    minHeight: 34,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.overlay.white10,
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlay.white10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.overlay.white10,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    margin: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: Colors.black,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlay.white10,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
});

export default memo(KlipyGifPickerSheet);
