import type { RichTextFacet } from '@/utils/types/richText';

export type ChatRichTextPart = {
  text: string;
  isSemiBold?: boolean;
  isSymbol?: boolean;
  kind?: 'mention' | 'hashtag' | 'link';
  identifier?: string;
  href?: string;
};

export function formatChatRichTextParts(
  text: string,
  facets?: RichTextFacet[] | null
): ChatRichTextPart[] {
  if (!text) return [{ text: '', isSemiBold: false }];
  if (!facets || facets.length === 0) return [{ text, isSemiBold: false }];

  const parts: ChatRichTextPart[] = [];
  const textBytes = new TextEncoder().encode(text);
  let lastByteIndex = 0;
  const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  for (const facet of sortedFacets) {
    const start = Math.max(0, Math.min(textBytes.length, facet.index.byteStart));
    const end = Math.max(start, Math.min(textBytes.length, facet.index.byteEnd));

    if (start > lastByteIndex) {
      const beforeText = new TextDecoder().decode(textBytes.slice(lastByteIndex, start));
      if (beforeText) parts.push({ text: beforeText, isSemiBold: false });
    }

    const facetText = new TextDecoder().decode(textBytes.slice(start, end));
    const features = facet.features ?? [];
    const mentionFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#mention');
    const hashtagFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#tag');
    const linkFeature = features.find(f => f.$type === 'app.bsky.richtext.facet#link');

    const isMention = !!mentionFeature;
    const isHashtag = !!hashtagFeature;
    const isLink = !!linkFeature;

    if (isMention || isHashtag) {
      const symbol = facetText[0];
      const textAfterSymbol = facetText.slice(1);
      const base: Omit<ChatRichTextPart, 'text' | 'isSemiBold'> = {
        kind: isMention ? 'mention' : 'hashtag',
        identifier:
          textAfterSymbol ||
          (isMention
            ? mentionFeature?.did || mentionFeature?.uri || ''
            : hashtagFeature?.tag || ''),
      };

      if (symbol) parts.push({ text: symbol, isSemiBold: false, isSymbol: true, ...base });
      if (textAfterSymbol) parts.push({ text: textAfterSymbol, isSemiBold: true, ...base });
    } else if (isLink) {
      const href = linkFeature?.uri || facetText;
      parts.push({
        text: facetText,
        isSemiBold: false,
        kind: 'link',
        href,
      });
    } else {
      parts.push({ text: facetText, isSemiBold: false });
    }

    lastByteIndex = end;
  }

  if (lastByteIndex < textBytes.length) {
    const remainingText = new TextDecoder().decode(textBytes.slice(lastByteIndex));
    if (remainingText) parts.push({ text: remainingText, isSemiBold: false });
  }

  return parts.length > 0 ? parts : [{ text, isSemiBold: false }];
}
