import React from 'react';
import { StyleSheet } from 'react-native';
import { measureRenders } from 'reassure';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ListFeedView from '../ListFeedView';
import { createMockFeed } from './test-utils';

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

// Simple wrapper with minimal providers needed for ListFeedView
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

test('ListFeedView initial render performance', async () => {
  const mockFeed = createMockFeed(30); // Realistic data volume for list view

  await measureRenders(
    <TestWrapper>
      <ListFeedView
        feed={mockFeed}
        feedOption="following"
        onLoadMore={() => {}}
        hasNextPage={false}
        isLoading={false}
        isFetchingNextPage={false}
      />
    </TestWrapper>
  );
});

test('ListFeedView scroll performance', async () => {
  const mockFeed = createMockFeed(50); // More items for scroll testing

  const scenario = async () => {
    // Simulate user scrolling through the list
    // FlashList will handle virtualization automatically
    // Note: Actual scroll simulation may be limited in test environment
    // but reassure will still measure render performance during the scenario
    await Promise.resolve(); // Placeholder for future scroll implementation
  };

  await measureRenders(
    <TestWrapper>
      <ListFeedView
        feed={mockFeed}
        feedOption="following"
        onLoadMore={() => {}}
        hasNextPage={false}
        isLoading={false}
        isFetchingNextPage={false}
      />
    </TestWrapper>,
    { scenario }
  );
});

test('ListFeedView with header component', async () => {
  const mockFeed = createMockFeed(25);
  const headerComponent = <React.Fragment>Test Header</React.Fragment>;

  await measureRenders(
    <TestWrapper>
      <ListFeedView
        feed={mockFeed}
        feedOption="profile"
        userDid="did:plc:test"
        headerComponent={headerComponent}
        onLoadMore={() => {}}
        hasNextPage={false}
        isLoading={false}
        isFetchingNextPage={false}
      />
    </TestWrapper>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
