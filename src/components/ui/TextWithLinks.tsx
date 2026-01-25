import React, { useMemo } from 'react';
import { Text, Linking, StyleSheet, TextStyle } from 'react-native';
import { RichText } from '@atproto/api';

export interface TextWithLinksProps {
  text: string;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  /** Called for @mention taps. handle: did or handle; data.did when from facet. */
  onAuthorPress: (handle: string, data?: { did?: string }) => void;
  onHashtagPress?: (tag: string) => void;
  /** Called for link taps. If omitted, opens url with Linking.openURL. */
  onLinkPress?: (uri: string) => void;
  /** AT Protocol facets; if not provided, RichText.detectFacetsWithoutResolution is used. */
  facets?: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
  }>;
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
    textDecorationLine: 'underline',
    fontFamily: 'Figtree-Medium',
  },
  mention: {
    fontFamily: 'Figtree-SemiBold',
  },
  tag: {
    fontFamily: 'Figtree-SemiBold',
  },
});

export const TextWithLinks = React.memo(TextWithLinksBase);
export const TextWithAuthorLinks = TextWithLinks;
