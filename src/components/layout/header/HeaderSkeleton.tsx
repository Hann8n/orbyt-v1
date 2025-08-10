import React from 'react';
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
              avatarStyle === 'rounded-square' && styles.skeletonAvatarRoundedSquare,
              { borderWidth: 1, borderColor: Colors.gray }
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
            style={[styles.skeletonTitle, { borderRadius: 6 }]}
            shimmerColors={shimmerColors}
          />
        </View>
        
        {/* Subtitle row with subtitle only */}
        <View style={styles.subtitleRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[styles.skeletonSubtitle, { borderRadius: 4 }]}
            shimmerColors={shimmerColors}
          />
        </View>
        
        {showDescription && (
          <View style={styles.descriptionContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { borderRadius: 4 }]}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { width: '85%', borderRadius: 4 }]}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={[styles.skeletonDescription, { width: '60%', borderRadius: 4 }]}
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
    marginTop: -8,
  },
  avatarContainer: {
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  skeletonAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  skeletonAvatarRoundedSquare: {
    borderRadius: 16,
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