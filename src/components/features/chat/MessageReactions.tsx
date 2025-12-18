import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Vibration } from 'react-native';
import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { ReactionView } from '../../../services/ChatService';

interface MessageReactionsProps {
  reactions: ReactionView[];
  currentUserId: string;
  onReactionPress: (emoji: string, isCurrentUserReacted: boolean) => void;
  messageId: string;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  isCurrentUserReacted: boolean;
  hasOtherUserReaction: boolean;
}

export default function MessageReactions({ 
  reactions, 
  currentUserId, 
  onReactionPress, 
  messageId 
}: MessageReactionsProps) {
  // Animation values for each reaction
  const animationValues = React.useRef(new Map<string, Animated.Value>()).current;
  
  // Group reactions by emoji and count them
  const groupedReactions: GroupedReaction[] = React.useMemo(() => {
    const reactionMap = new Map<string, { count: number; isCurrentUserReacted: boolean; hasOtherUserReaction: boolean }>();
    
    reactions.forEach((reaction) => {
      const existing = reactionMap.get(reaction.value);
      if (existing) {
        existing.count += 1;
        if (reaction.sender.did === currentUserId) {
          existing.isCurrentUserReacted = true;
        } else {
          existing.hasOtherUserReaction = true;
        }
      } else {
        reactionMap.set(reaction.value, {
          count: 1,
          isCurrentUserReacted: reaction.sender.did === currentUserId,
          hasOtherUserReaction: reaction.sender.did !== currentUserId,
        });
      }
    });
    
    return Array.from(reactionMap.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      isCurrentUserReacted: data.isCurrentUserReacted,
      hasOtherUserReaction: data.hasOtherUserReaction,
    }));
  }, [reactions, currentUserId]);

  // Initialize animation values for new reactions
  React.useEffect(() => {
    groupedReactions.forEach((reaction) => {
      if (!animationValues.has(reaction.emoji)) {
        animationValues.set(reaction.emoji, new Animated.Value(1));
      }
    });
  }, [groupedReactions, animationValues]);

  // Animate reaction press with haptic feedback
  const animateReaction = (emoji: string) => {
    const animValue = animationValues.get(emoji);
    if (animValue) {
      // Consistent haptic feedback for all reactions
      Vibration.vibrate(50);
      
      // Same animation for all reactions
      Animated.sequence([
        Animated.timing(animValue, {
          toValue: 0.85,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(animValue, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  if (groupedReactions.length === 0) {
    return null;
  }

  // Check if current user has reacted to any emoji
  const hasCurrentUserReaction = groupedReactions.some(reaction => reaction.isCurrentUserReacted);

  return (
    <View style={styles.reactionsContainer}>
      <View style={styles.reactionsContent}>
          {groupedReactions.map((reaction, index) => {
            const animValue = animationValues.get(reaction.emoji) || new Animated.Value(1);
            const isFirst = index === 0;
            const isLast = index === groupedReactions.length - 1;
            
            return (
              <Animated.View
                key={reaction.emoji}
                style={[
                  styles.individualReaction,
                  { transform: [{ scale: animValue }] }
                ]}
              >
                <Pressable
                  style={[
                    styles.reactionButton,
                    isFirst && styles.reactionSegmentFirst,
                    !isFirst && !isLast && styles.reactionSegmentMiddle,
                    isLast && styles.reactionSegmentLast,
                    reaction.isCurrentUserReacted && styles.reactionButtonCurrentUser,
                    reaction.hasOtherUserReaction && !reaction.isCurrentUserReacted && styles.reactionButtonOtherUser,
                  ]}
                  onPress={() => {
                    animateReaction(reaction.emoji);
                    onReactionPress(reaction.emoji, reaction.isCurrentUserReacted);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[
                    styles.emoji,
                    reaction.isCurrentUserReacted && styles.emojiActive,
                  ]}>
                    {reaction.emoji}
                  </Text>
                  {reaction.count > 1 && (
                    <Text style={[
                      styles.count,
                      reaction.isCurrentUserReacted && styles.currentUserCount,
                    ]}>
                      {reaction.count}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reactionsContainer: {
    marginTop: 8,
    marginHorizontal: 0,
    alignItems: 'center',
  },
  combinedReactionBubble: {
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 28,
    alignSelf: 'center',
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  currentUserReactionBubble: {
    backgroundColor: Colors.darkGreen,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  reactionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 2,
    paddingVertical: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  individualReaction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
    minHeight: 28,
    minWidth: 28,
  },
  reactionSegmentFirst: {
    borderTopLeftRadius: BORDER_RADIUS.FULL,
    borderBottomLeftRadius: BORDER_RADIUS.FULL,
  },
  reactionSegmentMiddle: {
    // No special styling for middle segments
  },
  reactionSegmentLast: {
    borderTopRightRadius: BORDER_RADIUS.FULL,
    borderBottomRightRadius: BORDER_RADIUS.FULL,
  },
  reactionButtonCurrentUser: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.18)',
  },
  reactionButtonOtherUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  emoji: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 18,
  },
  emojiActive: {
    // No special styling - matches default emoji
  },
  count: {
    fontSize: 11,
    fontFamily: 'Firma-Bold',
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 3,
    lineHeight: 13,
    minWidth: 14,
    textAlign: 'center',
  },
  currentUserCount: {
    color: Colors.white,
    opacity: 1,
  },
});
