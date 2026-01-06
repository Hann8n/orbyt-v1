import { useState, useEffect } from 'react';
import { RichText as RichTextAPI } from '@atproto/api';
import { logger } from '../utils/logger';

/**
 * Hook to process text into RichText instance and handle facet resolution
 * Similar to Bluesky's useRichText hook
 * @param text - The text to process
 * @returns [RichText instance, isResolving boolean]
 */
export function useRichText(text: string): [RichTextAPI, boolean] {
  const [richText, setRichText] = useState<RichTextAPI>(() => {
    return new RichTextAPI({ text: text || '' });
  });
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    // Create new RichText instance when text changes
    const rt = new RichTextAPI({ text: text || '' });

    // Detect facets without resolution first (synchronous)
    rt.detectFacetsWithoutResolution();

    setRichText(rt);
    setIsResolving(true);

    // Resolve mentions asynchronously
    const resolveFacets = async () => {
      try {
        // For display purposes, we use detectFacetsWithoutResolution
        // This detects facets but doesn't resolve mentions to DIDs
        // Full resolution happens when creating posts
        rt.detectFacetsWithoutResolution();
        setRichText(rt);
      } catch (error) {
        logger.error('Error detecting facets', error, { component: 'useRichText' });
        // Keep the unresolved version if detection fails
      } finally {
        setIsResolving(false);
      }
    };

    resolveFacets();
  }, [text]);

  return [richText, isResolving];
}

/**
 * Format rich text for display (extracts mentions and hashtags for styling)
 * @param richText - RichText instance from @atproto/api
 * @returns Array of text parts with formatting info
 */
export function formatRichTextForDisplay(
  richText: RichTextAPI
): Array<{ text: string; isSemiBold: boolean }> {
  const parts: Array<{ text: string; isSemiBold: boolean }> = [];
  const text = richText.text;

  if (!text || !richText.facets || richText.facets.length === 0) {
    return [{ text: text || '', isSemiBold: false }];
  }

  const textBytes = new TextEncoder().encode(text);
  let lastByteIndex = 0;
  const sortedFacets = [...richText.facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  for (const facet of sortedFacets) {
    // Add text before facet
    if (facet.index.byteStart > lastByteIndex) {
      const beforeBytes = textBytes.slice(lastByteIndex, facet.index.byteStart);
      const beforeText = new TextDecoder().decode(beforeBytes);

      if (beforeText) {
        parts.push({ text: beforeText, isSemiBold: false });
      }
    }

    // Extract facet text using byte positions
    const facetBytes = textBytes.slice(facet.index.byteStart, facet.index.byteEnd);
    const facetText = new TextDecoder().decode(facetBytes);

    // Check if this is a mention or hashtag (for semi-bold styling)
    const isMention = facet.features.some(f => f.$type === 'app.bsky.richtext.facet#mention');
    const isHashtag = facet.features.some(f => f.$type === 'app.bsky.richtext.facet#tag');

    if (isMention || isHashtag) {
      // Split symbol from text for mentions/hashtags
      const symbol = facetText[0]; // @ or #
      const textAfterSymbol = facetText.slice(1);

      if (symbol) {
        parts.push({ text: symbol, isSemiBold: false });
      }
      if (textAfterSymbol) {
        parts.push({ text: textAfterSymbol, isSemiBold: true });
      }
    } else {
      parts.push({ text: facetText, isSemiBold: false });
    }

    lastByteIndex = facet.index.byteEnd;
  }

  // Add remaining text
  if (lastByteIndex < textBytes.length) {
    const remainingBytes = textBytes.slice(lastByteIndex);
    const remainingText = new TextDecoder().decode(remainingBytes);
    if (remainingText) {
      parts.push({ text: remainingText, isSemiBold: false });
    }
  }

  return parts.length > 0 ? parts : [{ text: text || '', isSemiBold: false }];
}
