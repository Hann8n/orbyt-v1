import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '../../theme';
import { LinearGradient } from './LinearGradient';
import { extractColorsFromImage, darkenColor } from '../../utils/formatting/colors';

interface BlurredBackgroundProps {
  thumbnailUrl: string | null;
  onBlurReady?: () => void;
  /** When false, no dark overlay on top of the blur (e.g. for video post preview) */
  darkOverlay?: boolean;
}

const ambientColorCache = new Map<string, { backgroundColor: string; accentColor: string }>();

const BlurredBackground = memo(function BlurredBackground({
  thumbnailUrl,
  onBlurReady,
  darkOverlay = true,
}: BlurredBackgroundProps) {
  const [colors, setColors] = useState<{ backgroundColor: string; accentColor: string }>(() => ({
    backgroundColor: Colors.black,
    accentColor: Colors.neutral[800] ?? Colors.black,
  }));

  const notifiedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!thumbnailUrl) return;

    let cancelled = false;

    const url = thumbnailUrl;

    async function run(): Promise<void> {
      const cached = ambientColorCache.get(url);
      if (cached) {
        setColors(cached);
        if (notifiedUrlRef.current !== url) {
          notifiedUrlRef.current = url;
          onBlurReady?.();
        }
        return;
      }

      try {
        const extracted = await extractColorsFromImage(url);

        // Darken aggressively so the background stays subtle behind readable video UI.
        const backgroundColor = darkenColor(extracted.backgroundColor, 0.55);
        const accentColor = darkenColor(extracted.accentColor, 0.6);

        const next = { backgroundColor, accentColor };
        if (cancelled) return;

        ambientColorCache.set(url, next);
        setColors(next);

        if (notifiedUrlRef.current !== url) {
          notifiedUrlRef.current = url;
          onBlurReady?.();
        }
      } catch {
        // Keep defaults.
        if (cancelled) return;
        if (notifiedUrlRef.current !== url) {
          notifiedUrlRef.current = url;
          onBlurReady?.();
        }
      }
    }

    // Reset notification for this thumbnail, so poster hiding logic can trigger again.
    notifiedUrlRef.current = null;
    void run();

    return () => {
      cancelled = true;
    };
  }, [thumbnailUrl, onBlurReady]);

  if (!thumbnailUrl) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <LinearGradient
        colors={[colors.backgroundColor, colors.accentColor]}
        style={styles.gradient}
      />

      {darkOverlay && <View style={styles.darkOverlay} />}
    </View>
  );
});

export default BlurredBackground;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    opacity: 0.5,
  },
});
