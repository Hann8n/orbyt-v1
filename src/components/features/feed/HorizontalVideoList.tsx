import React, { useCallback, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import type { FeedItem } from '../../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Path, Rect, G } from 'react-native-svg';

import { extractVideoUrl, extractVideoThumbnail } from '../../../utils/helpers/video';
import { feedService } from '../../../services/FeedService';
import { Colors } from '../../ui/UI';

// Custom Warning Icon Component
const WarningIcon = ({ size = 24, color = Colors.white }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect width="24" height="24" fill="none"/>
    <G fill="none">
      <Path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" fill={color}/>
      <Path fill="#fff" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2m0 13a1 1 0 1 0 0 2a1 1 0 0 0 0-2m0-9a1 1 0 0 0-.993.883L11 7v6a1 1 0 0 0 1.993.117L13 13V7a1 1 0 0 0-1-1"/>
    </G>
  </Svg>
);

// Shared video item component (factored out from GridFeedView)
export const VideoGridItem: React.FC<{
  item: FeedItem;
  index: number;
  onPress: (index: number) => void;
  style?: any;
  itemStyle?: any;
  thumbnailStyle?: any;
}> = ({ item, index, onPress, style, itemStyle, thumbnailStyle }) => {
  const videoUrl = extractVideoUrl(item.post.embed);
  const thumbnailUrl = extractVideoThumbnail(item.post.embed);
  // Posts are already filtered at API level, so we don't need to skip non-video posts
  const shouldBlur = !!item.moderationDecision?.blur;
  
  return (
    <TouchableOpacity
      style={[styles.gridItem, style, itemStyle]}
      activeOpacity={0.7}
      onPress={() => onPress(index)}
    >
      <Image
        source={{ uri: thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() !== '' ? thumbnailUrl : undefined }}
        style={[styles.thumbnail, thumbnailStyle]}
        resizeMode="cover"
        key={`thumbnail-${item.post.uri}`}
      />
      {shouldBlur && (
        <BlurView intensity={80} tint="dark" style={styles.warningOverlay} />
      )}
    </TouchableOpacity>
  );
};

interface HorizontalVideoListProps {
  feed: FeedItem[];
  headerComponent?: React.ReactNode;
  refreshControl?: React.ReactElement;
  backgroundColor?: string;
  secondaryColor?: string;
  isProfileLoading?: boolean;
  isProfileFeed?: boolean;
  feedOption: string;
  userDid?: string;
  onLoadMore: () => void;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onVideoItemPress: (index: number) => void;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

const ITEM_HEIGHT = 180;
const ITEM_WIDTH = 110;
const ITEM_MARGIN = 8;

const HorizontalVideoList: React.FC<HorizontalVideoListProps> = ({
  feed,
  headerComponent,
  refreshControl,
  backgroundColor = '#000',
  secondaryColor = '#fff',
  isProfileLoading = false,
  isProfileFeed = false,
  feedOption,
  userDid,
  onLoadMore,
  isFetchingNextPage = false,
  hasNextPage = false,
  onVideoItemPress,
  isError = false,
  error,
  onRetry,
}) => {
  const insets = useSafeAreaInsets();

  // Infinite scroll removed - handled by parent
  const onScroll = () => {};



  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <VideoGridItem
        item={item}
        index={index}
        onPress={onVideoItemPress}
        style={{ marginRight: ITEM_MARGIN }}
        itemStyle={{ borderRadius: BORDER_RADIUS.MEDIUM }}
        thumbnailStyle={{ borderRadius: BORDER_RADIUS.MEDIUM }}
      />
    ),
    [onVideoItemPress]
  );

  return (
    <View style={[styles.container, { backgroundColor, height: ITEM_HEIGHT + 16 }]}> {/* 16 for padding */}
      <FlatList
        key={`horizontal-${feedOption}-${userDid || 'default'}`}
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item, index) => `horizontal-${item.post.uri}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalListContent}
        ListHeaderComponent={headerComponent ? <View>{headerComponent}</View> : null}
        refreshControl={refreshControl as any}
        onScroll={onScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'flex-start',
    width: '100%',
  },
  horizontalListContent: {
    paddingLeft: 12,
    paddingRight: 12,
    alignItems: 'center',
    minHeight: ITEM_HEIGHT + 8,
  },
  gridItem: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.darkGray,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 3,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  warningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HorizontalVideoList;
