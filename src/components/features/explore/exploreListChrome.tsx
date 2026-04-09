import { View, ActivityIndicator } from 'react-native';

import { Colors } from '@/theme';

import { exploreScreenStyles as styles } from './ExploreScreenStyles';

const LOADING_COLOR = Colors.neutral[50];

type ExploreSectionLoadingVariant = 'sectionHeader' | 'inline' | 'spotlight';

export const ExploreSectionLoading = ({ variant }: { variant: ExploreSectionLoadingVariant }) => {
  if (variant === 'sectionHeader') {
    return (
      <View style={[styles.sectionHeader, styles.loadingContainer]}>
        <ActivityIndicator size="small" color={LOADING_COLOR} />
      </View>
    );
  }
  if (variant === 'spotlight') {
    return (
      <View style={[styles.spotlightContainer, styles.loadingContainer]}>
        <ActivityIndicator size="small" color={LOADING_COLOR} />
      </View>
    );
  }
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color={LOADING_COLOR} />
    </View>
  );
};

export const ExploreTopSpacer = ({ height }: { height: number }) => (
  <View style={[styles.headerSpacerFill, { height }]} />
);
