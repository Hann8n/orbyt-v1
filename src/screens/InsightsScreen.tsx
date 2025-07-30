import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  Image,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import AtprotoService from '../services/api/AtprotoService';
import { Avatar, Icon } from '../components/ui/UI';
import { Card, Button, Badge, Divider, Loading } from '../components/ui/UI';
import VerificationBadge from '../components/features/verification/VerificationBadge';
import { BRAND, TEXT, UI } from '../utils/formatting/Colors';
import { RootStackParamList } from '../navigation/types';
import { queryKeys } from '../services/queryKeys';
import { extractVideoUrl, extractVideoThumbnail } from '../utils/helpers/video';
import ProfileCache from '../services/cache/ProfileCache';

type InsightsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface UserStats {
  totalPosts: number;
  totalLikes: number;
  totalReposts: number;
  totalReplies: number;
  averageLikesPerPost: number;
  averageRepostsPerPost: number;
  averageRepliesPerPost: number;
  engagementRate: number;
  averagePostLength: number;
  mostActiveDay: string;
  postsPerDay: number;
  favoriteHashtag: string;
  favoriteEmoji: string;
  postsByType: {
    original: number;
    reposts: number;
    replies: number;
  };
  activityByHour: number[];
  postsByDay: number[];
  topPosts: Array<{
    uri: string;
    text: string;
    likeCount: number;
    repostCount: number;
    replyCount: number;
    createdAt: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    embed: any;
  }>;
  // New analytics features
  mostEngagedFollowers: Array<{
    did: string;
    handle: string;
    displayName: string;
    avatar: string;
    interactionCount: number;
  }>;
  mutualConnections: Array<{
    did: string;
    handle: string;
    displayName: string;
    avatar: string;
  }>;
  topCommenters: Array<{
    did: string;
    handle: string;
    displayName: string;
    avatar: string;
    commentCount: number;
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
    unlocked: boolean;
    progress: number;
    target: number;
  }>;
  streakCount: number;
  socialScore: number;
  creatorLevel: {
    level: number;
    title: string;
    description: string;
    progress: number;
    nextLevel: number;
  };
}

interface InsightsScreenProps {
  onLogout?: (clearAllAccounts?: boolean) => Promise<void>;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Shimmer components for loading states
const UserCardShimmer = () => (
  <Card style={styles.userCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <View style={styles.userInfo}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 12 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 120, height: 24, marginBottom: 8, borderRadius: 4 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 100, height: 16, marginBottom: 20, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <View style={styles.accountStats}>
        <View style={styles.accountStat}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 40, height: 18, marginBottom: 4, borderRadius: 3 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 60, height: 12, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
        <View style={styles.accountStatDivider} />
        <View style={styles.accountStat}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 40, height: 18, marginBottom: 4, borderRadius: 3 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 60, height: 12, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      </View>
    </View>
  </Card>
);

const MetricCardShimmer = () => (
  <Card style={styles.metricCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <View style={styles.metricContent}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 20, height: 20, marginBottom: 6, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 40, height: 20, marginBottom: 2, borderRadius: 3 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 50, height: 11, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
  </Card>
);

const ChartCardShimmer = () => (
  <Card style={styles.chartCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 140, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.improvedChartContent}>
      {Array(4).fill(0).map((_, index) => (
        <View key={index} style={styles.improvedChartBar}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={styles.improvedChartBarContainer}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 40, height: 11, marginTop: 8, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 20, height: 10, marginTop: 4, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      ))}
    </View>
  </Card>
);

const TopPostCardShimmer = () => (
  <Card style={styles.topPostCard} backgroundColor="rgba(255, 255, 255, 0.03)">
    <View style={styles.topPostHeader}>
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 30, height: 16, borderRadius: 8 }}
        shimmerColors={UI.SHIMMER}
      />
      <ShimmerPlaceholder
        LinearGradient={LinearGradient}
        style={{ width: 80, height: 12, borderRadius: 2 }}
        shimmerColors={UI.SHIMMER}
      />
    </View>
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: '100%', height: 16, marginBottom: 8, borderRadius: 3 }}
      shimmerColors={UI.SHIMMER}
    />
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: '70%', height: 16, marginBottom: 16, borderRadius: 3 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.topPostStats}>
      {Array(3).fill(0).map((_, index) => (
        <View key={index} style={styles.topPostStat}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 16, height: 16, marginRight: 4, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 30, height: 12, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      ))}
    </View>
  </Card>
);

const EngagementCardShimmer = () => (
  <Card style={styles.engagementCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 140, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.engagementStats}>
      {Array(3).fill(0).map((_, index) => (
        <View key={index} style={styles.engagementStat}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 40, height: 20, marginBottom: 4, borderRadius: 3 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 80, height: 12, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      ))}
    </View>
  </Card>
);

const AnalysisCardShimmer = () => (
  <Card style={styles.analysisCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 160, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.contentTypeStats}>
      {Array(3).fill(0).map((_, index) => (
        <View key={index} style={styles.activityBarContainer}>
          <View style={styles.activityBarHeader}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 80, height: 14, borderRadius: 2 }}
              shimmerColors={UI.SHIMMER}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 30, height: 14, borderRadius: 2 }}
              shimmerColors={UI.SHIMMER}
            />
          </View>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ height: 8, borderRadius: 4, marginTop: 4 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      ))}
    </View>
    <View style={styles.analysisDivider} />
    <View style={styles.analysisInsight}>
      <View style={styles.insightContent}>
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: 20, height: 20, marginRight: 12, borderRadius: 3 }}
          shimmerColors={UI.SHIMMER}
        />
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: '100%', height: 16, marginBottom: 4, borderRadius: 3 }}
          shimmerColors={UI.SHIMMER}
        />
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: '80%', height: 16, borderRadius: 3 }}
          shimmerColors={UI.SHIMMER}
        />
      </View>
    </View>
  </Card>
);

