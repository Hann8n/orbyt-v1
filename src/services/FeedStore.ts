// Simple global feed store for modal navigation
let currentFeed: any[] = [];

// Global map of video URIs to blur state (true = blurred, false = unblurred)
const videoBlurState = new Map<string, boolean>();

export function setCurrentFeed(feed: any[]) {
  currentFeed = feed;
}

export function getCurrentFeed(): any[] {
  return currentFeed;
}

// Set the blur state for a video URI
export function setVideoBlurState(uri: string, blurred: boolean) {
  videoBlurState.set(uri, blurred);
}

// Check if a video URI is blurred (default to true if not set and moderation says blur)
export function isVideoBlurred(uri: string, moderationBlur: boolean): boolean {
  if (videoBlurState.has(uri)) {
    return videoBlurState.get(uri)!;
  }
  return moderationBlur;
} 