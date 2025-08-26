import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
  Platform,
  FlatList,
} from 'react-native';
import type { FlatListProps } from 'react-native';
import { Colors } from '../ui/UI';
import { Header, useHeaders } from '../../services/APIService';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolateColor,
} from 'react-native-reanimated';

interface HeaderBannerProps {
  headers: Header[];
  onHeaderPress?: (header: Header) => void;
  height?: number; // Optional override for banner height
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const HEADER_HEIGHT = screenHeight * 0.30; // Top 30% of the display height
const HEADER_WIDTH = screenWidth; // Full width

const HeaderBanner: React.FC<HeaderBannerProps> = ({ headers, onHeaderPress, height }) => {
  const AnimatedFlatList = useMemo(
    () => Animated.createAnimatedComponent(FlatList) as unknown as React.ComponentType<any>,
    []
  );
  const listRef = useRef<FlatList<Header> | null>(null);
  const isUserDraggingRef = useRef<boolean>(false);
  const virtualIndexRef = useRef<number>(1);

  const handleHeaderPress = (header: Header) => {
    if (onHeaderPress) {
      onHeaderPress(header);
    } else {
      // Default behavior: open the destination URL
      const url = header?.destinationUrl;
      if (typeof url === 'string' && url.trim().length > 0) {
        Linking.openURL(url).catch(err => {
          console.error('Error opening URL:', err);
        });
      }
    }
  };

  if (!headers || headers.length === 0) {
    return null;
  }

  const isCarousel = headers.length > 1;

  // Reanimated scroll progress for smooth color interpolation
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Build looped data for seamless wrap-around: [last, ...headers, first]
  const loopedData = useMemo(() => {
    if (!headers || headers.length <= 1) return headers;
    const first = headers[0];
    const last = headers[headers.length - 1];
    return [last, ...headers, first];
  }, [headers]);

  const mapVirtualToReal = useCallback((virtualIndex: number): number => {
    if (!headers || headers.length <= 1) return virtualIndex;
    if (virtualIndex === 0) return headers.length - 1;
    if (virtualIndex === headers.length + 1) return 0;
    return virtualIndex - 1;
  }, [headers]);

  // Build color stops per slide from text color preferences (loop-aware)
  const slideColors = useMemo(() => {
    const realColors = headers.map((h) => {
      const titleCol = h.titleColor as string | undefined;
      const subCol = h.subtitleColor as string | undefined;
      return (titleCol || subCol || Colors.white) as string;
    });
    if (headers.length <= 1) return realColors;
    const firstColor = realColors[0];
    const lastColor = realColors[realColors.length - 1];
    return [lastColor, ...realColors, firstColor];
  }, [headers]);

  const inputRange = useMemo(() => (loopedData || []).map((_, i) => i), [loopedData]);
  const colorAnimatedStyle = useAnimatedStyle(() => {
    // Avoid interpolation when there is only one slide
    if (!isCarousel) {
      const firstColor = (slideColors && slideColors[0]) || Colors.white;
      return {
        backgroundColor: firstColor as any,
      };
    }
    const indexProgress = scrollX.value / HEADER_WIDTH;
    return {
      backgroundColor: interpolateColor(indexProgress, inputRange, slideColors as any),
    };
  });

  const [activeIndex, setActiveIndex] = useState<number>(0); // real index within headers
  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 60 }),
    []
  );
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
      if (viewableItems && viewableItems.length > 0) {
        const vi = viewableItems[0]?.index ?? 0;
        if (typeof vi === 'number') {
          virtualIndexRef.current = vi;
          const real = mapVirtualToReal(vi);
          setActiveIndex(real);
        }
      }
    }
  ).current;

  const keyExtractor = useCallback((item: Header, index: number) => {
    // Ensure unique keys for duplicated boundary items
    if (headers.length > 1 && (index === 0 || index === (loopedData.length - 1))) {
      return `dup-${index}-${item.id}`;
    }
    return item.id;
  }, [headers.length, loopedData.length]);

  // Auto-advance carousel when there are multiple headers
  useEffect(() => {
    if (!isCarousel) return;
    const intervalMs = 30000;
    const intervalId = setInterval(() => {
      if (isUserDraggingRef.current) return;
      const nextVirtual = (() => {
        const currentVirtual = virtualIndexRef.current;
        return currentVirtual + 1;
      })();
      try {
        listRef.current?.scrollToIndex({ index: nextVirtual, animated: true });
      } catch (err) {
        // Fallback if index not ready; use offset since getItemLayout is provided
        listRef.current?.scrollToOffset({ offset: HEADER_WIDTH * nextVirtual, animated: true });
      }
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [isCarousel, headers.length]);

  const ensureClampedPosition = useCallback(() => {
    if (!headers || headers.length <= 1) return;
    const vi = virtualIndexRef.current;
    if (vi === 0) {
      virtualIndexRef.current = headers.length; // real last at virtual index len
      listRef.current?.scrollToIndex({ index: headers.length, animated: false });
    } else if (vi === headers.length + 1) {
      virtualIndexRef.current = 1;
      listRef.current?.scrollToIndex({ index: 1, animated: false });
    }
  }, [headers]);

  const renderItem = useCallback(
    ({ item }: { item: Header }) => {
      const header = item;
      return (
        <TouchableOpacity
          key={header.id}
          style={styles.headerItem}
          onPress={() => handleHeaderPress(header)}
          activeOpacity={1}
        >
          <Image
            source={{ uri: header.imageUrl }}
            style={styles.headerImage}
            resizeMode="cover"
            fadeDuration={Platform.OS === 'android' ? 0 : undefined}
            onError={() => {
              console.warn('Failed to load header image:', header.imageUrl);
            }}
          />
          <View style={styles.headerOverlay}>
            <View style={styles.textContainer}>
              {(() => {
                const titleEl = !!header.title && (
                  <Text
                    style={[
                      styles.headerTitle,
                      header.titleColor ? { color: header.titleColor as string } : null,
                      header.titleFontFamily ? { fontFamily: header.titleFontFamily } : null,
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
                      header.subtitleFontFamily ? { fontFamily: header.subtitleFontFamily } : null,
                      header.subtitleFontSize ? { fontSize: header.subtitleFontSize } : null,
                      header.subtitleOpacity !== undefined ? { opacity: header.subtitleOpacity } : null,
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
        </TouchableOpacity>
      );
    },
    []
  );

  if (!isCarousel) {
    const header = headers[0];
    return (
      <View style={[styles.container, height ? { height } : null]}>
        <View style={styles.headersContainer}>
          <TouchableOpacity
            key={header.id}
            style={styles.headerItem}
            onPress={() => handleHeaderPress(header)}
            activeOpacity={1}
          >
            <Image
              source={{ uri: header.imageUrl }}
              style={styles.headerImage}
              resizeMode="cover"
              fadeDuration={Platform.OS === 'android' ? 0 : undefined}
              onError={() => {
                console.warn('Failed to load header image:', header.imageUrl);
              }}
            />
            <View style={styles.headerOverlay}>
              <View style={styles.textContainer}>
                {(() => {
                  const titleEl = !!header.title && (
                    <Text
                      style={[
                        styles.headerTitle,
                        header.titleColor ? { color: header.titleColor as string } : null,
                        header.titleFontFamily ? { fontFamily: header.titleFontFamily } : null,
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
                        header.subtitleFontFamily ? { fontFamily: header.subtitleFontFamily } : null,
                        header.subtitleFontSize ? { fontSize: header.subtitleFontSize } : null,
                        header.subtitleOpacity !== undefined ? { opacity: header.subtitleOpacity } : null,
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
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, height ? { height } : null]}>
      <AnimatedFlatList
        ref={listRef as any}
        data={loopedData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
        contentContainerStyle={styles.headersContainer}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(data: ArrayLike<Header> | null | undefined, index: number) => ({ length: HEADER_WIDTH, offset: HEADER_WIDTH * index, index })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { isUserDraggingRef.current = true; }}
        onMomentumScrollEnd={() => { isUserDraggingRef.current = false; ensureClampedPosition(); }}
        onScrollEndDrag={() => { isUserDraggingRef.current = false; }}
        initialScrollIndex={headers.length > 1 ? 1 : 0}
      />
      <View style={styles.paginationContainer}>
        {headers.map((_, index) => (
          <Animated.View
            key={`dot-${index}`}
            style={[
              styles.dot,
              index === 0 ? { marginLeft: 0 } : null,
              // tint all dots with current slide color, emphasize active with higher opacity
              { opacity: index === activeIndex ? 0.95 : 0.4 },
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingLeft: 20,
    paddingRight: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 24,
    fontFamily: 'Firma-Black',
    marginBottom: 2,
  },
  headerSubtitle: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    flexDirection: 'row',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginLeft: 6,
  },
  activeDot: {
    backgroundColor: 'rgba(255,255,255,0.95)',
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
  }
  return true;
}

export default React.memo(HeaderBanner, areEqual);