const FunFactsCardShimmer = () => (
  <Card style={styles.funFactsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 100, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.funFactsGrid}>
      {Array(4).fill(0).map((_, index) => (
        <View key={index} style={styles.funFact}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 80, height: 12, marginBottom: 6, borderRadius: 2 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 60, height: 16, borderRadius: 3 }}
            shimmerColors={UI.SHIMMER}
          />
        </View>
      ))}
    </View>
  </Card>
);

const SocialScoreCardShimmer = () => (
  <Card style={styles.socialScoreCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 120, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.socialScoreContent}>
      <View style={styles.socialScoreMain}>
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: 80, height: 80, borderRadius: 40, marginRight: 20 }}
          shimmerColors={UI.SHIMMER}
        />
        <View style={styles.creatorLevelInfo}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 120, height: 18, marginBottom: 4, borderRadius: 4 }}
            shimmerColors={UI.SHIMMER}
          />
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 140, height: 14, marginBottom: 12, borderRadius: 3 }}
            shimmerColors={UI.SHIMMER}
          />
          <View style={styles.levelProgressContainer}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ height: 6, borderRadius: 3, marginBottom: 4 }}
              shimmerColors={UI.SHIMMER}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 80, height: 12, borderRadius: 2 }}
              shimmerColors={UI.SHIMMER}
            />
          </View>
        </View>
      </View>
    </View>
  </Card>
);

const AchievementsCardShimmer = () => (
  <Card style={styles.achievementsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 100, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.achievementsGrid}>
      {Array(3).fill(0).map((_, index) => (
        <View key={index} style={styles.achievementItem}>
          <ShimmerPlaceholder
            LinearGradient={LinearGradient}
            style={{ width: 48, height: 48, borderRadius: 24, marginRight: 16 }}
            shimmerColors={UI.SHIMMER}
          />
          <View style={styles.achievementContent}>
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 100, height: 16, marginBottom: 2, borderRadius: 3 }}
              shimmerColors={UI.SHIMMER}
            />
            <ShimmerPlaceholder
              LinearGradient={LinearGradient}
              style={{ width: 120, height: 12, marginBottom: 8, borderRadius: 2 }}
              shimmerColors={UI.SHIMMER}
            />
            <View style={styles.achievementProgress}>
              <ShimmerPlaceholder
                LinearGradient={LinearGradient}
                style={{ flex: 1, height: 4, marginRight: 8, borderRadius: 2 }}
                shimmerColors={UI.SHIMMER}
              />
              <ShimmerPlaceholder
                LinearGradient={LinearGradient}
                style={{ width: 30, height: 10, borderRadius: 2 }}
                shimmerColors={UI.SHIMMER}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  </Card>
);

const StreakCardShimmer = () => (
  <Card style={styles.streakCard} backgroundColor="rgba(255, 255, 255, 0.05)">
    <ShimmerPlaceholder
      LinearGradient={LinearGradient}
      style={{ width: 120, height: 18, marginBottom: 20, borderRadius: 4 }}
      shimmerColors={UI.SHIMMER}
    />
    <View style={styles.streakContent}>
      <View style={styles.streakInfo}>
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: 60, height: 32, marginBottom: 4, borderRadius: 4 }}
          shimmerColors={UI.SHIMMER}
        />
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: 40, height: 14, marginBottom: 4, borderRadius: 2 }}
          shimmerColors={UI.SHIMMER}
        />
        <ShimmerPlaceholder
          LinearGradient={LinearGradient}
          style={{ width: 120, height: 12, borderRadius: 2 }}
          shimmerColors={UI.SHIMMER}
        />
      </View>
    </View>
  </Card>
);

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

