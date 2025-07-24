// Simple global feed store for modal navigation
let currentFeed: any[] = [];

export function setCurrentFeed(feed: any[]) {
  currentFeed = feed;
}

export function getCurrentFeed(): any[] {
  return currentFeed;
} 