import React from 'react';
import { View, StyleSheet } from 'react-native';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { UI, TEXT } from '../../../utils/formatting/Colors';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';

interface HeaderSkeletonProps {
  textColor?: string;
  showAvatar?: boolean;
  showDescription?: boolean;
  avatarStyle?: 'circle' | 'rounded-square';
  backgroundColor?: string;
}

const HeaderSkeleton: React.FC<HeaderSkeletonProps> = ({
  textColor = TEXT.PRIMARY,
  showAvatar = true,
  showDescription = true,
  avatarStyle = 'circle',
  backgroundColor,
}) => {
  // Use standard shimmer colors for better visibility
  const shimmerColors = UI.SHIMMER;

  return (
    <View style={styles.skeletonContainer}>
      {showAvatar && (
        <View style={styles.avatarContainer}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[
              styles.skeletonAvatar,
              avatarStyle === 'rounded-square' && styles.skeletonAvatarRoundedSquare,
              { borderWidth: 1, borderColor: UI.BORDER.PRIMARY }
            ]}
            shimmerColors={shimmerColors}
          />
        </View>
      )}
      
      <View style={styles.skeletonTextContainer}>
        <View style={styles.titleRow}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={[styles.skeletonTitle, { borderRadius: 6 }]}
            shimmerColors={shimmerColors}
          />
        </View>
        
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={[styles.skeletonSubtitle, { borderRadius: 4 }]}
          shimmerColors={shimmerColors}
        />
        
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
  },
  avatarContainer: {
    marginBottom: 8,
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
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  skeletonTitle: {
    height: 28,
    width: '45%',
    marginRight: 12,
  },
  skeletonSubtitle: {
    height: 20,
    width: '35%',
    marginBottom: 16,
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  skeletonDescription: {
    height: 18,
    width: '100%',
    marginBottom: 8,
  },
});

export default HeaderSkeleton; 