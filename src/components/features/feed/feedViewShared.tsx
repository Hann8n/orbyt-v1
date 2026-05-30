import { createContext, useContext, type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ScrollViewProps } from 'react-native';
import Animated from 'react-native-reanimated';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { Colors } from '../../../theme';
import { FEED_TYPES } from '../../../utils/constants';
import type { FeedListItem } from '../../../types';
import { isFeedHeaderItem } from '../../../types';
import { blendColors, hexToRGBA } from '../../../utils/formatting/colors';
import { isValidAtUri } from '../../../utils/atproto/uriValidation';

export const FEED_VIEW_CONSTANTS = {
  LIST_ITEM_GAP: 0,
  FLASHLIST_DRAW_DISTANCE: 220,
  GRID_CELL_GAP: 2,
  HEADER_HEIGHT_TABS: 280,
  HEADER_BLOCKING_THRESHOLD: 250,
} as const;

export const isHeaderFeed = (feedOption: string, headerComponent?: ReactNode): boolean =>
  Boolean(headerComponent) || isValidAtUri(feedOption);

export const getProfileColors = (backgroundColor?: string, secondaryColor?: string) =>
  secondaryColor
    ? {
        backgroundColor: backgroundColor || Colors.black,
        textColor: secondaryColor,
      }
    : undefined;

export const getPullToRefreshTintColor = (
  profileTextColor?: string,
  secondaryColor?: string
): string =>
  profileTextColor
    ? blendColors(profileTextColor, Colors.neutral[50], 0.3)
    : secondaryColor || Colors.neutral[50];

export const getFeedItemKey = (item: FeedListItem | ExtendedFeedViewPost, index = 0): string => {
  if (isFeedHeaderItem(item)) {
    return `header-${index}`;
  }
  return item.post?.uri ?? item.post?.cid ?? `feed-${index}`;
};

export const getEmptyFeedType = (feedOption: string): 'no-following' | 'no-videos' =>
  feedOption === FEED_TYPES.FOLLOWING ? 'no-following' : 'no-videos';

const normalizeHexRgb = (value: string): string | null => {
  const t = value.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t;
  if (/^#[0-9a-fA-F]{8}$/i.test(t)) return `#${t.slice(1, 7)}`;
  if (/^#[0-9a-fA-F]{3}$/i.test(t)) {
    const [r, g, b] = [t[1], t[2], t[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
};

export const getEndOfFeedOverscrollTextColor = (
  profileTextColor?: string,
  secondaryColor?: string
): string => {
  const raw = profileTextColor ?? secondaryColor;
  const hex = raw ? normalizeHexRgb(raw) : null;
  if (!hex) return Colors.neutral[300];
  return hexToRGBA(hex, 0.98);
};

const feedSurfaceStyles = StyleSheet.create({
  root: { flex: 1 },
  layer: { ...StyleSheet.absoluteFill },
  on: { opacity: 1, zIndex: 1 },
  off: { opacity: 0, zIndex: 0 },
});

const layerOnStyle = [feedSurfaceStyles.layer, feedSurfaceStyles.on];
const layerOffStyle = [feedSurfaceStyles.layer, feedSurfaceStyles.off];

type FeedSurfaceStackProps = {
  listActive: boolean;
  listSurface: ReactNode;
  gridSurface: ReactNode;
};

export function FeedSurfaceStack({ listActive, listSurface, gridSurface }: FeedSurfaceStackProps) {
  const layer = (on: boolean, node: ReactNode) => (
    <View
      collapsable={false}
      style={on ? layerOnStyle : layerOffStyle}
      pointerEvents={on ? 'auto' : 'none'}
      importantForAccessibility={on ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={Platform.OS === 'ios' ? !on : undefined}
    >
      {node}
    </View>
  );

  return (
    <View style={feedSurfaceStyles.root} collapsable={false}>
      {layer(listActive, listSurface)}
      {layer(!listActive, gridSurface)}
    </View>
  );
}

export function createReanimatedScrollComponent(
  animatedScrollRef: { (instance: Animated.ScrollView | null): void },
  props: ScrollViewProps
): React.ReactElement {
  const { ref: flashListScrollRef, ...rest } = props as ScrollViewProps & {
    ref?: React.Ref<Animated.ScrollView>;
  };
  return (
    <Animated.ScrollView
      {...rest}
      // eslint-disable-next-line react/jsx-no-bind
      ref={(node: Animated.ScrollView | null) => {
        animatedScrollRef(node);
        if (typeof flashListScrollRef === 'function') {
          (flashListScrollRef as (instance: Animated.ScrollView | null) => void)(node);
        } else if (flashListScrollRef != null) {
          (flashListScrollRef as React.MutableRefObject<Animated.ScrollView | null>).current = node;
        }
      }}
    />
  );
}

export type FeedLayout = {
  viewportHeight: number;
  viewportWidth: number;
  topInset: number;
  bottomInset: number;
};

const FeedLayoutContext = createContext<FeedLayout | null>(null);

export const FeedLayoutProvider = FeedLayoutContext.Provider;

export function useFeedLayout(): FeedLayout {
  const value = useContext(FeedLayoutContext);
  if (!value) {
    throw new Error('useFeedLayout must be used inside a FeedLayoutProvider');
  }
  return value;
}
