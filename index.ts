import 'event-target-polyfill';
import 'abortcontroller-polyfill';

import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import App from './src/App';

// This is required for expo-auth-session to work properly
WebBrowser.maybeCompleteAuthSession();

// Polyfill for TextDecoder if not available
if (typeof global.TextDecoder === 'undefined') {
  try {
    const { TextDecoder } = require('util');
    global.TextDecoder = TextDecoder;
  } catch (error) {
    // Fallback polyfill
    global.TextDecoder = class TextDecoder {
      encoding: string;
      fatal: boolean;
      ignoreBOM: boolean;
      
      constructor(encoding = 'utf-8') {
        this.encoding = encoding;
        this.fatal = false;
        this.ignoreBOM = false;
      }
      decode(input: any) {
        if (typeof input === 'string') return input;
        if (input instanceof Uint8Array) {
          return String.fromCharCode.apply(null, input);
        }
        return '';
      }
    } as any;
  }
}

// Custom console warning interceptor to catch multiformats warnings
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args.join(' ');
  if (message.includes('multiformats') || 
      message.includes('Attempted to import the module') ||
      message.includes('which is not listed in the "exports"') ||
      message.includes('Falling back to file-based resolution') ||
      message.includes('cjs/src/cid.js') ||
      message.includes('cjs/src/basics.js')) {
    return; // Suppress these warnings
  }
  originalWarn.apply(console, args);
};

// Also intercept console.error for similar messages
const originalError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  if (message.includes('multiformats') || 
      message.includes('Attempted to import the module') ||
      message.includes('which is not listed in the "exports"') ||
      message.includes('Falling back to file-based resolution') ||
      message.includes('cjs/src/cid.js') ||
      message.includes('cjs/src/basics.js')) {
    return; // Suppress these warnings
  }
  originalError.apply(console, args);
};

// Also try LogBox as backup
LogBox.ignoreLogs([
  'multiformats',
  'Attempted to import the module',
  'which is not listed in the "exports"',
  'Falling back to file-based resolution',
]);

// More specific patterns to catch the exact warnings
LogBox.ignoreLogs([
  'Attempted to import the module "/Users/jack/orbyt/node_modules/multiformats/cjs/src/cid.js"',
  'Attempted to import the module "/Users/jack/orbyt/node_modules/multiformats/cjs/src/basics.js"',
]);

// Additional: Suppress warnings at the global level
if (typeof global !== 'undefined') {
  const originalConsoleWarn = global.console?.warn;
  if (originalConsoleWarn) {
    global.console.warn = (...args) => {
      const message = args.join(' ');
      if (message.includes('multiformats') || 
          message.includes('Attempted to import the module') ||
          message.includes('which is not listed in the "exports"') ||
          message.includes('Falling back to file-based resolution') ||
          message.includes('cjs/src/cid.js') ||
          message.includes('cjs/src/basics.js')) {
        return; // Suppress these warnings
      }
      originalConsoleWarn.apply(global.console, args);
    };
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App); 