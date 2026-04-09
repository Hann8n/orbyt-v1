import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

import { Colors } from '@/theme';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

type SectionHeaderProps = {
  title: string;
  spotlightLabel: string;
};

export const ExploreSectionHeaderRow = React.memo(
  ({ title, spotlightLabel }: SectionHeaderProps) => {
    const displayTitle = title.toLowerCase().includes('spotlight') ? spotlightLabel : title;

    return (
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{displayTitle}</Text>
        </View>
      </View>
    );
  }
);
ExploreSectionHeaderRow.displayName = 'ExploreSectionHeaderRow';

type LoadingRowProps = { minHeight: number };

export const ExploreSuggestionsLoadingRow = React.memo(({ minHeight }: LoadingRowProps) => (
  <View style={[styles.loadingContainer, styles.loadingContainerTop, { minHeight }]}>
    <ActivityIndicator size="large" color={Colors.neutral[50]} />
  </View>
));
ExploreSuggestionsLoadingRow.displayName = 'ExploreSuggestionsLoadingRow';
