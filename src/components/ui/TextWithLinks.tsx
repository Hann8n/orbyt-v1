import React, { useState, useEffect } from 'react';
import { Text, Alert, Linking } from 'react-native';
import { StyleSheet } from 'react-native';
import type { RichTextFacet } from '../../utils/richTextParser';

interface TextPart {
  text: string;
  isAuthor?: boolean;
  isUrl?: boolean;
  isEmail?: boolean;
  isHashtag?: boolean;
  handle?: string;
  url?: string;
}


interface TextWithLinksProps {
  text: string;
  style: any;
  numberOfLines?: number;
  onAuthorPress: (handle: string) => void;
  facets?: RichTextFacet[];
}

export const TextWithLinks: React.FC<TextWithLinksProps> = ({
  text,
  style,
  numberOfLines,
  onAuthorPress,
  facets
}) => {
  const [textParts, setTextParts] = useState<TextPart[]>([]);

  const handleUrlPress = async (url: string) => {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    try {
      const canOpen = await Linking.canOpenURL(normalizedUrl);
      if (canOpen) {
        await Linking.openURL(normalizedUrl);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  const handleEmailPress = async (email: string) => {
    const mailtoUrl = `mailto:${email}`;
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          "Cannot Open Email",
          "No email app is configured on this device."
        );
      }
    } catch (error) {
      console.error('Error handling email:', error);
      Alert.alert(
        "Error",
        "Could not open email application. Please check your device settings."
      );
    }
  };

  // Parse facets into text parts (new method using proper AT Protocol facets)
  const parseFacetsToTextParts = (text: string, facets: RichTextFacet[]): TextPart[] => {
    if (!facets || facets.length === 0) {
      return [{ text }];
    }

    const parts: TextPart[] = [];
    const decoder = new TextDecoder();
    let lastIndex = 0;

    // Sort facets by byte start position
    const sortedFacets = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

    for (const facet of sortedFacets) {
      // Add text before the facet
      if (facet.index.byteStart > lastIndex) {
        const beforeText = decoder.decode(new TextEncoder().encode(text).slice(lastIndex, facet.index.byteStart));
        if (beforeText) {
          parts.push({ text: beforeText });
        }
      }

      // Add the facet text
      const facetText = decoder.decode(new TextEncoder().encode(text).slice(facet.index.byteStart, facet.index.byteEnd));
      
      // Determine the type of facet
      const linkFeature = facet.features.find(f => f.$type === 'app.bsky.richtext.facet#link');
      const mentionFeature = facet.features.find(f => f.$type === 'app.bsky.richtext.facet#mention');
      const tagFeature = facet.features.find(f => f.$type === 'app.bsky.richtext.facet#tag');

      if (linkFeature && linkFeature.uri) {
        parts.push({ text: facetText, isUrl: true, url: linkFeature.uri });
      } else if (mentionFeature && mentionFeature.did) {
        parts.push({ text: facetText, isAuthor: true, handle: mentionFeature.did });
      } else if (tagFeature && tagFeature.tag) {
        parts.push({ text: facetText, isHashtag: true });
      } else {
        parts.push({ text: facetText });
      }

      lastIndex = facet.index.byteEnd;
    }

    // Add remaining text after the last facet
    if (lastIndex < new TextEncoder().encode(text).length) {
      const remainingText = decoder.decode(new TextEncoder().encode(text).slice(lastIndex));
      if (remainingText) {
        parts.push({ text: remainingText });
      }
    }

    return parts;
  };

  useEffect(() => {
    if (!text) {
      setTextParts([]);
      return;
    }

    // Use facets-based parsing (AT Protocol standard)
    if (facets && facets.length > 0) {
      const parts = parseFacetsToTextParts(text, facets);
      setTextParts(parts);
    } else {
      // Fallback to plain text if no facets available
      setTextParts([{ text }]);
    }
  }, [text, facets]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {textParts.map((part, index) => {
        if (part.isAuthor && part.handle) {
          return (
            <Text
              key={index}
              style={[style, styles.authorLink]}
              onPress={() => onAuthorPress(part.handle!)}
              suppressHighlighting={true}
            >
              {part.text}
            </Text>
          );
        }
        if (part.isUrl) {
          return (
            <Text
              key={index}
              style={[style, styles.link]}
              onPress={() => handleUrlPress(part.url || part.text)}
              suppressHighlighting={true}
            >
              {part.text}
            </Text>
          );
        }
        if (part.isHashtag) {
          return (
            <Text
              key={index}
              style={[style, styles.link]}
              suppressHighlighting={true}
            >
              {part.text}
            </Text>
          );
        }
        if (part.isEmail) {
          return (
            <Text
              key={index}
              style={[style, styles.link]}
              onPress={() => handleEmailPress(part.text)}
              suppressHighlighting={true}
            >
              {part.text}
            </Text>
          );
        }
        return <Text key={index}>{part.text}</Text>;
      })}
    </Text>
  );
};

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
    fontFamily: 'Firma-Medium',
  },
  authorLink: {
    fontFamily: 'Firma-SemiBold',
  },
});

// Also export a simpler version that only handles author mentions (alias for backward compatibility)
export const TextWithAuthorLinks = TextWithLinks;
