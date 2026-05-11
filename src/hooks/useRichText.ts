import { useState, useEffect } from 'react';
import { RichText as RichTextAPI } from '@atproto/api';

/**
 * Hook to process text into RichText instance and handle facet detection.
 * Uses detectFacetsWithoutResolution (synchronous) — full mention resolution
 * to DIDs only happens at post-creation time, not for display.
 * @param text - The text to process
 * @returns RichText instance with facets detected
 */
export function useRichText(text: string): RichTextAPI {
  const [richText, setRichText] = useState<RichTextAPI>(() => {
    const rt = new RichTextAPI({ text: text || '' });
    rt.detectFacetsWithoutResolution();
    return rt;
  });

  useEffect(() => {
    const rt = new RichTextAPI({ text: text || '' });
    rt.detectFacetsWithoutResolution();
    setRichText(rt);
  }, [text]);

  return richText;
}

export type RichTextDisplayPart = {
  displayKey: string;
  text: string;
  isSemiBold: boolean;
  isSymbol?: boolean;
};

/**
 * Format rich text for display (extracts mentions and hashtags for styling).
 * Uses the SDK's segments() iterator so byte-position math is handled internally.
 * @param richText - RichText instance from @atproto/api
 * @returns Array of text parts with formatting info
 */
export function formatRichTextForDisplay(richText: RichTextAPI): RichTextDisplayPart[] {
  const parts: RichTextDisplayPart[] = [];
  let k = 0;

  for (const segment of richText.segments()) {
    const segText = segment.text;
    if (!segText) continue;

    if (segment.isMention() || segment.isTag()) {
      const symbol = segText[0]; // @ or #
      const body = segText.slice(1);
      if (symbol) {
        parts.push({ displayKey: `rt-sym-${k++}`, text: symbol, isSemiBold: false, isSymbol: true });
      }
      if (body) {
        parts.push({ displayKey: `rt-body-${k++}`, text: body, isSemiBold: true });
      }
    } else {
      parts.push({ displayKey: `rt-plain-${k++}`, text: segText, isSemiBold: false });
    }
  }

  return parts.length > 0
    ? parts
    : [{ displayKey: 'rt-fallback', text: richText.text || '', isSemiBold: false }];
}
