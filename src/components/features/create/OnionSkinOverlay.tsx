import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import VideoProcessingService from '@/services/video/VideoProcessingService';
import { extractAssetId } from '@/utils/video/path';
import { useCreateSegmentsStore } from '@/stores/createSegmentsStore';
import type { Segment } from '@/stores/createSegmentsStore';

const getSegmentUri = (segment: Segment): string => {
  const v = segment.video;
  return v && typeof v === 'object' && 'uri' in v && typeof v.uri === 'string' ? v.uri : '';
};

const OnionSkinOverlay: React.FC = () => {
  const lastSegment = useCreateSegmentsStore(s => s.segments[s.segments.length - 1] ?? null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (!lastSegment) {
      setThumbnail(null);
      return;
    }
    const uri = getSegmentUri(lastSegment);
    if (!uri || lastSegment.duration <= 0) {
      setThumbnail(null);
      return;
    }
    let cancelled = false;
    const assetId = extractAssetId(lastSegment.video) ?? undefined;
    VideoProcessingService.extractLastFrame(uri, lastSegment.duration, assetId)
      .then(thumbUri => {
        if (!cancelled) setThumbnail(thumbUri);
      })
      .catch(() => {
        if (!cancelled) setThumbnail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lastSegment]);

  if (!thumbnail) return null;

  return (
    <Image
      source={{ uri: thumbnail }}
      style={styles.overlay}
      contentFit="cover"
      cachePolicy="memory-disk"
      pointerEvents="none"
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
    zIndex: 10,
  },
});

export default React.memo(OnionSkinOverlay);
