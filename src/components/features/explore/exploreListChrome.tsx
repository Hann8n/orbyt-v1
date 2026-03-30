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

export const SectionHeaderLoading = () => <ExploreSectionLoading variant="sectionHeader" />;

export const PopularChannelsLoading = () => <ExploreSectionLoading variant="inline" />;

export const SpotlightLoading = () => <ExploreSectionLoading variant="spotlight" />;

export const HeaderSpacer = ({ computedHeaderHeight }: { computedHeaderHeight: number }) => (
  <View style={[styles.headerSpacerFill, { height: computedHeaderHeight }]} />
);
