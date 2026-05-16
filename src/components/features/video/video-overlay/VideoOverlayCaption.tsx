import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';
import { useRecyclingState } from '@shopify/flash-list';

import { SquircleNativePressable } from '@/components/ui/Squircle';
import { TextWithAuthorLinks } from '../../../ui/TextWithLinks';
import { Colors } from '../../../../theme';
import { FontFamily, Typography } from '@/utils/components/typography';
import { BORDER_RADIUS } from '../../../../utils/constants';
import { hexToRGBA } from '../../../../utils/formatting/colors';
import type { ExtendedPostView, PostRecord } from '../../../../services/api/types';
import { AppBskyRichtextFacet } from '@atproto/api';

const HIT_SLOP_6_4 = { top: 6, bottom: 6, left: 4, right: 4 } as const;

const widthStyleCache = new Map<number, { width: number }>();
const getWidthStyle = (width: number): { width: number } => {
  const normalized = Math.max(0, Math.round(width));
  const cached = widthStyleCache.get(normalized);
  if (cached) return cached;
  const style = { width: normalized };
  widthStyleCache.set(normalized, style);
  return style;
};

export interface VideoOverlayCaptionProps {
  post: ExtendedPostView;
  onAuthorPress?: (
    identifier: string,
    data?: { did?: string; handle?: string; displayName?: string; avatar?: string }
  ) => void;
  onHashtagPress?: (hashtag: string) => void;
  /** Fires when caption collapses/expands so VideoCard can dim the underlying media. */
  onOverlayCollapsedChange?: (isCollapsed: boolean) => void;
}

/**
 * Description / caption block with show-more / show-less toggle. Owns the
 * one-line overflow measurement: a hidden measure layer renders the text once
 * to determine if it overflows; the result drives the visible layout.
 *
 * Memoized so likes/reposts don't re-run the measurement.
 */
