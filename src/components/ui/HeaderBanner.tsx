import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BORDER_RADIUS, SCROLL_CONSTANTS } from '../../utils/constants';
import { View, Text, StyleSheet, Dimensions, Linking, Platform, FlatList } from 'react-native';
import { SquircleNativePressable } from './Squircle';
import { Image } from 'expo-image';
import { Colors } from '../../theme';
import { hexToRGBA } from '../../utils/formatting/colors';
import { FontFamily, Typography } from '../../utils/components/typography';
import { Header } from '../../services/OrbytBannerService';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolateColor,
} from 'react-native-reanimated';

interface HeaderBannerProps {
  headers: Header[];
  onHeaderPress?: (header: Header) => void;
  onImageError?: (header: Header) => void;
  height?: number; // Optional override for banner height
  backgroundColor?: string; // Optional background color for the header container
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const HEADER_HEIGHT = screenHeight * 0.3; // Top 30% of the display height
const HEADER_WIDTH = screenWidth; // Full width

const HeaderBanner: React.FC<HeaderBannerProps> = ({
  headers,
  onHeaderPress,
  onImageError,
  height,
  backgroundColor = Colors.black,
}) => {
  const handleImageError = useCallback(
    (header: Header) => {
      if (onImageError) {
        onImageError(header);
      }
    },
    [onImageError]
  );

  const listRef = useRef<FlatList<Header> | null>(null);
  const isUserDraggingRef = useRef<boolean>(false);
  const virtualIndexRef = useRef<number>(1);

  const handleHeaderPress = useCallback(
    (header: Header) => {
      if (onHeaderPress) {
        onHeaderPress(header);
      } else {
        // Default behavior: open the destination URL
        const url = header?.destinationUrl;
        if (typeof url === 'string' && url.trim().length > 0) {
          Linking.openURL(url).catch(() => {});
        }
      }
    },
    [onHeaderPress]
  );

  const hasHeaders = useMemo(() => Array.isArray(headers) && headers.length > 0, [headers]);
  const isCarousel = hasHeaders && headers.length > 1;

  // Reanimated scroll progress for smooth color interpolation
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Loop data for wrap-around: [last, ...headers, first]
  const loopedData = useMemo(() => {
    if (!hasHeaders || headers.length <= 1) return headers;
    const first = headers[0];
    const last = headers[headers.length - 1];
    return [last, ...headers, first];
  }, [hasHeaders, headers]);

  const mapVirtualToReal = useCallback(
    (virtualIndex: number): number => {
      if (!hasHeaders || headers.length <= 1) return virtualIndex;
      if (virtualIndex === 0) return headers.length - 1;
      if (virtualIndex === headers.length + 1) return 0;
      return virtualIndex - 1;
    },
    [hasHeaders, headers]
  );

  // Build color stops per slide from text color preferences (loop-aware)
  const slideColors = useMemo(() => {
    const realColors = (headers || []).map(h => {
      const titleCol = h.titleColor;
      const subCol = h.subtitleColor;
      return titleCol || subCol || Colors.neutral[50];
    });
    if (!hasHeaders || headers.length <= 1) return realColors;
    const firstColor = realColors[0];
    const lastColor = realColors[realColors.length - 1];
    return [lastColor, ...realColors, firstColor];
  }, [hasHeaders, headers]);

  const inputRange = useMemo(() => (loopedData || []).map((_, i) => i), [loopedData]);
  const colorAnimatedStyle = useAnimatedStyle(() => {
    // Avoid interpolation when there is only one slide
    if (!isCarousel) {
      const firstColor = (slideColors && slideColors[0]) || Colors.neutral[50];
      return {
        backgroundColor: firstColor,
      };
    }
    const indexProgress = scrollX.value / HEADER_WIDTH;
    return {
      backgroundColor: interpolateColor(indexProgress, inputRange, slideColors),
    };
  });

  const [activeIndex, setActiveIndex] = useState<number>(0); // real index within headers
  const viewabilityConfig = useMemo(() => ({ viewAreaCoveragePercentThreshold: 60 }), []);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
      if (viewableItems && viewableItems.length > 0) {
        const vi = viewableItems[0]?.index ?? 0;
        if (typeof vi === 'number') {
          virtualIndexRef.current = vi;
          const real = mapVirtualToReal(vi);
          setActiveIndex(real);
        }
      }
    },
    [mapVirtualToReal]
  );

  const keyExtractor = useCallback(
    (item: Header, index: number) => {
      // Ensure unique keys for duplicated boundary items
      if (headers.length > 1 && (index === 0 || index === loopedData.length - 1)) {
        return `dup-${index}-${item.id}`;
      }
      return item.id;
    },
    [headers.length, loopedData.length]
  );

  // Auto-advance carousel when there are multiple headers
  useEffect(() => {
    if (!isCarousel) return;
    const intervalMs = 30000;
    const intervalId = setInterval(() => {
      if (isUserDraggingRef.current) return;
      const maxVirtualIndex = headers.length + 1;
      const nextVirtual =
        virtualIndexRef.current >= maxVirtualIndex ? 1 : virtualIndexRef.current + 1;
      listRef.current?.scrollToIndex({ index: nextVirtual, animated: true });
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [isCarousel, headers.length]);

  const ensureClampedPosition = useCallback(() => {
    if (!hasHeaders || headers.length <= 1) return;
    const vi = virtualIndexRef.current;
    if (vi === 0) {
      virtualIndexRef.current = headers.length; // real last at virtual index len
      listRef.current?.scrollToIndex({ index: headers.length, animated: false });
    } else if (vi === headers.length + 1) {
      virtualIndexRef.current = 1;
      listRef.current?.scrollToIndex({ index: 1, animated: false });
    }
  }, [hasHeaders, headers]);

  const renderItem = useCallback(
    ({ item }: { item: Header }) => {
      const header = item;
      return (
        <SquircleNativePressable
          key={header.id}
          style={styles.headerItem}
          onPress={() => handleHeaderPress(header)}
        >
          <Image
            source={{ uri: header.imageUrl }}
            style={styles.headerImage}
            contentFit="cover"
            transition={Platform.OS === 'android' ? 0 : undefined}
            onError={() => handleImageError(header)}
          />
          <View style={styles.headerOverlay}>
            <View style={styles.textContainer}>
              {(() => {
                const titleEl = !!header.title && (
                  <Text
                    style={[
                      styles.headerTitle,
                      header.titleColor ? { color: header.titleColor } : undefined,
                      header.titleFontSize ? { fontSize: header.titleFontSize } : undefined,
                      header.titleOpacity !== undefined
                        ? { opacity: header.titleOpacity }
                        : undefined,
                    ]}
                    numberOfLines={1}
                  >
                    {header.title}
                  </Text>
                );

                const subtitleText = header.subtitle;
                const descriptionEl = !!subtitleText && (
                  <Text
                    style={[
                      styles.headerSubtitle,
                      header.subtitleColor ? { color: header.subtitleColor } : undefined,
                      header.subtitleFontSize ? { fontSize: header.subtitleFontSize } : undefined,
                      header.subtitleOpacity !== undefined
                        ? { opacity: header.subtitleOpacity }
                        : undefined,
                    ]}
                    numberOfLines={1}
                  >
                    {subtitleText}
                  </Text>
                );

                const order = header.textOrder || 'subtitle-first';
                return order === 'title-first' ? (
                  <>
                    {titleEl}
                    {descriptionEl}
                  </>
                ) : (
                  <>
                    {descriptionEl}
                    {titleEl}
                  </>
                );
              })()}
            </View>
          </View>
        </SquircleNativePressable>
      );
    },
    [handleHeaderPress, handleImageError]
  );

  if (!hasHeaders) {
    return null;
  }

  if (!isCarousel) {
    const header = headers[0];
    return (
      <View style={[styles.container, height ? { height } : null, { backgroundColor }]}>
        <View style={styles.headersContainer}>
          <SquircleNativePressable
            key={header.id}
            style={styles.headerItem}
            onPress={() => handleHeaderPress(header)}
          >
            <Image
              source={{ uri: header.imageUrl }}
              style={styles.headerImage}
              contentFit="cover"
              transition={Platform.OS === 'android' ? 0 : undefined}
              onError={() => handleImageError(header)}
            />
            <View style={styles.headerOverlay}>
              <View style={styles.textContainer}>
                {(() => {
                  const titleEl = !!header.title && (
                    <Text
                      style={[
                        styles.headerTitle,
                        header.titleColor ? { color: header.titleColor as string } : null,
                        header.titleFontSize ? { fontSize: header.titleFontSize } : null,
                        header.titleOpacity !== undefined ? { opacity: header.titleOpacity } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {header.title}
                    </Text>
                  );

                  const subtitleText = header.subtitle;
                  const descriptionEl = !!subtitleText && (
                    <Text
                      style={[
                        styles.headerSubtitle,
                        header.subtitleColor ? { color: header.subtitleColor as string } : null,
                        header.subtitleFontSize ? { fontSize: header.subtitleFontSize } : null,
                        header.subtitleOpacity !== undefined
                          ? { opacity: header.subtitleOpacity }
                          : null,
                      ]}
                      numberOfLines={1}
                    >
                      {subtitleText}
                    </Text>
                  );

                  const order = header.textOrder || 'subtitle-first';
                  return order === 'title-first' ? (
                    <>
                      {titleEl}
                      {descriptionEl}
                    </>
                  ) : (
                    <>
                      {descriptionEl}
                      {titleEl}
                    </>
                  );
                })()}
              </View>
            </View>
          </SquircleNativePressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, height ? { height } : null, { backgroundColor }]}>
      <Animated.FlatList
        ref={listRef}
        data={loopedData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate={
          Platform.OS === 'ios'
            ? SCROLL_CONSTANTS.DECELERATION_RATE_IOS
            : SCROLL_CONSTANTS.DECELERATION_RATE_ANDROID
        }
        contentContainerStyle={styles.headersContainer}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_data: ArrayLike<Header> | null | undefined, index: number) => ({
          length: HEADER_WIDTH,
          offset: HEADER_WIDTH * index,
          index,
        })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isUserDraggingRef.current = true;
        }}
        onMomentumScrollEnd={() => {
          isUserDraggingRef.current = false;
          ensureClampedPosition();
        }}
        onScrollEndDrag={() => {
          isUserDraggingRef.current = false;
        }}
        initialScrollIndex={headers.length > 1 ? 1 : 0}
      />
      <View style={styles.paginationContainer}>
        {headers.map((_, index) => (
          <Animated.View
            key={`dot-${index}`}
            style={[
              styles.dot,
              index === 0 ? styles.dotFirst : null,
              index === activeIndex ? styles.dotActive : styles.dotInactive,
              colorAnimatedStyle,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: HEADER_HEIGHT,
    width: '100%',
    position: 'relative',
    marginBottom: 0,
  },
  headersContainer: {
    height: '100%',
    paddingHorizontal: 0,
  },
  headerItem: {
    width: HEADER_WIDTH,
    height: '100%',
    marginRight: 0,
    borderRadius: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay.black35,
    justifyContent: 'flex-end',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingLeft: 10,
    paddingRight: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h2,
    fontFamily: FontFamily.black,
    marginBottom: 2,
  },
  headerSubtitle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 12,
    right: 10,
    flexDirection: 'row',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: hexToRGBA(Colors.neutral[50], 0.4),
    marginLeft: 6,
  },
  dotFirst: {
    marginLeft: 0,
  },
  dotActive: {
    opacity: 0.95,
  },
  dotInactive: {
    opacity: 0.4,
  },
});

function areEqual(prev: HeaderBannerProps, next: HeaderBannerProps): boolean {
  const a = prev.headers || [];
  const b = next.headers || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].imageUrl !== b[i].imageUrl) return false;
    if (a[i].title !== b[i].title) return false;
    if (a[i].subtitle !== b[i].subtitle) return false;
    if (a[i].destinationUrl !== b[i].destinationUrl) return false;
    if (a[i].titleColor !== b[i].titleColor) return false;
    if (a[i].subtitleColor !== b[i].subtitleColor) return false;
    if (a[i].titleFontFamily !== b[i].titleFontFamily) return false;
    if (a[i].titleFontSize !== b[i].titleFontSize) return false;
    if (a[i].subtitleFontFamily !== b[i].subtitleFontFamily) return false;
    if (a[i].subtitleFontSize !== b[i].subtitleFontSize) return false;
    if (a[i].textOrder !== b[i].textOrder) return false;
    if (a[i].titleOpacity !== b[i].titleOpacity) return false;
    if (a[i].subtitleOpacity !== b[i].subtitleOpacity) return false;
    if (a[i].bottomShimEnabled !== b[i].bottomShimEnabled) return false;
    if (a[i].bottomShimOpacity !== b[i].bottomShimOpacity) return false;
  }
  return true;
}

export default React.memo(HeaderBanner, areEqual);
