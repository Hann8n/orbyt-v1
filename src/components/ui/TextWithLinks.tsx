import React, { useState, useEffect } from 'react';
import { Text, Alert, Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import ProfileCache, { profileKeys, PROFILE_CACHE_EXPIRY } from '../../services/cache/ProfileCache';
import { StyleSheet } from 'react-native';

// Common interfaces
interface AuthorMention {
  startIndex: number;
  endIndex: number;
  handle: string;
  isValid: boolean;
}

interface TextPart {
  text: string;
  isAuthor?: boolean;
  isUrl?: boolean;
  isEmail?: boolean;
  handle?: string;
}

// Updated URL regex to avoid matching email addresses
const urlRegex = /(?:https?:\/\/)?(?:(?!@)[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?(?=\s|$)/gi;

// Updated email regex with lookahead to ensure we don't match URLs
const emailRegex = /(?:^|\s)([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)(?=\s|$)/gi;

// Regex for @mentions
const atMentionRegex = /(?:^|\s)(@[\w.-]+)(?=\s|$)/gi;

interface TextWithLinksProps {
  text: string;
  style: any;
  numberOfLines?: number;
  onAuthorPress: (handle: string) => void;
  parseUrls?: boolean;
}

export const TextWithLinks: React.FC<TextWithLinksProps> = ({
  text,
  style,
  numberOfLines,
  onAuthorPress,
  parseUrls = true
}) => {
  const [textParts, setTextParts] = useState<TextPart[]>([]);
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (!text) {
      setTextParts([]);
      return;
    }

    const mentions: AuthorMention[] = [];
    let match: RegExpExecArray | null;

    // Find all @mentions first
    while ((match = atMentionRegex.exec(text)) !== null) {
      const atSymbolIndex = match.index + match[0].indexOf('@');
      const rawHandle = match[1].substring(1); // Remove @ from the match
      const cleanedHandle = rawHandle.replace(/\.+$/, '');
      const mentionLength = 1 + cleanedHandle.length; // "@" plus the cleaned handle
      const mentionEnd = atSymbolIndex + mentionLength;
      const isValidBlueskyHandle = cleanedHandle.includes('.');
      
      if (isValidBlueskyHandle) {
        mentions.push({
          startIndex: atSymbolIndex,
          endIndex: mentionEnd,
          handle: cleanedHandle,
          isValid: true
        });

        // Profiles are now batch prefetched at the feed level, so we don't need individual prefetching here
        // The profile validation will happen when the user actually navigates to the profile
      }
    }

    // Process text into parts with URLs, mentions, and emails
    const parts: TextPart[] = [];
    let lastIndex = 0;

    // Sort mentions by start index
    mentions.sort((a, b) => a.startIndex - b.startIndex);

    for (const mention of mentions) {
      // Add text before the mention
      if (mention.startIndex > lastIndex) {
        const beforeText = text.substring(lastIndex, mention.startIndex);
        
        if (parseUrls) {
          // Find all matches first
          const urlMatches = Array.from(beforeText.matchAll(urlRegex));
          
          // Define a more specific type for email matches
          type EmailMatch = RegExpMatchArray & { 
            text: string;
            index: number;
          };
          
          const emailMatches = Array.from(beforeText.matchAll(emailRegex))
            .map(match => ({
              ...match,
              text: match[1], // Use capturing group to get clean email
              index: match.index! + (match[0].startsWith(' ') ? 1 : 0) // Adjust index if there's a leading space
            })) as EmailMatch[];

          // Define union type for all matches
          type CombinedMatch = RegExpMatchArray | EmailMatch;

          // Combine and sort matches, ensuring no overlaps
          const matches = [...urlMatches, ...emailMatches]
            .sort((a: CombinedMatch, b: CombinedMatch) => (a.index || 0) - (b.index || 0))
            // Filter out any overlapping matches
            .filter((match: CombinedMatch, index: number, arr: CombinedMatch[]) => {
              if (index === 0) return true;
              const prev = arr[index - 1];
              const prevEnd = (prev.index || 0) + prev[0].length;
              return (match.index || 0) >= prevEnd;
            });

          let urlLastIndex = 0;

          for (const match of matches) {
            if (match.index !== undefined) {
              if (match.index > urlLastIndex) {
                parts.push({
                  text: beforeText.substring(urlLastIndex, match.index),
                  isUrl: false,
                  isEmail: false,
                  isAuthor: false
                });
              }
              
              const matchText = 'text' in match ? match.text : match[0];
              parts.push({
                text: matchText,
                isUrl: !('text' in match),
                isEmail: 'text' in match,
                isAuthor: false
              });
              urlLastIndex = match.index + match[0].length;
            }
          }

          if (urlLastIndex < beforeText.length) {
            parts.push({
              text: beforeText.substring(urlLastIndex),
              isUrl: false,
              isEmail: false,
              isAuthor: false
            });
          }
        } else {
          parts.push({
            text: beforeText,
            isUrl: false,
            isEmail: false,
            isAuthor: false
          });
        }
      }

      // Add the mention - only add as author link if valid
      if (mention.isValid) {
        parts.push({
          text: text.substring(mention.startIndex, mention.endIndex),
          isAuthor: true,
          handle: mention.handle
        });
      } else {
        // Add as plain text if not a valid profile
        parts.push({
          text: text.substring(mention.startIndex, mention.endIndex),
          isAuthor: false,
          isUrl: false,
          isEmail: false
        });
      }

      lastIndex = mention.endIndex;
    }

    // Process remaining text using the same improved matching logic
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      
      if (parseUrls) {
        const urlMatches = Array.from(remainingText.matchAll(urlRegex));
        
        // Reuse the same type definitions as before
        type EmailMatch = RegExpMatchArray & { 
          text: string;
          index: number;
        };
        
        const emailMatches = Array.from(remainingText.matchAll(emailRegex))
          .map(match => ({
            ...match,
            text: match[1],
            index: match.index! + (match[0].startsWith(' ') ? 1 : 0)
          })) as EmailMatch[];

        type CombinedMatch = RegExpMatchArray | EmailMatch;

        const matches = [...urlMatches, ...emailMatches]
          .sort((a: CombinedMatch, b: CombinedMatch) => (a.index || 0) - (b.index || 0))
          .filter((match: CombinedMatch, index: number, arr: CombinedMatch[]) => {
            if (index === 0) return true;
            const prev = arr[index - 1];
            const prevEnd = (prev.index || 0) + prev[0].length;
            return (match.index || 0) >= prevEnd;
          });

        let urlLastIndex = 0;

        for (const match of matches) {
          if (match.index !== undefined) {
            if (match.index > urlLastIndex) {
              parts.push({
                text: remainingText.substring(urlLastIndex, match.index),
                isUrl: false,
                isEmail: false,
                isAuthor: false
              });
            }
            
            const matchText = 'text' in match ? match.text : match[0];
            parts.push({
              text: matchText,
              isUrl: !('text' in match),
              isEmail: 'text' in match,
              isAuthor: false
            });
            urlLastIndex = match.index + match[0].length;
          }
        }

        if (urlLastIndex < remainingText.length) {
          parts.push({
            text: remainingText.substring(urlLastIndex),
            isUrl: false,
            isEmail: false,
            isAuthor: false
          });
        }
      } else {
        parts.push({
          text: remainingText,
          isUrl: false,
          isEmail: false,
          isAuthor: false
        });
      }
    }

    setTextParts(parts);

    // Prefetch valid author profiles in the background for faster navigation
    try {
      const handlesToPrefetch = Array.from(
        new Set(
          mentions
            .filter(m => m.isValid && !!m.handle)
            .map(m => m.handle.toLowerCase())
        )
      );

      if (handlesToPrefetch.length > 0) {
        requestAnimationFrame(() => {
          setTimeout(async () => {
            try {
              await Promise.allSettled(
                handlesToPrefetch.map(handle =>
                  queryClient.prefetchQuery({
                    queryKey: profileKeys.detail(handle),
                    queryFn: () => ProfileCache.getProfile(handle),
                    staleTime: PROFILE_CACHE_EXPIRY,
                    gcTime: PROFILE_CACHE_EXPIRY * 2,
                  })
                )
              );
            } catch {}
          }, 0);
        });
      }
    } catch {}
  }, [text, queryClient, parseUrls]);

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
              onPress={() => handleUrlPress(part.text)}
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

// Also export a simpler version that only handles author mentions
export const TextWithAuthorLinks = (props: Omit<TextWithLinksProps, 'parseUrls'>) => (
  <TextWithLinks {...props} parseUrls={false} />
);
