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

    // Guard against stale async completions when `text` changes rapidly or
    // the hook unmounts mid-resolution. Prevents out-of-order setRichText.
    let cancelled = false;

    const resolveFacets = async () => {
      try {
        // For display purposes, we use detectFacetsWithoutResolution
        // This detects facets but doesn't resolve mentions to DIDs
        // Full resolution happens when creating posts
        rt.detectFacetsWithoutResolution();
        if (cancelled) return;
        setRichText(rt);
      } catch (error) {
        if (cancelled) return;
        logger.error('Error detecting facets', error, { component: 'useRichText' });
      } finally {
        if (!cancelled) setIsResolving(false);
      }
    };

    resolveFacets();

    return () => {
      cancelled = true;
    };
  }, [text]);

  return [richText, isResolving];
}

export type RichTextDisplayPart = {
  displayKey: string;
  text: string;
  isSemiBold: boolean;
  isSymbol?: boolean;
};

/**
 * Format rich text for display (extracts mentions and hashtags for styling)
 * @param richText - RichText instance from @atproto/api
 * @returns Array of text parts with formatting info
 */
export function formatRichTextForDisplay(richText: RichTextAPI): RichTextDisplayPart[] {
  const parts: RichTextDisplayPart[] = [];
  const text = richText.text;

  if (!text || !richText.facets || richText.facets.length === 0) {
    return [{ displayKey: 'rt-all', text: text || '', isSemiBold: false }];
  }

  let partSeq = 0;
  const textBytes = new TextEncoder().encode(text);
  let lastByteIndex = 0;
  const sortedFacets = [...richText.facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  for (const facet of sortedFacets) {
    // Add text before facet
    if (facet.index.byteStart > lastByteIndex) {
      const beforeBytes = textBytes.slice(lastByteIndex, facet.index.byteStart);
      const beforeText = new TextDecoder().decode(beforeBytes);

      if (beforeText) {
        parts.push({
          displayKey: `rt-plain-${lastByteIndex}-${facet.index.byteStart}-${partSeq++}`,
          text: beforeText,
          isSemiBold: false,
        });
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
        parts.push({
          displayKey: `rt-sym-${facet.index.byteStart}-${facet.index.byteEnd}-${partSeq++}`,
          text: symbol,
          isSemiBold: false,
          isSymbol: true,
        });
      }
      if (textAfterSymbol) {
        parts.push({
          displayKey: `rt-body-${facet.index.byteStart}-${facet.index.byteEnd}-${partSeq++}`,
          text: textAfterSymbol,
          isSemiBold: true,
        });
      }
    } else {
      parts.push({
        displayKey: `rt-facet-${facet.index.byteStart}-${facet.index.byteEnd}-${partSeq++}`,
        text: facetText,
        isSemiBold: false,
      });
    }

    lastByteIndex = facet.index.byteEnd;
  }

  // Add remaining text
  if (lastByteIndex < textBytes.length) {
    const remainingBytes = textBytes.slice(lastByteIndex);
    const remainingText = new TextDecoder().decode(remainingBytes);
    if (remainingText) {
      parts.push({
        displayKey: `rt-trail-${lastByteIndex}-${textBytes.length}-${partSeq++}`,
        text: remainingText,
        isSemiBold: false,
      });
    }
  }

  return parts.length > 0
    ? parts
    : [{ displayKey: 'rt-fallback', text: text || '', isSemiBold: false }];
}
