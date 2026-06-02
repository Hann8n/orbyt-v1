import { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { NativePressable } from '@/components/ui/NativePressable';
import { Colors } from '@/theme';
import { BORDER_RADIUS } from '@/utils/constants';

/**
 * Full-screen profile (or any) image viewer. Open via `navigateToProfileImageViewer` from
 * `@/utils/navigation/profileImageViewer`.
 */
export default function ProfileImageViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string }>();
  const imageUri = useMemo(() => {
    const raw = params.uri;
    if (raw == null || raw === '') return '';
    const s = String(raw);
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }, [params.uri]);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  useEffect(() => {
    if (!imageUri && router.canGoBack()) {
      router.back();
    }
  }, [imageUri, router]);

  if (!imageUri) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" animated />
      <View style={styles.root} accessibilityLabel="Image viewer">
        <NativePressable
          style={styles.dismissArea}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
        >
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="contain" />
        </NativePressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.overlay.black95,
  },
  dismissArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '95%',
    height: '80%',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
});
