import React from 'react';
import { StyleSheet } from 'react-native';
import { measureRenders } from 'reassure';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GridFeedView from '../GridFeedView';
import { createMockFeed } from './test-utils';
import type { ExtendedFeedViewPost } from '../../../services/api/types';

// Create a test QueryClient for each test
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
};

// Simple wrapper with minimal providers needed for GridFeedView
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>{children}</GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

test('GridFeedView render performance', async () => {
  const mockFeed = createMockFeed(40); // Grid with many items

  await measureRenders(
    <TestWrapper>
      <GridFeedView
        feed={mockFeed}
        feedOption="following"
        onLoadMore={() => {}}
        hasNextPage={false}
      />
    </TestWrapper>
  );
});

test('GridFeedView with header component', async () => {
  const mockFeed = createMockFeed(30);
  const headerComponent = <React.Fragment>Profile Header</React.Fragment>;

  await measureRenders(
    <TestWrapper>
      <GridFeedView
        feed={mockFeed}
        feedOption="profile"
        userDid="did:plc:test"
        headerComponent={headerComponent}
        onLoadMore={() => {}}
        hasNextPage={false}
      />
    </TestWrapper>
  );
});

test('GridFeedView empty state performance', async () => {
  const mockFeed: ExtendedFeedViewPost[] = [];

  await measureRenders(
    <TestWrapper>
      <GridFeedView
        feed={mockFeed}
        feedOption="following"
        onLoadMore={() => {}}
        hasNextPage={false}
      />
    </TestWrapper>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
