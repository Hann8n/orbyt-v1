import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  type ListRenderItem,
} from 'react-native';
import { Image } from 'expo-image';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';

import {
  AppTrueSheet,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  DEFAULT_GRABBER_OPTIONS,
  SHEET_SPACING,
} from '@/utils/components/truesheet';
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

const KlipyGifPickerSheet: React.FC<KlipyGifPickerSheetProps> = ({
  sheetRef,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
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

  const placeholder = t('comments.klipySearchPlaceholder');

  const tabs = useMemo(
    () => [
      { id: 'gif', label: t('comments.klipyKindGif') },
      { id: 'sticker', label: t('comments.klipyKindSticker') },
      { id: 'meme', label: t('comments.klipyKindMeme') },
      { id: 'emoji', label: t('comments.klipyKindEmoji') },
    ],
    [t]
  );
  const tabsOpacity = scrollY.interpolate({
    inputRange: [0, 20, 40],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <AppTrueSheet
      ref={sheetRef}
      name="klipy-gif-picker"
      variant="sendToPicker"
      grabber
      grabberOptions={DEFAULT_GRABBER_OPTIONS}
      onDidDismiss={onClose}
      scrollable
      header={
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <Icon name="search" size={ICON_SIZES.LARGE} color={Colors.neutral[200]} />
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
            <View style={styles.clearSlot}>
              {trimmed.length > 0 ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.clearButton}
                  android_ripple={{ color: Colors.overlay.white10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('comments.clearSearch')}
                >
                  <Icon name="close-circle" size={22.5} color={Colors.neutral[200]} />
                </Pressable>
              ) : (
                <View style={styles.clearButtonPlaceholder} />
              )}
            </View>
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
          keyboardDismissMode="on-drag"
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
    paddingHorizontal: SHEET_SPACING.mediaPickerHorizontal,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 8,
  },
  tabsBarContainer: {
    backgroundColor: Colors.black,
    paddingHorizontal: SHEET_SPACING.mediaPickerHorizontal,
    paddingTop: 0,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.overlay.white10,
    alignItems: 'stretch',
  },
  kindTabs: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginTop: 0,
    minHeight: 34,
    alignSelf: 'stretch',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.neutral[800],
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingVertical: 11,
    minHeight: 46,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.title,
    height: Typography.lineHeights.title,
    padding: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
    }),
  },
  clearSlot: {
    marginLeft: 8,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.FULL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonPlaceholder: {
    width: 28,
    height: 28,
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
