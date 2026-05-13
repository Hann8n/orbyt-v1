import React from 'react';
import { FlatList, StyleSheet, ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AuthorItem from './AuthorItem';
import { Colors } from './UI';
import { QUERY_CONSTANTS } from '../../utils/constants';
import { TextStyles } from '../../utils/components/typography';
import type { ProfileViewBasic } from '../../services/api/types';

interface SearchResultsListProps {
  profiles: ProfileViewBasic[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: unknown;
  onSelectProfile: (profile: ProfileViewBasic) => void;
  onLoadMore: () => void;
  emptyMessage?: string;
  errorMessage?: string;
  backgroundColor?: string;
  textColor?: string;
  size?: 'small' | 'medium' | 'large';
  hideHandleLine?: boolean;
  showArrow?: boolean;
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  profiles,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  error,
  onSelectProfile,
  onLoadMore,
  emptyMessage,
  errorMessage,
  backgroundColor = Colors.neutral[925],
  textColor = Colors.neutral[50],
  size = 'medium',
  hideHandleLine = true,
  showArrow = false,
}) => {
  const { t } = useTranslation();

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {errorMessage || t('feed.errorLoadingUsers')}
          </Text>
        </View>
      );
    }

    if (profiles.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {emptyMessage || t('feed.noUsersFound')}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={profiles}
        keyExtractor={item => item.did}
        renderItem={({ item }) => (
          <AuthorItem
            handle={item.handle}
            did={item.did}
            displayName={item.displayName}
            avatar={item.avatar}
            textColor={textColor}
            backgroundColor={backgroundColor}
            size={size}
            hideHandleLine={hideHandleLine}
            showArrow={showArrow}
            onPress={() => onSelectProfile(item)}
          />
        )}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            onLoadMore();
          }
        }}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
      />
    );
  };

  return <View style={styles.container}>{renderContent()}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  errorText: {
    ...TextStyles.bodyMedium,
    color: Colors.neutral[200],
    textAlign: 'center',
  },
  emptyText: {
    ...TextStyles.body,
    color: Colors.neutral[200],
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
});