function VideoOverlayCaptionComponent({
  post,
  onAuthorPress,
  onHashtagPress,
  onOverlayCollapsedChange,
}: VideoOverlayCaptionProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const record = post.record as PostRecord | undefined;
  const text = record?.text?.trim() ?? '';
  const hasDescription = text.length > 0;

  const [isOverlayCollapsed, setIsOverlayCollapsed] = useRecyclingState(true, [
    post?.uri,
    post?.record,
  ]);
  const [captionMeasureWidth, setCaptionMeasureWidth] = useState(0);
  const [descriptionOverflows, setDescriptionOverflows] = useRecyclingState<boolean | null>(null, [
    post?.uri,
    post?.record,
    width,
  ]);

  const toggleCollapsed = useCallback(() => {
    setIsOverlayCollapsed(prev => !prev);
  }, [setIsOverlayCollapsed]);

  const onCaptionHostLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setCaptionMeasureWidth(prev => (w > 0 && w !== prev ? w : prev));
  }, []);

  const onDescriptionOverflowMeasure = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const nextOverflows = e.nativeEvent.lines.length > 1;
      setDescriptionOverflows(prev => (prev === nextOverflows ? prev : nextOverflows));
    },
    [setDescriptionOverflows]
  );

  useEffect(() => {
    if (!hasDescription || descriptionOverflows === null) {
      onOverlayCollapsedChange?.(true);
      return;
    }
    if (!descriptionOverflows) {
      onOverlayCollapsedChange?.(true);
      return;
    }
    onOverlayCollapsedChange?.(isOverlayCollapsed);
  }, [hasDescription, descriptionOverflows, isOverlayCollapsed, onOverlayCollapsedChange]);

  const authorLinkPressHandler = useCallback(
    (identifier: string, data?: { did?: string }) => {
      onAuthorPress?.(identifier, data);
    },
    [onAuthorPress]
  );

  const captionMeasureWidthStyle = useMemo(
    () => getWidthStyle(captionMeasureWidth),
    [captionMeasureWidth]
  );
  const descriptionMeasureLayerStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionMeasureLayer, captionMeasureWidthStyle),
    [captionMeasureWidthStyle]
  );
  const descriptionMeasureTextStyle = useMemo(
    () => StyleSheet.compose(styles.descriptionText, captionMeasureWidthStyle),
    [captionMeasureWidthStyle]
  );

  if (!hasDescription) return null;

  const facets = record?.facets as AppBskyRichtextFacet.Main[] | undefined;

  return (
    <View style={styles.descriptionContainer}>
      <View style={styles.descriptionMeasureHost} onLayout={onCaptionHostLayout}>
        {descriptionOverflows === null && captionMeasureWidth > 0 ? (
          <View pointerEvents="none" style={descriptionMeasureLayerStyle} collapsable={false}>
            <TextWithAuthorLinks
              text={record?.text ?? ''}
              style={descriptionMeasureTextStyle}
              onTextLayout={onDescriptionOverflowMeasure}
              onAuthorPress={authorLinkPressHandler}
              onHashtagPress={onHashtagPress}
              facets={facets}
            />
          </View>
        ) : null}

        <View style={styles.descriptionCaptionColumn}>
          {descriptionOverflows === true && isOverlayCollapsed ? (
            <SquircleNativePressable
              onPress={toggleCollapsed}
              hitSlop={HIT_SLOP_6_4}
              accessibilityRole="button"
              accessibilityLabel={t('feed.showMore')}
              style={styles.descriptionTextFlexible}
            >
              <TextWithAuthorLinks
                text={record?.text ?? ''}
                style={descriptionCollapsedTextStyle}
                numberOfLines={1}
                ellipsizeMode="tail"
                onAuthorPress={authorLinkPressHandler}
                onHashtagPress={onHashtagPress}
                facets={facets}
              />
            </SquircleNativePressable>
          ) : descriptionOverflows === true && !isOverlayCollapsed ? (
            <View style={styles.descriptionExpandedWithToggle}>
              <TextWithAuthorLinks
                text={record?.text ?? ''}
                style={styles.descriptionText}
                onAuthorPress={authorLinkPressHandler}
                onHashtagPress={onHashtagPress}
                facets={facets}
              />
              <View style={styles.descriptionInlineToggleRow}>
                <View style={styles.descriptionTextFlexible} />
                <SquircleNativePressable
                  onPress={toggleCollapsed}
                  hitSlop={HIT_SLOP_6_4}
                  accessibilityRole="button"
                  accessibilityLabel={t('feed.showLess')}
                  style={descriptionToggleStyle}
                >
                  <Text style={styles.descriptionToggleButtonLabel}>{t('feed.showLess')}</Text>
                </SquircleNativePressable>
              </View>
            </View>
          ) : (
            <TextWithAuthorLinks
              text={record?.text ?? ''}
              style={styles.descriptionText}
              numberOfLines={descriptionOverflows === null ? 1 : undefined}
              ellipsizeMode={descriptionOverflows === null ? 'tail' : undefined}
              onAuthorPress={authorLinkPressHandler}
              onHashtagPress={onHashtagPress}
              facets={facets}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  descriptionContainer: {
    paddingRight: 10,
  },
  descriptionMeasureHost: {
    width: '100%',
    position: 'relative',
  },
  descriptionMeasureLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0,
    zIndex: -1,
  },
  descriptionCaptionColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  descriptionExpandedWithToggle: {
    width: '100%',
    flexDirection: 'column',
    gap: 6,
  },
  descriptionInlineToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 6,
  },
  descriptionTextFlexible: {
    flex: 1,
    minWidth: 0,
  },
  descriptionToggleSurface: {
    backgroundColor: hexToRGBA(Colors.neutral[50], 0.12),
    borderRadius: BORDER_RADIUS.SMALL,
    paddingVertical: 3,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  descriptionTogglePressable: {
    flexShrink: 0,
  },
  descriptionToggleButtonLabel: {
    color: Colors.overlay.white80,
    fontSize: Typography.sizes.caption,
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.caption,
    includeFontPadding: false,
  },
  descriptionText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.body,
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.body,
    textShadowColor: Colors.transparent,
    textShadowRadius: 0,
  },
});

// Static compositions — computed once at module load, not per render.
const descriptionCollapsedTextStyle = StyleSheet.compose(
  styles.descriptionText,
  styles.descriptionTextFlexible
);
const descriptionToggleStyle = StyleSheet.compose(
  styles.descriptionToggleSurface,
  styles.descriptionTogglePressable
);

export const VideoOverlayCaption = memo(VideoOverlayCaptionComponent);
VideoOverlayCaptionComponent.displayName = 'VideoOverlayCaption';
