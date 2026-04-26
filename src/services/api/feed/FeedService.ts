/**
 * AT Protocol feed API (`AtprotoFeedService`) — `app.bsky.feed.*` and related post/comment/search operations.
 * Distinct from `src/services/FeedService.ts`, which holds app-level feed state (bookmarks, seen videos).
 *
 * Implementation is split across feedQueries (reads), feedWrites (posts/threadgate), and feedInteractions
 * (likes/reposts/sendInteractions) for maintainability and clearer lexicon boundaries.
 */
import * as feedQueries from './feedQueries';
import * as feedWrites from './feedWrites';
import * as feedInteractions from './feedInteractions';

export class AtprotoFeedService {
  static getFeed = feedQueries.getFeed;
  static applyModerationBatch = feedQueries.applyModerationBatch;
  static getComments = feedQueries.getComments;
  static getLikes = feedQueries.getLikes;
  static getPost = feedQueries.getPost;
  static getPosts = feedQueries.getPosts;
  static getPostEngagement = feedQueries.getPostEngagement;
  static getFeedGenerator = feedQueries.getFeedGenerator;
  static getFeedGeneratorSubscriberCount = feedQueries.getFeedGeneratorSubscriberCount;
  static getFeedGeneratorWithPosts = feedQueries.getFeedGeneratorWithPosts;
  static searchHashtagVideosPaginated = feedQueries.searchHashtagVideosPaginated;
  static searchHashtagSuggestions = feedQueries.searchHashtagSuggestions;
  static searchVideosPaginated = feedQueries.searchVideosPaginated;
  static getMixedFeed = feedQueries.getMixedFeed;
  static getRepostedVideos = feedQueries.getRepostedVideos;
  static searchPopularFeeds = feedQueries.searchPopularFeeds;
  static getSuggestedFeeds = feedQueries.getSuggestedFeeds;
  static getStaticChannels = feedQueries.getStaticChannels;

  static likePost = feedInteractions.likePost;
  static deleteLike = feedInteractions.deleteLike;
  static repostPost = feedInteractions.repostPost;
  static deleteRepost = feedInteractions.deleteRepost;
  static sendFeedInteractions = feedInteractions.sendFeedInteractions;

  static postComment = feedWrites.postComment;
  static createVideoPost = feedWrites.createVideoPost;
  static deletePost = feedWrites.deletePost;
  static mutePostComments = feedWrites.mutePostComments;
}
