/**
 * Tab-aware channel routes expect an encoded feed URI segment.
 */
export function navigateToEncodedChannelUri(
  uri: string | undefined | null,
  navigateToChannel: (encodedChannelId: string) => void
): void {
  const trimmed = uri?.trim();
  if (!trimmed) return;
  navigateToChannel(encodeURIComponent(trimmed));
}
