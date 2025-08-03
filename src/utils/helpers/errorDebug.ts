// Error debugging utility for testing error states
// This file provides a centralized way to manage error forcing for testing purposes

// Global debug flags that can be easily toggled
export const DEBUG_FLAGS = {
  FORCE_FEED_ERROR: false, // Set to true to force feed errors
  FORCE_SEARCH_ERROR: false, // Set to true to force search errors
  FORCE_PROFILE_ERROR: false, // Set to true to force profile errors
  FORCE_NETWORK_ERROR: false, // Set to true to force network errors
};

// Helper function to check if any error forcing is enabled
export const isErrorForcingEnabled = (): boolean => {
  return Object.values(DEBUG_FLAGS).some(flag => flag);
};

// Helper function to get a forced error message
export const getForcedErrorMessage = (type: string): Error => {
  return new Error(`Forced ${type} error for testing purposes`);
};

// Helper function to check if a specific error type should be forced
export const shouldForceError = (type: keyof typeof DEBUG_FLAGS): boolean => {
  return DEBUG_FLAGS[type] || false;
};

// Export individual flags for easy access
export const FORCE_FEED_ERROR = DEBUG_FLAGS.FORCE_FEED_ERROR;
export const FORCE_SEARCH_ERROR = DEBUG_FLAGS.FORCE_SEARCH_ERROR;
export const FORCE_PROFILE_ERROR = DEBUG_FLAGS.FORCE_PROFILE_ERROR;
export const FORCE_NETWORK_ERROR = DEBUG_FLAGS.FORCE_NETWORK_ERROR; 