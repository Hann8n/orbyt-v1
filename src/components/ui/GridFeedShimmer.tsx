import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { Colors } from './UI';
import { LinearGradient } from 'expo-linear-gradient';
import { isSmallScreen, isTablet } from '../../utils/helpers/screenSize';

const ITEM_MARGIN = 1; // Match the grid feed margin

interface GridFeedShimmerProps {
  count?: number;
  backgroundColor?: string;
}

const GridFeedShimmer: React.FC<GridFeedShimmerProps> = ({
  count = 12,
  backgroundColor = '#000',
}) => {
  // Responsive grid columns - match GridFeedView logic
  const screen = Dimensions.get('window');
  let numColumns = 4;
  if (isTablet()) {
    numColumns = 6;
  } else if (isSmallScreen()) {
    numColumns = 3;
  }
  
  const itemWidth = (screen.width - (ITEM_MARGIN * (numColumns - 1))) / numColumns;
  const itemHeight = itemWidth * (16 / 9); // 16:9 aspect ratio

  // Calculate rows needed
  const rows = Math.ceil(count / numColumns);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.topDivider} />
      <View style={styles.gridContainer}>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {Array.from({ length: numColumns }, (_, colIndex) => {
              const itemIndex = rowIndex * numColumns + colIndex;
              if (itemIndex >= count) return null;
              
              const isLastColumn = (colIndex + 1) % numColumns === 0;
              const isLastRow = rowIndex === rows - 1;
              const isFirstColumn = colIndex === 0;
              const isFirstRow = rowIndex === 0;
              
              return (
                <View
                  key={`shimmer-${itemIndex}`}
                  style={[
                    styles.gridItem,
                    { width: itemWidth, height: itemHeight },
                    !isLastColumn && { marginRight: ITEM_MARGIN },
                    !isLastRow && { marginBottom: ITEM_MARGIN },
                    isFirstColumn && { marginLeft: ITEM_MARGIN },
                    isFirstRow && { marginTop: ITEM_MARGIN },
                  ]}
                >
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={styles.shimmerItem}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  topDivider: {
    width: '100%',
    height: ITEM_MARGIN,
    backgroundColor: Colors.black,
  },
  gridContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.black,
  },
  gridItem: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 0,
    backgroundColor: Colors.black,
  },
  shimmerItem: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
});

export default GridFeedShimmer; 