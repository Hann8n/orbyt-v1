import React, { useMemo } from 'react';
import { Text, Linking, StyleSheet, TextStyle } from 'react-native';
import { RichText } from '@atproto/api';
import { Colors } from '../../theme';
import { Typography } from '../../utils/components/typography';

export interface TextWithLinksProps {
  text: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  /**
   * Called for @mention / profile taps.
   * - `identifier` may be a DID (preferred) or a handle (without `@`)
   * - `data.did` is provided when the facet includes a DID
   */
  onAuthorPress: (identifier: string, data?: { did?: string }) => void;
  onHashtagPress?: (tag: string) => void;
  /** Called for link taps. If omitted, opens url with Linking.openURL. */
  onLinkPress?: (uri: string) => void;
  /** AT Protocol facets; if not provided, RichText.detectFacetsWithoutResolution is used. */
  facets?: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
  }>;
}

function stripAtPrefix(s: string): string {
  return s.startsWith('@') ? s.slice(1) : s;
}

function extractProfileIdentifierFromUrl(uri: string): string | null {
  // Accept plain domains (bsky.app/profile/...) and full https URLs.
  // Examples:
  // - https://bsky.app/profile/did:plc:abc
  // - https://bsky.app/profile/alice.bsky.social
  // - bsky.app/profile/alice.bsky.social
  const normalized = uri.startsWith('http') ? uri : `https://${uri}`;
  try {
    const u = new URL(normalized);
    if (u.hostname !== 'bsky.app') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'profile') {
      const id = parts[1];
      return id ? decodeURIComponent(id) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function TextWithLinksBase({
  text,
  style,
  numberOfLines,
  onAuthorPress,
  onHashtagPress,
  onLinkPress,
  facets,
}: TextWithLinksProps) {
  const rt = useMemo(() => {
    const r = new RichText({ text: text || '', facets });
    if (!facets?.length) {
      r.detectFacetsWithoutResolution();
    }
    return r;
  }, [text, facets]);

  const handleLinkPress = (uri: string) => {
    // Treat bsky.app profile links as in-app profile navigation.
    const profileId = extractProfileIdentifierFromUrl(uri);
    if (profileId) {
      onAuthorPress(profileId, { did: profileId.startsWith('did:') ? profileId : undefined });
      return;
    }

    if (onLinkPress) {
      onLinkPress(uri);
    } else {
      const normalized = uri.startsWith('http') ? uri : `https://${uri}`;
      Linking.openURL(normalized).catch(() => {});
    }
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {Array.from(rt.segments()).map((segment, i) => {
        if (segment.isLink() && segment.link?.uri) {
          return (
            <Text
              key={`${i}-link`}
              style={[style, styles.link]}
              onPress={() => handleLinkPress(segment.link!.uri!)}
              suppressHighlighting
            >
              {segment.text}
            </Text>
          );
        }
        if (segment.isMention() && segment.mention?.did) {
          return (
            <Text
              key={`${i}-mention`}
              style={[style, styles.mention]}
              onPress={() => onAuthorPress(segment.mention!.did!, { did: segment.mention!.did })}
              suppressHighlighting
            >
              {segment.text}
            </Text>
          );
        }
        if (segment.isMention()) {
          // Unresolved mention (common when using detectFacetsWithoutResolution): fall back to @handle text.
          const candidate = stripAtPrefix((segment.text || '').trim());
          if (candidate) {
            return (
              <Text
                key={`${i}-mention-unresolved`}
                style={[style, styles.mention]}
                onPress={() => onAuthorPress(candidate)}
                suppressHighlighting
              >
                {segment.text}
              </Text>
            );
          }
        }
        if (segment.isTag() && segment.tag?.tag && onHashtagPress) {
          return (
            <Text
              key={`${i}-tag`}
              style={[style, styles.tag]}
              onPress={() => onHashtagPress(segment.tag!.tag!)}
              suppressHighlighting
            >
              {segment.text}
            </Text>
          );
        }
        return <Text key={`${i}-plain`}>{segment.text}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: Colors.teal[400],
    textDecorationLine: 'underline',
    textDecorationColor: Colors.teal[400],
    fontFamily: Typography.families.medium,
  },
  mention: {
    fontFamily: Typography.families.semibold,
  },
  tag: {
    fontFamily: Typography.families.semibold,
  },
});

export const TextWithLinks = React.memo(TextWithLinksBase);
export const TextWithAuthorLinks = TextWithLinks;