const InsightsScreen: React.FC<InsightsScreenProps> = ({ onLogout }) => {
  const navigation = useNavigation<InsightsNavigationProp>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Get current user
  const { data: userData, isLoading: isUserLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const user = await AtprotoService.getCurrentUser();
      setCurrentUser(user);
      return user;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get user's posts for analysis
  const { data: userPosts, isLoading: isPostsLoading } = useQuery({
    queryKey: ['userPosts', userData?.did],
    queryFn: async () => {
      if (!userData?.did) return [];
      
      const posts = [];
      let cursor = null;
      let hasMore = true;
      
      // Fetch multiple pages to get comprehensive data
      while (hasMore && posts.length < 500) {
        const response = await AtprotoService.getAuthorFeed(userData.did, cursor, 100, false);
        posts.push(...response.feed);
        cursor = response.cursor;
        hasMore = !!cursor;
      }
      
      return posts;
    },
    enabled: !!userData?.did,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Get user's profile for follower/following counts
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ['userProfile', userData?.handle],
    queryFn: async () => {
      if (!userData?.handle) return null;
      return await AtprotoService.getProfile(userData.handle);
    },
    enabled: !!userData?.handle,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get verification status using the same approach as VerificationBadge
  const { data: verificationProfile } = useQuery({
    queryKey: ['profile', userData?.handle],
    queryFn: async () => {
      if (!userData?.handle) return null;
      return await ProfileCache.getProfile(userData.handle);
    },
    enabled: !!userData?.handle,
    staleTime: 3600000, // Cache for 1 hour
    refetchOnWindowFocus: false
  });

  // Calculate insights from the data
  const calculateInsights = useCallback((): UserStats => {
    if (!userPosts || userPosts.length === 0 || !userData) {
      return {
        totalPosts: 0,
        totalLikes: 0,
        totalReposts: 0,
        totalReplies: 0,
        averageLikesPerPost: 0,
        averageRepostsPerPost: 0,
        averageRepliesPerPost: 0,
        engagementRate: 0,
        averagePostLength: 0,
        mostActiveDay: '',
        postsPerDay: 0,
        favoriteHashtag: '',
        favoriteEmoji: '',
        postsByType: { original: 0, reposts: 0, replies: 0 },
        activityByHour: new Array(24).fill(0),
        postsByDay: new Array(7).fill(0),
        topPosts: [],
        // New analytics features
        mostEngagedFollowers: [],
        mutualConnections: [],
        topCommenters: [],
        achievements: [],
        streakCount: 0,
        socialScore: 0,
        creatorLevel: {
          level: 1,
          title: 'Newcomer',
          description: 'Just getting started',
          progress: 0,
          nextLevel: 2
        },
      };
    }

    const myDid = userData.did;
    // Only include posts authored by the user and not reposts
    const ownPosts = userPosts.filter(item => item.post && item.post.author && item.post.author.did === myDid && !item.reason);
    const totalPosts = ownPosts.length;

    let totalLikes = 0;
    let totalReposts = 0;
    let totalReplies = 0;
    let totalLength = 0;
    let hashtagCount: { [key: string]: number } = {};
    let emojiCount: { [key: string]: number } = {};
    let postsByType = { original: 0, reposts: 0, replies: 0 };
    let activityByHour = new Array(24).fill(0);
    let postsByDay = new Array(7).fill(0);
    let dayCount: { [key: string]: number } = {};
    let topPosts: Array<{
      uri: string;
      text: string;
      likeCount: number;
      repostCount: number;
      replyCount: number;
      createdAt: string;
      videoUrl: string | null;
      thumbnailUrl: string | null;
      embed: any;
    }> = [];

    ownPosts.forEach(item => {
      const postData = item.post;
      const record = postData.record;

      // Count likes, reposts, replies
      totalLikes += postData.likeCount || 0;
      totalReposts += postData.repostCount || 0;
      totalReplies += postData.replyCount || 0;

      // Calculate post length
      if (record.text) {
        totalLength += record.text.length;

        // Extract hashtags
        const hashtags = record.text.match(/#\w+/g) || [];
        hashtags.forEach((tag: string) => {
          hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
        });

        // Extract emojis (simple regex for common emojis)
        const emojis = record.text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || [];
        emojis.forEach((emoji: string) => {
          emojiCount[emoji] = (emojiCount[emoji] || 0) + 1;
        });
      }

      // Track activity by hour
      const createdAt = new Date(record.createdAt);
      const hour = createdAt.getHours();
      activityByHour[hour]++;

      // Track activity by day
      const day = createdAt.getDay();
      postsByDay[day]++;

      // Track posts by type
      if (record.reply?.root) {
        postsByType.replies++;
      } else {
        postsByType.original++;
      }

      // Track day activity
      const dayKey = createdAt.toDateString();
      dayCount[dayKey] = (dayCount[dayKey] || 0) + 1;
    });

    // Find most active day
    const mostActiveDay = Object.keys(dayCount).reduce((a, b) => 
      dayCount[a] > dayCount[b] ? a : b, Object.keys(dayCount)[0] || '');

    // Find favorite hashtag and emoji
    const favoriteHashtag = Object.keys(hashtagCount).reduce((a, b) => 
      hashtagCount[a] > hashtagCount[b] ? a : b, Object.keys(hashtagCount)[0] || '');
    const favoriteEmoji = Object.keys(emojiCount).reduce((a, b) => 
      emojiCount[a] > emojiCount[b] ? a : b, Object.keys(emojiCount)[0] || '');

    // Get top video posts by engagement
    topPosts = ownPosts
      .filter(item => {
        const videoUrl = extractVideoUrl(item.post.embed);
        return videoUrl !== null;
      })
      .map(item => ({
        uri: item.post.uri,
        text: item.post.record.text || '',
        likeCount: item.post.likeCount || 0,
        repostCount: item.post.repostCount || 0,
        replyCount: item.post.replyCount || 0,
        createdAt: item.post.record.createdAt,
        videoUrl: extractVideoUrl(item.post.embed),
        thumbnailUrl: extractVideoThumbnail(item.post.embed),
        embed: item.post.embed,
      }))
      .sort((a, b) => (b.likeCount + b.repostCount + b.replyCount) - (a.likeCount + a.repostCount + a.replyCount))
      .slice(0, 6);

    const averageLikesPerPost = totalPosts > 0 ? totalLikes / totalPosts : 0;
    const averageRepostsPerPost = totalPosts > 0 ? totalReposts / totalPosts : 0;
    const averageRepliesPerPost = totalPosts > 0 ? totalReplies / totalPosts : 0;
    const engagementRate = totalPosts > 0 ? ((totalLikes + totalReposts + totalReplies) / totalPosts) : 0;
    const averagePostLength = totalPosts > 0 ? totalLength / totalPosts : 0;
    const postsPerDay = totalPosts > 0 ? totalPosts / 30 : 0; // Assuming 30 days

    // Calculate new analytics features
    const mostEngagedFollowers: Array<{
      did: string;
      handle: string;
      displayName: string;
      avatar: string;
      interactionCount: number;
    }> = [];
    
    const mutualConnections: Array<{
      did: string;
      handle: string;
      displayName: string;
      avatar: string;
    }> = [];
    
    const topCommenters: Array<{
      did: string;
      handle: string;
      displayName: string;
      avatar: string;
      commentCount: number;
    }> = [];
    
    // Calculate achievements
    const achievements = [
      {
        id: 'verified',
        title: 'Verified',
        description: 'Get your account verified',
        icon: 'verified-badge',
        color: '#10B981',
        unlocked: verificationProfile?.verification?.isVerified || false,
        progress: verificationProfile?.verification?.isVerified ? 1 : 0,
        target: 1
      },
      {
        id: 'first_post',
        title: 'First Post',
        description: 'Share your first post',
        icon: 'article',
        color: '#6366F1',
        unlocked: totalPosts >= 1,
        progress: Math.min(totalPosts, 1),
        target: 1
      },
      {
        id: 'hundred_posts',
        title: 'Century Club',
        description: 'Reach 100 posts',
        icon: 'article-multiple',
        color: '#FE4359',
        unlocked: totalPosts >= 100,
        progress: Math.min(totalPosts, 100),
        target: 100
      },
      {
        id: 'thousand_likes',
        title: 'Liked by Many',
        description: 'Get 1,000 total likes',
        icon: 'heart',
        color: '#00D4AA',
        unlocked: totalLikes >= 1000,
        progress: Math.min(totalLikes, 1000),
        target: 1000
      },
      {
        id: 'hundred_followers',
        title: 'Growing Audience',
        description: 'Reach 100 followers',
        icon: 'users',
        color: '#3797F0',
        unlocked: (profileData?.followersCount || 0) >= 100,
        progress: Math.min(profileData?.followersCount || 0, 100),
        target: 100
      },
      {
        id: 'consistent_poster',
        title: 'Consistent Creator',
        description: 'Post for 7 days straight',
        icon: 'calendar',
        color: '#FFB800',
        unlocked: false, // Will be calculated based on streak
        progress: 0,
        target: 7
      }
    ];
    
    // Calculate streak (simplified - would need more sophisticated logic)
    const streakCount = 0; // Placeholder
    
    // Calculate social score (0-100)
    const socialScore = Math.min(100, Math.round(
      (engagementRate * 10) + 
      (totalPosts * 0.5) + 
      ((profileData?.followersCount || 0) * 0.1)
    ));
    
    // Calculate creator level
    const creatorLevel = (() => {
      const score = socialScore;
      if (score >= 80) {
        return {
          level: 5,
          title: 'Influencer',
          description: 'You have significant reach and engagement',
          progress: score - 80,
          nextLevel: 100
        };
      } else if (score >= 60) {
        return {
          level: 4,
          title: 'Established Creator',
          description: 'You have a solid following and engagement',
          progress: score - 60,
          nextLevel: 80
        };
      } else if (score >= 40) {
        return {
          level: 3,
          title: 'Growing Creator',
          description: 'You\'re building your audience',
          progress: score - 40,
          nextLevel: 60
        };
      } else if (score >= 20) {
        return {
          level: 2,
          title: 'Emerging Creator',
          description: 'You\'re starting to gain traction',
          progress: score - 20,
          nextLevel: 40
        };
      } else {
        return {
          level: 1,
          title: 'Newcomer',
          description: 'Just getting started',
          progress: score,
          nextLevel: 20
        };
      }
    })();

    return {
      totalPosts,
      totalLikes,
      totalReposts,
      totalReplies,
      averageLikesPerPost,
      averageRepostsPerPost,
      averageRepliesPerPost,
      engagementRate,
      averagePostLength,
      mostActiveDay,
      postsPerDay,
      favoriteHashtag,
      favoriteEmoji,
      postsByType,
      activityByHour,
      postsByDay,
      topPosts,
      mostEngagedFollowers,
      mutualConnections,
      topCommenters,
      achievements,
      streakCount,
      socialScore,
      creatorLevel,
    };
  }, [userPosts, userData]);

  const insights = calculateInsights();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      await queryClient.invalidateQueries({ queryKey: ['userPosts'] });
      await queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    } catch (error) {
      console.error('Error refreshing insights:', error);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const isLoading = isUserLoading || isPostsLoading || isProfileLoading;

  // Don't return early for loading, instead render shimmer content

  const renderMetricCard = (title: string, value: string | number, icon: string, color: string = '#6366F1') => (
    <Card style={styles.metricCard} backgroundColor="rgba(255, 255, 255, 0.05)">
      <View style={styles.metricContent}>
        <Icon name={icon} size={20} color={color} />
        <Text style={styles.metricValue}>{value}</Text>
        <Text style={styles.metricTitle}>{title}</Text>
      </View>
    </Card>
  );

  const renderActivityBar = (value: number, maxValue: number, label: string, color: string) => {
    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
    return (
      <View style={styles.activityBarContainer}>
        <View style={styles.activityBarHeader}>
          <Text style={styles.activityBarLabel}>{label}</Text>
          <Text style={styles.activityBarValue}>{value}</Text>
        </View>
        <View style={styles.activityBarBackground}>
          <View 
            style={[
              styles.activityBarFill, 
              { 
                width: `${percentage}%`,
                backgroundColor: color
              }
            ]} 
          />
        </View>
      </View>
    );
  };

  // Updated activity by hour chart with Morning, Noon, Evening, Night
  const renderActivityByHourChart = () => {
    const timeGroups = [
      { label: 'Morning', hours: [6, 7, 8, 9, 10, 11], color: '#10B981' },
      { label: 'Noon', hours: [12, 13, 14, 15, 16, 17], color: '#F59E0B' },
      { label: 'Evening', hours: [18, 19, 20, 21, 22, 23], color: '#EF4444' },
      { label: 'Night', hours: [0, 1, 2, 3, 4, 5], color: '#8B5CF6' },
    ];

    const groupedData = timeGroups.map(group => 
      group.hours.reduce((sum, hour) => sum + insights.activityByHour[hour], 0)
    );

    const maxValue = Math.max(...groupedData, 1);

    return (
      <Card style={styles.chartCard} backgroundColor="rgba(255, 255, 255, 0.05)">
        <Text style={styles.chartTitle}>Activity by Time of Day</Text>
        <View style={styles.improvedChartContent}>
          {timeGroups.map((group, index) => {
            const value = groupedData[index];
            const percentage = (value / maxValue) * 100;
            
            return (
              <View key={index} style={styles.improvedChartBar}>
                <View style={styles.improvedChartBarContainer}>
                  <View 
                    style={[
                      styles.improvedChartBarFill,
                      { 
                        height: `${percentage}%`,
                        backgroundColor: group.color
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.improvedChartLabel}>{group.label}</Text>
                <Text style={styles.improvedChartValue}>{value}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    );
  };

  const renderChart = (title: string, data: number[], labels: string[], colors: string[]) => {
    const maxValue = Math.max(...data, 1);
    return (
      <Card style={styles.chartCard} backgroundColor="rgba(255, 255, 255, 0.05)">
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.chartContent}>
          {data.map((value, index) => (
            <View key={index} style={styles.chartBar}>
              <View style={styles.chartBarContainer}>
                <View 
                  style={[
                    styles.chartBarFill,
                    { 
                      height: `${(value / maxValue) * 100}%`,
                      backgroundColor: colors[index % colors.length]
                    }
                  ]} 
                />
              </View>
              <Text style={styles.chartLabel}>{labels[index]}</Text>
              <Text style={styles.chartValue}>{value}</Text>
            </View>
          ))}
        </View>
      </Card>
    );
  };

    const renderTopVideoPost = (post: any, index: number) => (
    <View key={post.uri} style={[
      styles.topVideoPostItem,
      index === insights.topPosts.length - 1 && { borderBottomWidth: 0 }
    ]}>
      <View style={styles.topVideoPostContent}>
                  <View style={styles.topVideoPostInfo}>
            <View style={styles.topVideoPostHeader}>
              <Text style={styles.topVideoPostRankText}>#{index + 1}</Text>
            </View>
            
            {post.text && post.text.trim() && (
              <Text style={styles.topVideoPostText} numberOfLines={2}>
                {post.text}
              </Text>
            )}
            
            <Text style={styles.topVideoPostDate} numberOfLines={1}>
              {formatDate(post.createdAt)}
            </Text>
            
            <View style={styles.topVideoPostStats}>
              <View style={styles.topVideoPostStat}>
                <Icon name="heart" size={12} color="#FE4359" />
                <Text style={styles.topVideoPostStatText}>{formatNumber(post.likeCount)}</Text>
              </View>
              <View style={styles.topVideoPostStat}>
                <Icon name="repeat" size={12} color="#00D4AA" />
                <Text style={styles.topVideoPostStatText}>{formatNumber(post.repostCount)}</Text>
              </View>
              <View style={styles.topVideoPostStat}>
                <Icon name="message" size={12} color="#3797F0" />
                <Text style={styles.topVideoPostStatText}>{formatNumber(post.replyCount)}</Text>
              </View>
            </View>
          </View>
        
        <Image
          source={{ uri: post.thumbnailUrl || post.videoUrl }}
          style={styles.topVideoPostThumbnail}
          resizeMode="contain"
          defaultSource={require('../assets/Vector_Normal_Grey.png')}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={TEXT.PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insights</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Last Updated Info - Top */}
        <View style={styles.lastUpdatedTop}>
          <Text style={styles.lastUpdatedTopText}>
            Last updated: {new Date().toLocaleTimeString()}
          </Text>
        </View>

        {/* User Info with Profile Photo and Account Stats */}
        {isLoading ? (
          <UserCardShimmer />
        ) : (
          <Card style={styles.userCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <View style={styles.userInfo}>
              <Avatar
                uri={userData?.avatar}
                type="profile"
                size={60}
              />
              <View style={styles.userNameContainer}>
                <Text style={styles.userName}>{userData?.displayName || 'User'}</Text>
                <VerificationBadge 
                  handle={userData?.handle || ''} 
                  textSize={24}
                  autoPosition={true}
                />
              </View>
              <Text style={styles.userHandle}>@{userData?.handle}</Text>
              
              {/* Account Stats */}
              <View style={styles.accountStats}>
                <View style={styles.accountStat}>
                  <Text style={styles.accountStatValue}>
                    {formatNumber(profileData?.followersCount || 0)}
                  </Text>
                  <Text style={styles.accountStatLabel}>Followers</Text>
                </View>
                <View style={styles.accountStatDivider} />
                <View style={styles.accountStat}>
                  <Text style={styles.accountStatValue}>
                    {formatNumber(profileData?.followsCount || 0)}
                  </Text>
                  <Text style={styles.accountStatLabel}>Following</Text>
                </View>
              </View>
              
              <Text style={styles.lastUpdated}>
                Joined {userData?.createdAt ? formatDate(userData.createdAt) : 'N/A'}
              </Text>
            </View>
          </Card>
        )}

        {/* Compact Key Metrics */}
        <View style={styles.metricsSection}>
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          <View style={styles.metricsGrid}>
            {isLoading ? (
              <>
                <MetricCardShimmer />
                <MetricCardShimmer />
                <MetricCardShimmer />
                <MetricCardShimmer />
              </>
            ) : (
              <>
                {renderMetricCard('Posts', formatNumber(insights.totalPosts), 'article-multiple', '#6366F1')}
                {renderMetricCard('Likes', formatNumber(insights.totalLikes), 'heart', '#FE4359')}
                {renderMetricCard('Reposts', formatNumber(insights.totalReposts), 'repeat', '#00D4AA')}
                {renderMetricCard('Replies', formatNumber(insights.totalReplies), 'message', '#3797F0')}
              </>
            )}
          </View>
        </View>

        {/* Engagement Overview */}
        {isLoading ? (
          <EngagementCardShimmer />
        ) : (
          <Card style={styles.engagementCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Engagement Overview</Text>
            <View style={styles.engagementStats}>
              <View style={styles.engagementStat}>
                <Text style={styles.engagementValue}>
                  {insights.totalPosts > 0 ? Math.round(insights.averageLikesPerPost) : 0}
                </Text>
                <Text style={styles.engagementLabel}>Avg. Likes/Post</Text>
              </View>
              <View style={styles.engagementStat}>
                <Text style={styles.engagementValue}>
                  {insights.totalPosts > 0 ? Math.round(insights.averageRepostsPerPost) : 0}
                </Text>
                <Text style={styles.engagementLabel}>Avg. Reposts/Post</Text>
              </View>
              <View style={styles.engagementStat}>
                <Text style={styles.engagementValue}>
                  {insights.totalPosts > 0 ? Math.round(insights.averageRepliesPerPost) : 0}
                </Text>
                <Text style={styles.engagementLabel}>Avg. Replies/Post</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Content Type Analysis */}
        {isLoading ? (
          <AnalysisCardShimmer />
        ) : (
          <Card style={styles.analysisCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Content Type Analysis</Text>
            <View style={styles.contentTypeStats}>
              {renderActivityBar(
                insights.postsByType.original, 
                insights.totalPosts, 
                'Original Posts', 
                '#6366F1'
              )}
              {renderActivityBar(
                insights.postsByType.reposts, 
                insights.totalPosts, 
                'Reposts', 
                '#00D4AA'
              )}
              {renderActivityBar(
                insights.postsByType.replies, 
                insights.totalPosts, 
                'Replies', 
                '#3797F0'
              )}
            </View>
            
            <Divider style={styles.analysisDivider} />
            
            <View style={styles.analysisInsight}>
              {insights.postsByType.reposts > insights.postsByType.original && insights.postsByType.reposts > insights.postsByType.replies ? (
                <View style={styles.insightContent}>
                  <Icon name="share" size={20} color="#3797F0" />
                  <Text style={styles.insightText}>
                    <Text style={[styles.insightHighlight, { color: '#3797F0' }]}>Content Sharer</Text>
                    {'\n'}You mainly amplify existing content through reposts ({Math.round((insights.postsByType.reposts / insights.totalPosts) * 100)}%).
                  </Text>
                </View>
              ) : insights.postsByType.original > insights.postsByType.reposts && insights.postsByType.original > insights.postsByType.replies ? (
                <View style={styles.insightContent}>
                  <Icon name="edit" size={20} color="#6366F1" />
                  <Text style={styles.insightText}>
                    <Text style={[styles.insightHighlight, { color: '#6366F1' }]}>Content Creator</Text>
                    {'\n'}You primarily share original content ({Math.round((insights.postsByType.original / insights.totalPosts) * 100)}%).
                  </Text>
                </View>
              ) : (
                <View style={styles.insightContent}>
                  <Icon name="message" size={20} color="#3797F0" />
                  <Text style={styles.insightText}>
                    <Text style={[styles.insightHighlight, { color: '#3797F0' }]}>Community Engager</Text>
                    {'\n'}You actively participate in conversations ({Math.round((insights.postsByType.replies / insights.totalPosts) * 100)}%).
                  </Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Updated Activity by Hour Chart */}
        {isLoading ? (
          <ChartCardShimmer />
        ) : (
          renderActivityByHourChart()
        )}

        {/* Activity by Day */}
        {isLoading ? (
          <ChartCardShimmer />
        ) : (
          renderChart(
            'Activity by Day',
            insights.postsByDay,
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            ['#6366F1', '#FE4359', '#00D4AA', '#3797F0', '#FFB800', '#9C27B0', '#4CAF50']
          )
        )}

        {/* Top Video Posts */}
        {isLoading ? (
          <Card style={styles.topVideoPostsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Top Performing Videos</Text>
            <TopPostCardShimmer />
            <TopPostCardShimmer />
            <TopPostCardShimmer />
          </Card>
        ) : insights.topPosts.length > 0 ? (
          <Card style={styles.topVideoPostsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Top Performing Videos</Text>
            {insights.topPosts.map((post, index) => renderTopVideoPost(post, index))}
          </Card>
        ) : null}

        {/* Fun Facts */}
        {isLoading ? (
          <FunFactsCardShimmer />
        ) : (
          <Card style={styles.funFactsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Fun Facts</Text>
            <View style={styles.funFactsGrid}>
              <View style={styles.funFact}>
                <Text style={styles.funFactLabel}>Most Active Day</Text>
                <Text style={styles.funFactValue}>
                  {insights.mostActiveDay ? new Date(insights.mostActiveDay).toLocaleDateString('en-US', { weekday: 'long' }) : 'N/A'}
                </Text>
              </View>
              <View style={styles.funFact}>
                <Text style={styles.funFactLabel}>Posts Per Day</Text>
                <Text style={styles.funFactValue}>{insights.postsPerDay.toFixed(1)}</Text>
              </View>
              <View style={styles.funFact}>
                <Text style={styles.funFactLabel}>Avg. Post Length</Text>
                <Text style={styles.funFactValue}>{Math.round(insights.averagePostLength)} chars</Text>
              </View>
              <View style={styles.funFact}>
                <Text style={styles.funFactLabel}>Favorite Emoji</Text>
                <Text style={styles.funFactValue}>{insights.favoriteEmoji || 'None'}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Social Score & Creator Level */}
        {isLoading ? (
          <SocialScoreCardShimmer />
        ) : (
          <Card style={styles.socialScoreCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Creator Status</Text>
            <View style={styles.socialScoreContent}>
              <View style={styles.socialScoreMain}>
                <View style={styles.socialScoreCircle}>
                  <Text style={styles.socialScoreValue}>{insights.socialScore}</Text>
                  <Text style={styles.socialScoreLabel}>Social Score</Text>
                </View>
                <View style={styles.creatorLevelInfo}>
                  <Text style={styles.creatorLevelTitle}>{insights.creatorLevel.title}</Text>
                  <Text style={styles.creatorLevelDescription}>{insights.creatorLevel.description}</Text>
                  <View style={styles.levelProgressContainer}>
                    <View style={styles.levelProgressBar}>
                      <View 
                        style={[
                          styles.levelProgressFill, 
                          { width: `${(insights.creatorLevel.progress / (insights.creatorLevel.nextLevel - insights.creatorLevel.level * 20)) * 100}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.levelProgressText}>
                      Level {insights.creatorLevel.level} → {insights.creatorLevel.nextLevel}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Card>
        )}

        {/* Achievements */}
        {isLoading ? (
          <AchievementsCardShimmer />
        ) : (
          <Card style={styles.achievementsCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Achievements</Text>
            <View style={styles.achievementsGrid}>
              {insights.achievements.map((achievement, index) => (
                <View key={achievement.id} style={styles.achievementItem}>
                  <View style={[
                    styles.achievementIcon, 
                    { 
                      backgroundColor: achievement.unlocked ? achievement.color : 'rgba(255, 255, 255, 0.1)',
                      opacity: achievement.unlocked ? 1 : 0.5
                    }
                  ]}>
                    {achievement.icon === 'verified-badge' ? (
                      <VerificationBadge 
                        handle={userData?.handle || ''} 
                        size={28}
                        textColor={achievement.unlocked ? '#FFFFFF' : TEXT.SECONDARY}
                        borderColor={achievement.unlocked ? '#FFFFFF' : TEXT.SECONDARY}
                      />
                    ) : (
                      <Icon 
                        name={achievement.icon} 
                        size={20} 
                        color={achievement.unlocked ? '#FFFFFF' : TEXT.SECONDARY} 
                      />
                    )}
                  </View>
                  <View style={styles.achievementContent}>
                    <Text style={[
                      styles.achievementTitle,
                      { color: achievement.unlocked ? TEXT.PRIMARY : TEXT.SECONDARY }
                    ]}>
                      {achievement.title}
                    </Text>
                    <Text style={styles.achievementDescription}>{achievement.description}</Text>
                    {achievement.target > 1 && (
                      <View style={styles.achievementProgress}>
                        <View style={styles.achievementProgressBar}>
                          <View 
                            style={[
                              styles.achievementProgressFill,
                              { 
                                width: `${(achievement.progress / achievement.target) * 100}%`,
                                backgroundColor: achievement.color
                              }
                            ]} 
                          />
                        </View>
                        <Text style={styles.achievementProgressText}>
                          {achievement.progress}/{achievement.target}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Streak Counter */}
        {isLoading ? (
          <StreakCardShimmer />
        ) : (
          <Card style={styles.streakCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Posting Streak</Text>
            <View style={styles.streakContent}>
              <View style={styles.streakInfo}>
                <Text style={styles.streakCount}>{insights.streakCount}</Text>
                <Text style={styles.streakLabel}>Days</Text>
                <Text style={styles.streakDescription}>
                  {insights.streakCount > 0 ? 'Keep up the great work!' : 'Start your streak today!'}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Network Insights */}
        {insights.mutualConnections.length > 0 && (
          <Card style={styles.networkCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Mutual Connections</Text>
            <Text style={styles.networkDescription}>
              {insights.mutualConnections.length} people you follow also follow you back
            </Text>
            <View style={styles.mutualConnectionsList}>
              {insights.mutualConnections.slice(0, 5).map((connection, index) => (
                <View key={connection.did} style={styles.mutualConnectionItem}>
                  <Avatar
                    uri={connection.avatar}
                    type="profile"
                    size={40}
                  />
                  <View style={styles.mutualConnectionInfo}>
                    <Text style={styles.mutualConnectionName}>{connection.displayName}</Text>
                    <Text style={styles.mutualConnectionHandle}>@{connection.handle}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Most Engaged Followers */}
        {insights.mostEngagedFollowers.length > 0 && (
          <Card style={styles.engagedFollowersCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Most Engaged Followers</Text>
            <Text style={styles.networkDescription}>
              These followers interact with your content the most
            </Text>
            <View style={styles.engagedFollowersList}>
              {insights.mostEngagedFollowers.slice(0, 3).map((follower, index) => (
                <View key={follower.did} style={styles.engagedFollowerItem}>
                  <View style={styles.engagedFollowerRank}>
                    <Text style={styles.engagedFollowerRankText}>#{index + 1}</Text>
                  </View>
                  <Avatar
                    uri={follower.avatar}
                    type="profile"
                    size={40}
                  />
                  <View style={styles.engagedFollowerInfo}>
                    <Text style={styles.engagedFollowerName}>{follower.displayName}</Text>
                    <Text style={styles.engagedFollowerHandle}>@{follower.handle}</Text>
                  </View>
                  <View style={styles.engagedFollowerStats}>
                    <Text style={styles.engagedFollowerCount}>{follower.interactionCount}</Text>
                    <Text style={styles.engagedFollowerLabel}>interactions</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Top Commenters */}
        {insights.topCommenters.length > 0 && (
          <Card style={styles.topCommentersCard} backgroundColor="rgba(255, 255, 255, 0.05)">
            <Text style={styles.cardTitle}>Top Commenters</Text>
            <Text style={styles.networkDescription}>
              These users reply to your posts the most
            </Text>
            <View style={styles.topCommentersList}>
              {insights.topCommenters.slice(0, 3).map((commenter, index) => (
                <View key={commenter.did} style={styles.topCommenterItem}>
                  <View style={styles.topCommenterRank}>
                    <Text style={styles.topCommenterRankText}>#{index + 1}</Text>
                  </View>
                  <Avatar
                    uri={commenter.avatar}
                    type="profile"
                    size={40}
                  />
                  <View style={styles.topCommenterInfo}>
                    <Text style={styles.topCommenterName}>{commenter.displayName}</Text>
                    <Text style={styles.topCommenterHandle}>@{commenter.handle}</Text>
                  </View>
                  <View style={styles.topCommenterStats}>
                    <Text style={styles.topCommenterCount}>{commenter.commentCount}</Text>
                    <Text style={styles.topCommenterLabel}>replies</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.PRIMARY,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: TEXT.SECONDARY,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: TEXT.PRIMARY,
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  userCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 16,
  },
  userInfo: {
    alignItems: 'center',
  },
  userNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
  },
  userHandle: {
    fontSize: 16,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
  },
  accountStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  accountStat: {
    alignItems: 'center',
    flex: 1,
  },
  accountStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  accountStatLabel: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  accountStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  lastUpdated: {
    fontSize: 12,
    color: TEXT.TERTIARY,
    fontFamily: 'Firma-Regular',
    marginTop: 12,
  },
  metricsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    marginBottom: 16,
    fontFamily: 'Firma-Bold',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '48%',
    marginBottom: 12,
  },
  metricContent: {
    alignItems: 'center',
    padding: 16,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    marginTop: 6,
    fontFamily: 'Firma-Bold',
  },
  metricTitle: {
    fontSize: 11,
    color: TEXT.SECONDARY,
    marginTop: 2,
    textAlign: 'center',
    fontFamily: 'Firma-Regular',
  },
  engagementCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    marginBottom: 20,
    fontFamily: 'Firma-Bold',
  },
  engagementStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  engagementStat: {
    alignItems: 'center',
    flex: 1,
  },
  engagementValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  engagementLabel: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Firma-Regular',
  },
  analysisCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  contentTypeStats: {
    marginBottom: 20,
  },
  activityBarContainer: {
    marginBottom: 16,
  },
  activityBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activityBarLabel: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  activityBarValue: {
    fontSize: 14,
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  activityBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  activityBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  analysisDivider: {
    marginVertical: 20,
  },
  analysisInsight: {
    marginTop: 12,
  },
  insightContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insightText: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
    fontFamily: 'Firma-Regular',
  },
  insightHighlight: {
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
  },
  chartCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    marginBottom: 20,
    fontFamily: 'Firma-Bold',
  },
  chartContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    paddingHorizontal: 8,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  chartBarContainer: {
    width: 32,
    height: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  chartBarFill: {
    width: '100%',
    minHeight: 4,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  chartLabel: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Firma-Regular',
  },
  chartValue: {
    fontSize: 10,
    color: '#6366F1',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },
  improvedChartContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  improvedChartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  improvedChartBarContainer: {
    width: 36,
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  improvedChartBarFill: {
    width: '100%',
    minHeight: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  improvedChartLabel: {
    fontSize: 11,
    color: TEXT.SECONDARY,
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Firma-Regular',
  },
  improvedChartValue: {
    fontSize: 10,
    color: '#6366F1',
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },
  topPostsSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  topPostCard: {
    marginBottom: 16,
  },
  topPostHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topPostDate: {
    fontSize: 12,
    color: TEXT.TERTIARY,
    fontFamily: 'Firma-Regular',
  },
  topPostText: {
    fontSize: 14,
    color: TEXT.PRIMARY,
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: 'Firma-Regular',
  },
  topPostStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  topPostStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topPostStatText: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    marginLeft: 4,
    fontFamily: 'Firma-Regular',
  },
  funFactsCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  funFactsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  funFact: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 20,
  },
  funFactLabel: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: 'Firma-Regular',
  },
  funFactValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    textAlign: 'center',
    fontFamily: 'Firma-Bold',
  },

  lastUpdatedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 8,
  },
  lastUpdatedTopText: {
    fontSize: 12,
    color: TEXT.TERTIARY,
    marginLeft: 4,
    fontFamily: 'Firma-Regular',
  },
  // New analytics styles
  socialScoreCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  socialScoreContent: {
    alignItems: 'center',
  },
  socialScoreMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  socialScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  socialScoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  socialScoreLabel: {
    fontSize: 10,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  creatorLevelInfo: {
    flex: 1,
    marginLeft: 20,
  },
  creatorLevelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
    marginBottom: 4,
  },
  creatorLevelDescription: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginBottom: 12,
  },
  levelProgressContainer: {
    marginTop: 8,
  },
  levelProgressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  levelProgressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  levelProgressText: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  achievementsCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  achievementsGrid: {
    gap: 16,
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  achievementContent: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  achievementDescription: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginBottom: 8,
  },
  achievementProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  achievementProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8,
  },
  achievementProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  achievementProgressText: {
    fontSize: 10,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    minWidth: 30,
  },
  streakCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakIcon: {
    marginRight: 16,
  },
  streakInfo: {
    alignItems: 'center',
  },
  streakCount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B35',
    fontFamily: 'Firma-Bold',
  },
  streakLabel: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },
  streakDescription: {
    fontSize: 12,
    color: TEXT.TERTIARY,
    fontFamily: 'Firma-Regular',
    textAlign: 'center',
  },
  networkCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  networkDescription: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
    marginBottom: 16,
    textAlign: 'center',
  },
  mutualConnectionsList: {
    gap: 12,
  },
  mutualConnectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },

  mutualConnectionInfo: {
    flex: 1,
  },
  mutualConnectionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  mutualConnectionHandle: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  engagedFollowersCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  engagedFollowersList: {
    gap: 12,
  },
  engagedFollowerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  engagedFollowerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  engagedFollowerRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Firma-Bold',
  },

  engagedFollowerInfo: {
    flex: 1,
  },
  engagedFollowerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  engagedFollowerHandle: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  engagedFollowerStats: {
    alignItems: 'flex-end',
  },
  engagedFollowerCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6366F1',
    fontFamily: 'Firma-Bold',
  },
  engagedFollowerLabel: {
    fontSize: 10,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  topCommentersCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
  topCommentersList: {
    gap: 12,
  },
  topCommenterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  topCommenterRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3797F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topCommenterRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Firma-Bold',
  },

  topCommenterInfo: {
    flex: 1,
  },
  topCommenterName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TEXT.PRIMARY,
    fontFamily: 'Firma-Bold',
  },
  topCommenterHandle: {
    fontSize: 14,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  topCommenterStats: {
    alignItems: 'flex-end',
  },
  topCommenterCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3797F0',
    fontFamily: 'Firma-Bold',
  },
  topCommenterLabel: {
    fontSize: 10,
    color: TEXT.SECONDARY,
    fontFamily: 'Firma-Regular',
  },
  // Video list item styles (like notifications)
  topVideoPostItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: UI.BORDER.PRIMARY,
  },

  topVideoPostRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Firma-Bold',
  },
  topVideoPostContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  topVideoPostInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  topVideoPostHeader: {
    marginBottom: 8,
  },
  topVideoPostDate: {
    fontSize: 12,
    color: TEXT.TERTIARY,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    marginBottom: 8,
  },
  topVideoPostThumbnail: {
    width: 54,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  topVideoPostText: {
    fontSize: 14,
    color: TEXT.LIGHT_GREY,
    lineHeight: 18,
    marginBottom: 8,
    fontFamily: 'Firma-Regular',
  },
  topVideoPostStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
  },
  topVideoPostStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topVideoPostStatText: {
    fontSize: 12,
    color: TEXT.SECONDARY,
    marginLeft: 4,
    fontFamily: 'Firma-Regular',
  },
  topVideoPostsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  topVideoPostsCard: {
    margin: 20,
    marginTop: 0,
    marginBottom: 8,
  },
});

export default InsightsScreen; 