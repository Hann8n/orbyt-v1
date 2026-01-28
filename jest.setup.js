// FlashList Jest setup - mocks measurements and prevents all items from mounting during tests
require('@shopify/flash-list/jestSetup');

// React Native Testing Library - auto-enables matchers
require('@testing-library/react-native');

// Configure reassure
const { configure } = require('reassure');
configure({ testingLibrary: 'react-native' });

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/',
  useSegments: () => [],
  Stack: {
    Screen: ({ children }) => children,
    Navigator: ({ children }) => children,
  },
  Tabs: {
    Screen: ({ children }) => children,
    Navigator: ({ children }) => children,
  },
}));

// Mock expo-image
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return {
    Image: View,
  };
});

// Mock react-native-video
jest.mock('react-native-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
  };
});

// Mock expo-video
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    VideoView: View,
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
    initialWindowMetrics: null,
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Cleanup after each test
const { cleanup } = require('@testing-library/react-native');
afterEach(() => {
  cleanup();
});
