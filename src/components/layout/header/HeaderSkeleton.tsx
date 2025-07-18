import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { UI, TEXT } from '../../../utils/formatting/Colors';

interface HeaderSkeletonProps {
  textColor?: string;
  showAvatar?: boolean;
  showDescription?: boolean;
  avatarStyle?: 'circle' | 'rounded-square';
}

const HeaderSkeleton: React.FC<HeaderSkeletonProps> = ({
  textColor = TEXT.PRIMARY,
  showAvatar = true,
  showDescription = true,
  avatarStyle = 'circle',
}) => {
  const [pulseAnim] = useState(new Animated.Value(0.3));
  const [shimmerAnim] = useState(new Animated.Value(-1));
  
  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer animation
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);
  
  const baseSkeletonStyle = {
    opacity: pulseAnim,
    backgroundColor: textColor + '20', // More subtle opacity
  };

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-300, 300],
  });

  const ShimmerOverlay = ({ style }: { style: any }) => (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          transform: [{ translateX: shimmerTranslateX }],
          backgroundColor: textColor + '10',
        }
      ]}
    />
  );
  
  return (
    <View style={styles.skeletonContainer}>
      {showAvatar && (
        <View style={styles.avatarContainer}>
          <Animated.View style={[
            styles.skeletonAvatar, 
            baseSkeletonStyle,
            avatarStyle === 'rounded-square' && styles.skeletonAvatarRoundedSquare
          ]}>
            <ShimmerOverlay style={[
              styles.skeletonAvatar,
              avatarStyle === 'rounded-square' && styles.skeletonAvatarRoundedSquare
            ]} />
          </Animated.View>
        </View>
      )}
      
      <View style={styles.skeletonTextContainer}>
        <View style={styles.titleRow}>
          <Animated.View style={[styles.skeletonTitle, baseSkeletonStyle]}>
            <ShimmerOverlay style={styles.skeletonTitle} />
          </Animated.View>
          <Animated.View style={[styles.skeletonBadge, baseSkeletonStyle]}>
            <ShimmerOverlay style={styles.skeletonBadge} />
          </Animated.View>
        </View>
        
        <Animated.View style={[styles.skeletonSubtitle, baseSkeletonStyle]}>
          <ShimmerOverlay style={styles.skeletonSubtitle} />
        </Animated.View>
        
        {showDescription && (
          <View style={styles.descriptionContainer}>
            <Animated.View style={[styles.skeletonDescription, baseSkeletonStyle]}>
              <ShimmerOverlay style={styles.skeletonDescription} />
            </Animated.View>
            <Animated.View style={[styles.skeletonDescription, baseSkeletonStyle, { width: '85%' }]}>
              <ShimmerOverlay style={styles.skeletonDescription} />
            </Animated.View>
            <Animated.View style={[styles.skeletonDescription, baseSkeletonStyle, { width: '60%' }]}>
              <ShimmerOverlay style={styles.skeletonDescription} />
            </Animated.View>
          </View>
        )}

        {/* Action button skeleton */}
        <View style={styles.actionContainer}>
          <Animated.View style={[styles.skeletonButton, baseSkeletonStyle]}>
            <ShimmerOverlay style={styles.skeletonButton} />
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '100%',
    paddingVertical: 8,
  },
  avatarContainer: {
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  skeletonAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
  },
  skeletonAvatarRoundedSquare: {
    borderRadius: 16,
  },
  skeletonTextContainer: {
    width: '100%',
    alignSelf: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  skeletonTitle: {
    height: 28,
    width: '45%',
    borderRadius: 6,
    marginRight: 12,
    overflow: 'hidden',
  },
  skeletonBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  skeletonSubtitle: {
    height: 20,
    width: '35%',
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  skeletonDescription: {
    height: 18,
    width: '100%',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  skeletonButton: {
    height: 36,
    width: 100,
    borderRadius: 18,
    backgroundColor: UI.BACKGROUND.ITEM + '40',
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY + '30',
    overflow: 'hidden',
  },
});

export default HeaderSkeleton; 