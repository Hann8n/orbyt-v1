// Apply required polyfills for @atproto/oauth-client-expo
import 'event-target-polyfill';

// Polyfill Intl.Segmenter for @atproto/lex-data to prevent warning
declare const global: any;
if (typeof Intl.Segmenter === 'undefined') {
  (Intl as any).Segmenter = class Segmenter {
    constructor(_locale?: string | string[], _options?: any) {}
    segment(text: string) {
      return {
        [Symbol.iterator]: function* () {
          for (let i = 0; i < text.length; i++) {
            yield { segment: text[i], index: i, input: text, isWordLike: false };
          }
        },
        containing: (index: number) => 
          index >= 0 && index < text.length 
            ? { segment: text[index], index, input: text, isWordLike: false }
            : undefined,
      };
    }
  };
}

// Polyfill global.Buffer for node libraries that expect it (e.g., multiformats)
// The 'buffer' package is included in package.json already.
// This ensures libraries using Buffer won't crash in React Native.
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// DOMException is required by abortcontroller-polyfill
if (typeof global.DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    name: string;
    code: number;
    constructor(message: string, name: string = 'Error') {
      super(message);
      this.name = name;
      this.code = 0;
    }
  };
}

import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

import * as WebBrowser from 'expo-web-browser';

// This is required for expo-auth-session to work properly
WebBrowser.maybeCompleteAuthSession();

// Import expo-router entry point LAST
import 'expo-router/entry';
