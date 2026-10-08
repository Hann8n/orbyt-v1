// Import polyfills before anything else
import 'core-js/proposals/explicit-resource-management';
import 'event-target-polyfill';
import 'react-native-url-polyfill/auto';

// Polyfill Intl.Segmenter for @atproto/lex-data (used by @atproto/api RichText)
import '@formatjs/intl-segmenter/polyfill.js';

// Polyfill global.Buffer for node libraries that expect it (e.g., multiformats)
// The 'buffer' package is included in package.json already.
// This ensures libraries using Buffer won't crash in React Native.
import { Buffer } from 'buffer';
if (!('Buffer' in globalThis)) {
  Object.assign(globalThis, { Buffer });
}

// DOMException is required by abortcontroller-polyfill
if (!('DOMException' in globalThis)) {
  Object.assign(globalThis, {
    DOMException: class DOMException extends Error {
      name: string;
      code: number;
      constructor(message: string, name = 'Error') {
        super(message);
        this.name = name;
        this.code = 0;
      }
    },
  });
}

import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

import * as WebBrowser from 'expo-web-browser';

// This is required for expo-auth-session to work properly
WebBrowser.maybeCompleteAuthSession();

// Enable react-native-screens early for better performance
// This should be called before any screen components are rendered
import { enableScreens, enableFreeze } from 'react-native-screens';

// Enable native screens (uses native navigation primitives for better performance)
enableScreens(true);

// Freeze inactive screens to save memory
enableFreeze(true);

// Import expo-router entry point LAST
import 'expo-router/entry';
