// Test file to check feed service imports
import feedService from './FeedService';

console.log('FeedService imported:', typeof feedService);

// Test basic functionality
try {
  console.log('FeedService methods:', Object.keys(feedService));
} catch (error) {
  console.error('Error accessing FeedService methods:', error);
}

export { feedService };
