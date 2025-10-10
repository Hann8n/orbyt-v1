// CRITICAL: Apply polyfills IMMEDIATELY - must be first thing to execute
// This ensures EventTarget and AbortController are available before any modules load

// Apply polyfills FIRST as required by expo-atproto-auth
import 'event-target-polyfill';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

// Ensure polyfills are applied to global scope immediately
declare const global: any;

// Additional safety check - ensure Event is available
if (typeof global.Event === 'undefined') {
  console.warn('[index.ts] Event polyfill not applied, applying fallback');
  global.Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

// Additional safety check - ensure CustomEvent is available
if (typeof global.CustomEvent === 'undefined') {
  console.warn('[index.ts] CustomEvent polyfill not applied, applying fallback');
  global.CustomEvent = class CustomEvent extends global.Event {
    detail: any;
    constructor(type: string, options: any = {}) {
      super(type);
      this.detail = options.detail || null;
    }
  };
}

import * as WebBrowser from 'expo-web-browser';

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

// Import expo-router entry point LAST
import 'expo-router/entry'; 