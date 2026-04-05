import React, { useMemo, useState } from 'react';
import { Text, Linking, StyleSheet, StyleProp, TextStyle, type TextProps } from 'react-native';
import { RichText } from '@atproto/api';
import { Typography } from '../../utils/components/typography';
import { NATIVE_PRESSABLE_ACTIVE_OPACITY } from '@/utils/constants';

export interface TextWithLinksProps {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  ellipsizeMode?: TextProps['ellipsizeMode'];
  onTextLayout?: TextProps['onTextLayout'];
  suffix?: React.ReactNode;
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

function InlinePressableText({
  style,
  onPress,
  children,
}: {
  style?: StyleProp<TextStyle>;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Text
      style={[style, pressed && styles.pressed]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      suppressHighlighting
    >
      {children}
    </Text>
  );
}

function TextWithLinksBase({
  text,
  style,
  numberOfLines,
  ellipsizeMode,
  onTextLayout,
  suffix,
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
    <Text
      style={style}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      onTextLayout={onTextLayout}
    >
      {Array.from(rt.segments()).map((segment, i) => {
        if (segment.isLink() && segment.link?.uri) {
          const uri = segment.link.uri;
          return (
            <InlinePressableText
              key={`${i}-link`}
              style={[style, styles.link]}
              onPress={() => handleLinkPress(uri)}
            >
              {segment.text}
            </InlinePressableText>
          );
        }
        if (segment.isMention() && segment.mention?.did) {
          const full = segment.text || '';
          const symbol = full[0] || '@';
          const handle = full.slice(1);
          return (
            <InlinePressableText
              key={`${i}-mention`}
              style={style}
              onPress={() => onAuthorPress(segment.mention!.did!, { did: segment.mention!.did })}
            >
              <Text style={styles.symbol}>{symbol}</Text>
              <Text style={styles.mentionTagText}>{handle}</Text>
            </InlinePressableText>
          );
        }
        if (segment.isMention()) {
          // Unresolved mention (common when using detectFacetsWithoutResolution): fall back to @handle text.
          const candidate = stripAtPrefix((segment.text || '').trim());
          if (candidate) {
            const full = segment.text || '';
            const symbol = full[0] || '@';
            const handle = full.slice(1);
            return (
              <InlinePressableText
                key={`${i}-mention-unresolved`}
                style={style}
                onPress={() => onAuthorPress(candidate)}
              >
                <Text style={styles.symbol}>{symbol}</Text>
                <Text style={styles.mentionTagText}>{handle}</Text>
              </InlinePressableText>
            );
          }
        }
        if (segment.isTag() && segment.tag?.tag && onHashtagPress) {
          const full = segment.text || '';
          const symbol = full[0] || '#';
          const tag = full.slice(1);
          return (
            <InlinePressableText
              key={`${i}-tag`}
              style={style}
              onPress={() => onHashtagPress(segment.tag!.tag!)}
            >
              <Text style={styles.symbol}>{symbol}</Text>
              <Text style={styles.mentionTagText}>{tag}</Text>
            </InlinePressableText>
          );
        }
        return <Text key={`${i}-plain`}>{segment.text}</Text>;
      })}
      {suffix}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
    fontFamily: Typography.families.medium,
  },
  symbol: {
    fontFamily: Typography.families.medium,
  },
  mentionTagText: {
    fontFamily: Typography.families.bold,
  },
  pressed: {
    opacity: NATIVE_PRESSABLE_ACTIVE_OPACITY,
  },
});

export const TextWithLinks = React.memo(TextWithLinksBase);
export const TextWithAuthorLinks = React.memo(TextWithLinksBase);
