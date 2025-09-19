/**
 * Rich Text Parser for Bluesky AT Protocol
 * Handles parsing text to detect mentions, links, and hashtags with proper UTF-8 byte indexing
 * Based on Bluesky API documentation: https://atproto.com/guides/richtext
 */

import TLDs from 'tlds';

// Types for rich text facets
export interface RichTextFacet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<{
    $type: string;
    uri?: string;
    did?: string;
    tag?: string;
  }>;
}

export interface ParsedRichText {
  text: string;
  facets?: RichTextFacet[];
}

// Unicode string helper class for proper UTF-8 byte indexing
class UnicodeString {
  utf16: string;
  utf8: Uint8Array;

  constructor(utf16: string) {
    this.utf16 = utf16;
    this.utf8 = new TextEncoder().encode(utf16);
  }

  // Helper to convert utf16 code-unit offsets to utf8 code-unit offsets
  utf16IndexToUtf8Index(i: number): number {
    return new TextEncoder().encode(this.utf16.slice(0, i)).byteLength;
  }
}

// Validate if a string is a valid domain
function isValidDomain(str: string): boolean {
  return !!TLDs.find((tld) => {
    const i = str.lastIndexOf(tld);
    if (i === -1) {
      return false;
    }
    return str.charAt(i - 1) === '.' && i === str.length - tld.length;
  });
}

/**
 * Parse text and generate rich text facets for mentions, links, and hashtags
 * @param text - The text to parse
 * @returns Parsed rich text with facets
 */
export function parseRichText(text: string): ParsedRichText {
  if (!text || text.trim().length === 0) {
    return { text };
  }

  const unicodeText = new UnicodeString(text);
  const facets: RichTextFacet[] = [];
  let match: RegExpExecArray | null;

  // Parse mentions (@username.domain)
  const mentionRegex = /(^|\s|\()(@)([a-zA-Z0-9.-]+)(\b)/g;
  while ((match = mentionRegex.exec(unicodeText.utf16)) !== null) {
    if (!isValidDomain(match[3]) && !match[3].endsWith('.test')) {
      continue; // Probably not a handle
    }

    const start = unicodeText.utf16.indexOf(match[3], match.index) - 1;
    const end = start + match[3].length + 1;
    
    facets.push({
      index: {
        byteStart: unicodeText.utf16IndexToUtf8Index(start),
        byteEnd: unicodeText.utf16IndexToUtf8Index(end),
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#mention',
          did: match[3], // Note: This should be resolved to actual DID in production
        },
      ],
    });
  }

  // Parse links (URLs and domain names)
  const linkRegex = /(^|\s|\()((https?:\/\/[\S]+)|((?<domain>[a-z][a-z0-9]*(\.[a-z0-9]+)+)[\S]*))/gim;
  while ((match = linkRegex.exec(unicodeText.utf16)) !== null) {
    let uri = match[2];
    if (!uri.startsWith('http')) {
      const domain = match.groups?.domain;
      if (!domain || !isValidDomain(domain)) {
        continue;
      }
      uri = `https://${uri}`;
    }

    const start = unicodeText.utf16.indexOf(match[2], match.index);
    let end = start + match[2].length;
    
    // Strip ending punctuation
    if (/[.,;!?]$/.test(uri)) {
      uri = uri.slice(0, -1);
      end--;
    }
    if (/[)]$/.test(uri) && !uri.includes('(')) {
      uri = uri.slice(0, -1);
      end--;
    }

    facets.push({
      index: {
        byteStart: unicodeText.utf16IndexToUtf8Index(start),
        byteEnd: unicodeText.utf16IndexToUtf8Index(end),
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#link',
          uri,
        },
      ],
    });
  }

  // Parse hashtags
  const hashtagRegex = /(?:^|\s)(#[^\d\s]\S*)(?=\s)?/g;
  while ((match = hashtagRegex.exec(unicodeText.utf16)) !== null) {
    let tag = match[0];
    const hasLeadingSpace = /^\s/.test(tag);
    
    tag = tag.trim().replace(/\p{P}+$/gu, ''); // Strip ending punctuation
    
    // Max of 64 chars (inclusive of #)
    if (tag.length > 66) continue;

    const index = match.index + (hasLeadingSpace ? 1 : 0);
    
    facets.push({
      index: {
        byteStart: unicodeText.utf16IndexToUtf8Index(index),
        byteEnd: unicodeText.utf16IndexToUtf8Index(index + tag.length),
      },
      features: [
        {
          $type: 'app.bsky.richtext.facet#tag',
          tag: tag.replace(/^#/, ''),
        },
      ],
    });
  }

  // Remove overlapping facets (keep the first one)
  const sortedFacets = facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
  const nonOverlappingFacets: RichTextFacet[] = [];
  
  for (const facet of sortedFacets) {
    const hasOverlap = nonOverlappingFacets.some(existing => 
      facet.index.byteStart < existing.index.byteEnd && 
      facet.index.byteEnd > existing.index.byteStart
    );
    
    if (!hasOverlap) {
      nonOverlappingFacets.push(facet);
    }
  }

  return {
    text,
    facets: nonOverlappingFacets.length > 0 ? nonOverlappingFacets : undefined,
  };
}

/**
 * Resolve mention handles to DIDs (placeholder implementation)
 * In production, this should resolve handles to actual DIDs using the AT Protocol
 * @param handles - Array of handles to resolve
 * @returns Map of handles to DIDs
 */
export async function resolveMentionsToDIDs(handles: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  
  // TODO: Implement actual DID resolution using AT Protocol
  // For now, we'll use handles as placeholders
  // In production, you would call the AT Protocol resolve API
  for (const handle of handles) {
    resolved.set(handle, handle); // Placeholder
  }
  
  return resolved;
}

/**
 * Parse text and resolve mentions to DIDs
 * @param text - The text to parse
 * @returns Parsed rich text with resolved DIDs
 */
export async function parseRichTextWithResolvedMentions(text: string): Promise<ParsedRichText> {
  const parsed = parseRichText(text);
  
  if (!parsed.facets) {
    return parsed;
  }

  // Extract handles from mention facets
  const handles: string[] = [];
  const mentionFacets = parsed.facets.filter(facet => 
    facet.features.some(feature => feature.$type === 'app.bsky.richtext.facet#mention')
  );
  
  for (const facet of mentionFacets) {
    const mentionFeature = facet.features.find(f => f.$type === 'app.bsky.richtext.facet#mention');
    if (mentionFeature?.did) {
      handles.push(mentionFeature.did);
    }
  }

  // Resolve handles to DIDs
  const resolvedDIDs = await resolveMentionsToDIDs(handles);
  
  // Update facets with resolved DIDs
  const updatedFacets = parsed.facets.map(facet => ({
    ...facet,
    features: facet.features.map(feature => {
      if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
        return {
          ...feature,
          did: resolvedDIDs.get(feature.did) || feature.did,
        };
      }
      return feature;
    }),
  }));

  return {
    text: parsed.text,
    facets: updatedFacets,
  };
}
