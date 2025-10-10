// Apply required polyfills for expo-atproto-auth
import 'event-target-polyfill';

// DOMException is required by abortcontroller-polyfill
declare const global: any;
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