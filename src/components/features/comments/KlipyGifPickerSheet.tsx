import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Platform,
  Alert,
  Share,
  type ListRenderItem,
} from 'react-native';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';

import {
  AppTrueSheet,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  SHEET_SPACING,
} from '@/utils/components/truesheet';
import { Colors } from '@/theme';
import { BORDER_RADIUS, ICON_SIZES, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import { FontFamily, Typography } from '@/utils/components/typography';
import { BlurView } from 'expo-blur';
import Icon from '@/components/ui/Icon';
import { useKlipySearch, useKlipyTrending } from '@/hooks/klipy/useKlipyGifs';
import { getKlipyService } from '@/services/klipy/klipyConfig';
import type { KlipyItem, KlipyKind } from '@/services/klipy/KlipyService';
import TabNavigation from '@/components/layout/header/TabNavigation';

export interface KlipyGifPickerSheetProps {
  sheetRef: React.RefObject<TrueSheet | null>;
  onSelect: (item: KlipyItem) => void;
  onClose: () => void;
}

const GRID_COLUMNS = 3;
const keyExtractor = (it: KlipyItem): string => `${it.kind}:${String(it.id)}`;

const AdWebViewTile: React.FC<{ html: string }> = memo(({ html }) => (
  <WebView
    source={{ html }}
    style={styles.adWebView}
    scrollEnabled={false}
    originWhitelist={['*']}
  />
));
AdWebViewTile.displayName = 'AdWebViewTile';

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
      if (it.isAd ? it.content || it.destinationUrl : it.previewUrl && it.fullUrl) uniq.push(it);
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

  const handleAdPress = useCallback((destinationUrl: string) => {
    WebBrowser.openBrowserAsync(destinationUrl, { controlsColor: Colors.brand.purple }).catch(
      () => {}
    );
  }, []);

  const handleShare = useCallback(
    async (item: KlipyItem) => {
      const service = getKlipyService();
      try {
        const result = await Share.share({
          url: item.fullUrl,
          message: item.fullUrl,
        });
        if (item.slug && result.action === Share.sharedAction) {
          await service.share({ kind: item.kind, slug: item.slug });
        }
      } catch {
        Alert.alert(t('common.error'), t('comments.klipyActionFailed'));
      }
    },
    [t]
  );

  const handleReport = useCallback(
    (item: KlipyItem) => {
      if (!item.slug) return;
      Alert.alert(t('comments.klipyReport'), t('comments.klipyReportConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('comments.klipyReport'),
          style: 'destructive',
          onPress: async () => {
            try {
              await getKlipyService().report({ kind: item.kind, slug: item.slug! });
              Alert.alert(t('common.success'), t('comments.reportedForReview'));
            } catch {
              Alert.alert(t('common.error'), t('comments.failedToSubmitReport'));
            }
          },
        },
      ]);
    },
    [t]
  );

  const showContextMenu = useCallback(
    (item: KlipyItem) => {
      const buttons: Array<{
        text: string;
        onPress?: () => void;
        style?: 'cancel' | 'destructive';
      }> = [
        { text: t('comments.klipyShare'), onPress: () => void handleShare(item) },
        ...(item.slug
          ? [
              {
                text: t('comments.klipyReport'),
                style: 'destructive' as const,
                onPress: () => handleReport(item),
              },
            ]
          : []),
        { text: t('common.cancel'), style: 'cancel' },
      ];
      Alert.alert('', '', buttons);
    },
    [t, handleShare, handleReport]
  );

  const renderItem: ListRenderItem<KlipyItem> = useCallback(
    ({ item }) => {
      const showAsAd = item.isAd && (item.content || item.destinationUrl);

      if (showAsAd) {
        const hasHtmlContent = !!item.content;
        const adDestinationUrl = item.destinationUrl ?? item.fullUrl;
        return (
          <SquircleNativePressable
            style={styles.tile}
            onPress={() => {
              if (adDestinationUrl && !hasHtmlContent) handleAdPress(adDestinationUrl);
            }}
            android_ripple={{ color: Colors.overlay.white10 }}
            accessibilityRole={hasHtmlContent ? undefined : 'link'}
            accessibilityLabel={t('comments.klipyAdLabel')}
          >
            {hasHtmlContent ? (
              <AdWebViewTile html={item.content!} />
            ) : item.previewUrl ? (
              <Image
                source={{ uri: item.previewUrl }}
                style={styles.tileImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.tileImage, styles.adPlaceholder]}>
                <Icon name="arrow_right_up" size={ICON_SIZES.LARGE} color={Colors.neutral[500]} />
              </View>
            )}
            <BlurView intensity={60} tint="dark" style={styles.adBadge}>
              <Text style={styles.adBadgeText}>{t('comments.klipyAdLabel')}</Text>
            </BlurView>
          </SquircleNativePressable>
        );
      }

      return (
        <SquircleNativePressable
          style={styles.tile}
          onPress={() => onSelect(item)}
          onLongPress={() => showContextMenu(item)}
          delayLongPress={400}
          android_ripple={{ color: Colors.overlay.white10 }}
        >
          <Image source={{ uri: item.previewUrl }} style={styles.tileImage} contentFit="cover" />
        </SquircleNativePressable>
      );
    },
    [onSelect, handleAdPress, showContextMenu, t]
  );


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
              autoCorrect={true}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <View style={styles.clearSlot}>
              {trimmed.length > 0 ? (
                <SquircleNativePressable
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.clearButton}
                  android_ripple={{ color: Colors.overlay.white10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('comments.clearSearch')}
                >
                  <Icon name="close-circle" size={22.5} color={Colors.neutral[200]} />
                </SquircleNativePressable>
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
          showsVerticalScrollIndicator={
            items.length >= SCROLL_INDICATOR_CONSTANTS.GIF_PICKER_GRID_MIN_ITEMS
          }
        />
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[975],
  },
  header: {
    backgroundColor: Colors.neutral[975],
    paddingHorizontal: SHEET_SPACING.mediaPickerHorizontal,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 8,
  },
  tabsBarContainer: {
    backgroundColor: Colors.neutral[975],
    paddingHorizontal: SHEET_SPACING.mediaPickerHorizontal,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.overlay.white10,
    alignItems: 'stretch',
  },
  kindTabs: {
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
    boxShadow: '0 1px 6px rgba(5,7,10,0.25)',
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
    backgroundColor: Colors.neutral[975],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.overlay.white10,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  adWebView: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: Colors.neutral[975],
  },
  adPlaceholder: {
    backgroundColor: Colors.neutral[800],
    justifyContent: 'center',
    alignItems: 'center',
  },
  adBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
  },
  adBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: Typography.sizes.overline,
    lineHeight: Typography.lineHeights.overline,
    color: Colors.neutral[50],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default memo(KlipyGifPickerSheet);
