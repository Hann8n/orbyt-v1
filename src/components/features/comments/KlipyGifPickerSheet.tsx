import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';

import { AppTrueSheet } from '@/utils/components/truesheet';
import { Colors } from '@/theme';
import { BORDER_RADIUS, ICON_SIZES } from '@/utils/constants';
import { Typography } from '@/utils/components/typography';
import Icon from '@/components/ui/Icon';
import { useKlipySearch, useKlipyTrending } from '@/hooks/klipy/useKlipyGifs';
import type { KlipyItem, KlipyKind } from '@/services/klipy/KlipyService';

export interface KlipyGifPickerSheetProps {
  sheetRef: React.RefObject<TrueSheet | null>;
  onSelect: (item: KlipyItem) => void;
  onClose: () => void;
}

const ITEM_SIZE = 110;
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

  const renderItem = useCallback(
    ({ item }: { item: KlipyItem }) => {
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

  return (
    <AppTrueSheet
      ref={sheetRef}
      name="klipy-gif-picker"
      detents={[0.85, 1]}
      onDidDismiss={onClose}
      scrollable
      header={
        <View style={styles.header}>
          <View style={styles.kindRow}>
            {KIND_OPTIONS.map(opt => {
              const active = opt.kind === kindFilter;
              return (
                <Pressable
                  key={opt.kind}
                  onPress={() => setKindFilter(opt.kind)}
                  style={[styles.kindChip, active && styles.kindChipActive]}
                  android_ripple={{ color: Colors.overlay.white10 }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={18} color={Colors.neutral[200]} />
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.container}>
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={GRID_COLUMNS}
          estimatedItemSize={ITEM_SIZE}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.8}
          contentContainerStyle={styles.listContent}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.overlay.white10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlay.white10,
  },
  kindChipActive: {
    backgroundColor: Colors.neutral[200],
    borderColor: Colors.neutral[200],
  },
  kindChipText: {
    color: Colors.neutral[200],
    fontFamily: Typography.families.medium,
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
  },
  kindChipTextActive: {
    color: Colors.black,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.overlay.white10,
    borderRadius: BORDER_RADIUS.LARGE,
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
    padding: 2,
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
