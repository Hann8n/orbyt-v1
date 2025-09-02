import 'event-target-polyfill';
import 'abortcontroller-polyfill';

import * as WebBrowser from 'expo-web-browser';

// Ensure AuthSession completes properly on native
WebBrowser.maybeCompleteAuthSession();

// Keep entry lightweight; expo-atproto-auth provides native crypto. No extra polyfills here.

// Re-export Expo Router's default entry after polyfills
export { default } from 'expo-router/entry';


