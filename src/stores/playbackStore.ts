/**
 * Video Playback Store
 * Centralizes video playback state using Zustand
 * Optimized for instant playback
 */
import { create } from 'zustand';
// Using Zustand's built-in immer integration
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionQuality } from '../utils/helpers/videoBuffering';

// Types
interface VideoSettings {
  autoplay: boolean;
  muteByDefault: boolean;
  preferredQuality: 'auto' | 'low' | 'medium' | 'high';
  saveDataMode: boolean;
}

interface PlaybackState {
  // Global playback settings
  settings: VideoSettings;
  connectionQuality: ConnectionQuality;
  
  // Actively playing videos
  activeVideoIds: string[];
  
  // Track video state by ID
  videoStates: Record<string, {
    uri: string;
    isPlaying: boolean;
    isBuffering: boolean;
    progress: number;
    duration: number;
    position: number;
    isWatched: boolean;
    lastPlayed: number;
  }>;
  
  // Actions
  setSettings: (settings: Partial<VideoSettings>) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  registerVideo: (videoId: string, uri: string) => void;
  unregisterVideo: (videoId: string) => void;
  setVideoPlaying: (videoId: string, isPlaying: boolean) => void;
  setVideoBuffering: (videoId: string, isBuffering: boolean) => void;
  updateVideoProgress: (videoId: string, progress: number, position: number, duration: number) => void;
  markVideoAsWatched: (videoId: string) => void;
  
  // Helper methods
  pauseAllVideos: (exceptId?: string) => void;
  getVideoState: (videoId: string) => any;
  getVideoDimLevel: (videoId: string) => number;
}

// Initial settings - optimized for instant playback
const DEFAULT_SETTINGS: VideoSettings = {
  autoplay: true,
  muteByDefault: false,
  preferredQuality: 'auto',
  saveDataMode: false,
};

// Create the store with persistence and immer middleware
export const usePlaybackStore = create<PlaybackState>()(
  immer(
    persist((set, get) => ({
      // Initial state
      settings: DEFAULT_SETTINGS,
      connectionQuality: 'good',
      activeVideoIds: [],
      videoStates: {},
      
      // Actions for settings
      setSettings: (newSettings) => set(state => ({
        settings: { ...state.settings, ...newSettings }
      })),
      
      setConnectionQuality: (quality) => set({ connectionQuality: quality }),
      
      // Video registration - optimized for instant playback
      registerVideo: (videoId, uri) => set(state => {
        if (!state.videoStates[videoId]) {
          state.videoStates[videoId] = {
            uri,
            isPlaying: false,
            isBuffering: false,
            progress: 0,
            position: 0,
            duration: 0,
            isWatched: false,
            lastPlayed: Date.now(),
          };
        }
      }),
      
      unregisterVideo: (videoId) => set(state => {
        delete state.videoStates[videoId];
        state.activeVideoIds = state.activeVideoIds.filter(id => id !== videoId);
      }),
      
      // Video state updates - optimized for instant playback
      setVideoPlaying: (videoId, isPlaying) => set(state => {
        if (state.videoStates[videoId]) {
          state.videoStates[videoId].isPlaying = isPlaying;
          
          if (isPlaying) {
            // Add to active videos if not already there
            if (!state.activeVideoIds.includes(videoId)) {
              state.activeVideoIds.push(videoId);
            }
            
            // Update last played timestamp
            state.videoStates[videoId].lastPlayed = Date.now();
          } else {
            // Remove from active videos
            state.activeVideoIds = state.activeVideoIds.filter(id => id !== videoId);
          }
        }
      }),
      
      setVideoBuffering: (videoId, isBuffering) => set(state => {
        if (state.videoStates[videoId]) {
          state.videoStates[videoId].isBuffering = isBuffering;
        }
      }),
      
      updateVideoProgress: (videoId, progress, position, duration) => set(state => {
        if (state.videoStates[videoId]) {
          state.videoStates[videoId].progress = progress;
          state.videoStates[videoId].position = position;
          state.videoStates[videoId].duration = duration;
        }
      }),
      
      markVideoAsWatched: (videoId) => set(state => {
        if (state.videoStates[videoId]) {
          state.videoStates[videoId].isWatched = true;
        }
      }),
      
      // Helper methods - optimized for performance
      pauseAllVideos: (exceptId) => {
        const state = get();
        
        // Create a copy of active videos to avoid mutation during iteration
        const activeVideos = [...state.activeVideoIds];
        
        // Pause all active videos except the one specified
        activeVideos.forEach(videoId => {
          if (videoId !== exceptId) {
            state.setVideoPlaying(videoId, false);
          }
        });
      },
      
      getVideoState: (videoId) => {
        const state = get();
        return state.videoStates[videoId] || null;
      },

      getVideoDimLevel: (videoId) => {
        const state = get();
        // Return higher dim level (0.6) for non-active videos, 0 for active videos
        // Optimized for instant visual feedback
        return state.activeVideoIds.includes(videoId) ? 0 : 0.6;
      },
    }),
    {
      name: 'video-playback-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
    )
  )
);

// Selector hooks - optimized for performance
export const usePlaybackSettings = () => usePlaybackStore(state => state.settings);
export const useConnectionQuality = () => usePlaybackStore(state => state.connectionQuality);
export const useVideoState = (videoId: string) => usePlaybackStore(state => state.videoStates[videoId]);
export const useVideoDimLevel = (videoId: string) => usePlaybackStore(state => state.getVideoDimLevel(videoId));
