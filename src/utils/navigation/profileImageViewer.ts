import { router, type Href } from 'expo-router';

const PATH = '/profile-image-viewer' as const;

export function buildProfileImageViewerHref(imageUri: string): Href {
  const trimmed = imageUri.trim();
  return {
    pathname: PATH,
    params: { uri: encodeURIComponent(trimmed) },
  } as Href;
}

/** Pushes the global profile image viewer modal. No-op for blank URIs. */
export function navigateToProfileImageViewer(imageUri: string): void {
  const trimmed = imageUri.trim();
  if (!trimmed) return;
  router.push(buildProfileImageViewerHref(trimmed));
}
