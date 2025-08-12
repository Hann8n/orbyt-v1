/**
 * Video Buffering Strategies
 * Optimized buffer management for React Native Video component
 */

// Default buffering configuration
export const DEFAULT_BUFFER_CONFIG = {
  // Minimum amount of time in ms to buffer
  minBufferMs: 2500,
  
  // Maximum amount of time in ms to buffer
  maxBufferMs: 30000,
  
  // Amount of time in ms to buffer for playback after initial load
  bufferForPlaybackMs: 1000,
  
  // Amount of time in ms to buffer for playback after a rebuffer
  bufferForPlaybackAfterRebufferMs: 2500,
};

// Mobile optimized configuration - reduces memory usage at cost of more frequent rebuffering
export const MOBILE_BUFFER_CONFIG = {
  minBufferMs: 1500,
  maxBufferMs: 15000,
  bufferForPlaybackMs: 500,
  bufferForPlaybackAfterRebufferMs: 1500,
};

// High quality configuration - reduces rebuffering at cost of more memory usage
export const HIGH_QUALITY_BUFFER_CONFIG = {
  minBufferMs: 5000,
  maxBufferMs: 60000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
};

// Low memory device configuration
export const LOW_MEMORY_BUFFER_CONFIG = {
  minBufferMs: 1000,
  maxBufferMs: 8000,
  bufferForPlaybackMs: 500,
  bufferForPlaybackAfterRebufferMs: 1000,
};

// Connection quality presets
export type ConnectionQuality = 'poor' | 'moderate' | 'good' | 'excellent';

/**
 * Get buffer configuration based on connection quality
 */
export function getBufferConfigForConnection(quality: ConnectionQuality) {
  switch (quality) {
    case 'poor':
      return LOW_MEMORY_BUFFER_CONFIG;
    case 'moderate':
      return MOBILE_BUFFER_CONFIG;
    case 'good':
      return DEFAULT_BUFFER_CONFIG;
    case 'excellent':
      return HIGH_QUALITY_BUFFER_CONFIG;
    default:
      return DEFAULT_BUFFER_CONFIG;
  }
}

// Buffer state tracking interface
export interface BufferState {
  isBuffering: boolean;
  bufferingStart: number | null;
  bufferingCount: number;
  totalBufferingTime: number;
  lastBufferingDuration: number;
}

/**
 * Create initial buffer state
 */
export function createInitialBufferState(): BufferState {
  return {
    isBuffering: false,
    bufferingStart: null,
    bufferingCount: 0,
    totalBufferingTime: 0,
    lastBufferingDuration: 0,
  };
}

/**
 * Update buffer state when buffering status changes
 */
export function updateBufferState(
  currentState: BufferState,
  isBuffering: boolean
): BufferState {
  // If buffering status hasn't changed, return current state
  if (currentState.isBuffering === isBuffering) {
    return currentState;
  }

  // Starting to buffer
  if (isBuffering) {
    return {
      ...currentState,
      isBuffering: true,
      bufferingStart: Date.now(),
    };
  } 
  
  // Finished buffering
  const bufferingDuration = currentState.bufferingStart 
    ? (Date.now() - currentState.bufferingStart) 
    : 0;
    
  return {
    isBuffering: false,
    bufferingStart: null,
    bufferingCount: currentState.bufferingCount + 1,
    totalBufferingTime: currentState.totalBufferingTime + bufferingDuration,
    lastBufferingDuration: bufferingDuration,
  };
}
