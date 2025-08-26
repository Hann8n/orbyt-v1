import React from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet } from 'react-native';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../../components/ui/UI';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';

interface HeaderSkeletonProps {
  textColor?: string;
  showAvatar?: boolean;
  showDescription?: boolean;
  avatarStyle?: 'circle' | 'rounded-square';
  backgroundColor?: string;
}

const HeaderSkeleton: React.FC<HeaderSkeletonProps> = ({
  textColor = Colors.white,
  showAvatar = true,
  showDescription = true,
  avatarStyle = 'circle',
  backgroundColor,
}) => {
  // Use standard shimmer colors for better visibility
  const shimmerColors = Colors.SHIMMER.PRIMARY;

  return (
    <View style={styles.skeletonContainer}>
      {showAvatar && (
        <View style={styles.avatarContainer}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[
              styles.skeletonAvatar,
              avatarStyle === 'rounded-square' && styles.skeletonAvatarRoundedSquare
            ]}
            shimmerColors={shimmerColors}
          />
        </View>
      )}
      
      <View style={styles.skeletonTextContainer}>
        {/* Title row with title only */}
        <View style={styles.titleRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[styles.skeletonTitle, { borderRadius: BORDER_RADIUS.SMALL }]}
            shimmerColors={shimmerColors}
          />
        </View>
        
        {/* Subtitle row with subtitle only */}
        <View style={styles.subtitleRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[styles.skeletonSubtitle, { borderRadius: BORDER_RADIUS.SMALL }]}
            shimmerColors={shimmerColors}
          />
        </View>
        
        {showDescription && (
          <View style={styles.descriptionContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { borderRadius: BORDER_RADIUS.SMALL }]}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { width: '85%', borderRadius: BORDER_RADIUS.SMALL }]}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { width: '60%', borderRadius: BORDER_RADIUS.SMALL }]}
              shimmerColors={shimmerColors}
            />
          </View>
        )}
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
    marginTop: -4,
  },
  avatarContainer: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  skeletonAvatar: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.FULL,
  },
  skeletonAvatarRoundedSquare: {
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  skeletonTextContainer: {
    width: '100%',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonTitle: {
    height: 28,
    width: '45%',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  skeletonSubtitle: {
    height: 20,
    width: '35%',
  },
  descriptionContainer: {
    marginTop: 12,
  },
  skeletonDescription: {
    height: 18,
    width: '100%',
    marginBottom: 8,
  },
});

export default HeaderSkeleton; 