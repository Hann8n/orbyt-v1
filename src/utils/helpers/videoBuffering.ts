/**
 * Video Buffering Strategies
 * Optimized buffer management for React Native Video component
 * Focused on scroll performance and memory efficiency
 */

// Instant playback configuration - prioritizes starting videos immediately
export const INSTANT_PLAYBACK_BUFFER_CONFIG = {
  // Minimal buffer to start playback as quickly as possible
  minBufferMs: 250,
  
  // Small maximum buffer to reduce memory usage
  maxBufferMs: 2000,
  
  // Very small buffer for playback to start instantly
  bufferForPlaybackMs: 100,
  
  // Small buffer after rebuffer to maintain performance
  bufferForPlaybackAfterRebufferMs: 250,
};

// Ultra-aggressive mobile configuration for smooth scrolling
export const ULTRA_MOBILE_BUFFER_CONFIG = {
  // Very small buffer to reduce memory usage during scrolling
  minBufferMs: 500,
  
  // Limited maximum buffer to prevent memory buildup
  maxBufferMs: 5000,
  
  // Minimal buffer for playback to start quickly
  bufferForPlaybackMs: 250,
  
  // Small buffer after rebuffer to maintain performance
  bufferForPlaybackAfterRebufferMs: 500,
};

// Mobile optimized configuration - reduces memory usage at cost of more frequent rebuffering
export const MOBILE_BUFFER_CONFIG = {
  minBufferMs: 1000,
  maxBufferMs: 8000,
  bufferForPlaybackMs: 500,
  bufferForPlaybackAfterRebufferMs: 1000,
};

// Default configuration for stable connections
export const DEFAULT_BUFFER_CONFIG = {
  minBufferMs: 2000,
  maxBufferMs: 15000,
  bufferForPlaybackMs: 1000,
  bufferForPlaybackAfterRebufferMs: 2000,
};

// High quality configuration - reduces rebuffering at cost of more memory usage
export const HIGH_QUALITY_BUFFER_CONFIG = {
  minBufferMs: 3000,
  maxBufferMs: 30000,
  bufferForPlaybackMs: 1500,
  bufferForPlaybackAfterRebufferMs: 3000,
};

// Connection quality presets
export type ConnectionQuality = 'poor' | 'moderate' | 'good' | 'excellent';

/**
 * Get buffer configuration based on connection quality
 * Optimized for scroll performance
 */
export function getBufferConfigForConnection(quality: ConnectionQuality) {
  switch (quality) {
    case 'poor':
      return ULTRA_MOBILE_BUFFER_CONFIG;
    case 'moderate':
      return MOBILE_BUFFER_CONFIG;
    case 'good':
      return DEFAULT_BUFFER_CONFIG;
    case 'excellent':
      return HIGH_QUALITY_BUFFER_CONFIG;
    default:
      return MOBILE_BUFFER_CONFIG; // Default to mobile config for better scroll performance
  }
}

/**
 * Get buffer configuration based on device performance
 * Automatically selects optimal settings for the device
 */
export function getBufferConfigForDevice() {
  // For now, always use mobile config for optimal scroll performance
  // In the future, this could detect device capabilities
  return MOBILE_BUFFER_CONFIG;
}

/**
 * Get buffer configuration for scroll-optimized video playback
 * This is the recommended configuration for feeds with video content
 */
export function getScrollOptimizedBufferConfig() {
  return ULTRA_MOBILE_BUFFER_CONFIG;
}

/**
 * Get buffer configuration for instant video playback
 * This configuration prioritizes starting videos immediately when visible
 */
export function getInstantPlaybackBufferConfig() {
  return INSTANT_PLAYBACK_BUFFER_CONFIG;
}
