import React, { useState, useCallback, useMemo } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../ui/UI';
import { isTablet, isSmallScreen, getBottomNavBarHeight } from '../../../utils/helpers/screenSize';
import Icon, { HeartFillIcon, ChatFillIcon, RefreshFillIcon, MoreFillIcon, TvIcon } from '../../ui/Icon';
import { Avatar } from '../../ui/UI';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useProfileColors } from '../../../services/cache/ProfileCache';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import VerificationBadge from '../verification/VerificationBadge';
import { useGlobalShareSheet } from '../../../hooks/useGlobalShareSheet';
import { useGlobalCommentSection } from '../../../hooks/useGlobalCommentSection';
import { useNavigation, NavigationProp } from '@react-navigation/native';


const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Use any type for post
type Post = any;

type RootStackParamList = {
  AuthorProfile: { handle: string };
};

// Map feed URIs to readable names
const getFeedDisplayName = (uri: string): string => {
  switch (uri) {
    case 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids':
      return 'for your consideration';
    case 'at://following':
      return 'following';
    default:
      if (uri.includes('/app.bsky.feed.generator/')) {
        const parts = uri.split('/app.bsky.feed.generator/');
        if (parts.length > 1) {
          const feedName = parts[1];
          return feedName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }
      return 'Custom Feed';
  }
};

export interface VideoOverlayUIProps {
  post: Post;
  isVisible: boolean;
  isModal?: boolean;
  feedOption?: string;
  sourceFeed?: string;
  onLike?: () => void;
  onRepost?: () => void;
  onSourcePress?: () => void;
  isLiked?: boolean;
  isReposted?: boolean;
  likeCount?: number;
  repostCount?: number;
  isLikePending?: boolean;
  isRepostPending?: boolean;
}

const VideoOverlayUI: React.FC<VideoOverlayUIProps> = ({
  post,
  isVisible,
  isModal = false,
  feedOption,
  sourceFeed,
  onLike,
  onRepost,
  onSourcePress,
  isLiked = false,
  isReposted = false,
  likeCount = 0,
  repostCount = 0,
  isLikePending = false,
  isRepostPending = false,
}) => {
  const isTabletDevice = isTablet();
  const isSmallScreenDevice = isSmallScreen();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  const { width, height } = useWindowDimensions();
  const { presentShareSheet } = useGlobalShareSheet();
  const { presentCommentSection } = useGlobalCommentSection();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  // Overlay state
  const [isOverlayCollapsed, setIsOverlayCollapsed] = useState(true);

  // Get profile colors for overlay
  const { colors: profileColors } = useProfileColors(post.author?.handle);

  // Memoize author and record to prevent unnecessary re-renders
  const author = useMemo(() => post.author || {}, [post.author]);
  const record = useMemo(() => post.record || {}, [post.record]);

  // Memoize profile picture URL
  const profilePicUrl = useMemo(() => 
    author.avatar && author.avatar.startsWith('http')
      ? author.avatar
      : 'https://via.placeholder.com/40',
    [author.avatar]
  );

  const toggleCollapsed = useCallback(() => {
    setIsOverlayCollapsed(prev => !prev);
  }, []);

  // Modal-aware navigation to AuthorProfile (works inside FeedModal or regular screens)
  const navigateToAuthorProfile = useCallback((rawHandle?: string | null) => {
    const cleanHandle = (rawHandle || '').trim();
    if (!cleanHandle) {
      console.error('VideoOverlayUI: Cannot navigate: Invalid handle:', rawHandle);
      return;
    }

    let rootNav: any = navigation as any;
    while (rootNav?.getParent?.()) {
      rootNav = rootNav.getParent();
    }
    rootNav?.navigate?.('AuthorProfile', { handle: cleanHandle });
  }, [navigation]);

  // Handle author press
  const handleAuthorPress = useCallback(() => {
    const handle = author.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle);
    } else {
      console.error('VideoOverlayUI: Cannot navigate: Invalid or missing handle', author);
    }
  }, [author, navigateToAuthorProfile]);

  // Handle repost author press
  const handleRepostAuthorPress = useCallback(() => {
    const handle = post.repostedBy?.handle?.trim();
    if (handle && typeof handle === 'string' && handle.trim() !== '') {
      navigateToAuthorProfile(handle);
    } else {
      console.error('VideoOverlayUI: Cannot navigate: Invalid or missing handle', post.repostedBy);
    }
  }, [post.repostedBy, navigateToAuthorProfile]);

  // Handle share button press
  const handleSharePress = useCallback(() => {
    presentShareSheet({
      postUri: post.uri,
      postCid: post.cid,
      authorDid: post.author?.did || '',
      authorName: post.author?.displayName || post.author?.handle,
      feedOption: feedOption as any,
      sourceFeed,
    });
  }, [post.uri, post.cid, post.author, feedOption, sourceFeed, presentShareSheet]);

  // Memoized UI components
  // Optimistic like animation (scale pulse)
  const likeScale = useSharedValue(1);
  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const contentPadding = Math.round(Math.max(8, Math.min(14, width * 0.025)));
  const actionIconSize = Math.round(Math.max(28, Math.min(40, width * 0.085)));
  const smallIconSize = Math.max(14, Math.min(20, Math.round(width * 0.05)));
  const authorAvatarSize = Math.round(Math.max(46, Math.min(64, width * 0.12)));
  const repostAvatarSize = Math.round(Math.max(20, Math.min(28, width * 0.06)));

  const renderLikeIcon = useCallback(() => (
    <Animated.View style={likeAnimatedStyle}>
      <HeartFillIcon 
        size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
        color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.white} 
      />
    </Animated.View>
  ), [isLiked, isTabletDevice, likeAnimatedStyle]);

  // Repost animation: quick tilt (wiggle) + slight scale pulse
  const repostScale = useSharedValue(1);
  const repostRotate = useSharedValue(0); // radians
  const repostAnimatedStyle = useAnimatedStyle(() => {
    const rotateStr = `${repostRotate.value}rad`;
    return {
      // Cast to any to satisfy RN's transform union typing with animated values
      transform: [
        { rotate: rotateStr as any },
        { scale: repostScale.value as any },
      ] as any,
    };
  });
  const renderRepostIcon = useCallback(() => (
    <Animated.View style={repostAnimatedStyle}>
      <RefreshFillIcon 
        size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
        color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE} 
      />
    </Animated.View>
  ), [isReposted, isTabletDevice, repostAnimatedStyle]);

  const repostIcon = useMemo(() => (
    <RefreshFillIcon 
      size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} 
      color={isReposted ? Colors.INTERACTIVE.REPOST.ACTIVE : Colors.INTERACTIVE.REPOST.INACTIVE} 
    />
  ), [isReposted, isTabletDevice, actionIconSize]);

  const commentIcon = useMemo(() => (
    <ChatFillIcon size={isTabletDevice ? Math.max(actionIconSize, 34) : actionIconSize} color={Colors.INTERACTIVE.COMMENT} />
  ), [isTabletDevice, actionIconSize]);

  // Only use sourceFeed for yourMix feeds
  const shouldUseSourceFeed = feedOption === 'yourMix' && sourceFeed;
  
  // Memoize source display name - only for yourMix feeds
  const sourceDisplayName = useMemo(() => {
    if (shouldUseSourceFeed) {
      if (sourceFeed === 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids') {
        return null;
      }
      return getFeedDisplayName(sourceFeed) || '';
    }
    return null;
  }, [shouldUseSourceFeed, sourceFeed]);

  if (!isVisible) return null;

  return (
    <>
      <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Gradient overlay with hardware acceleration */}
      <View style={[styles.uiOverlay, { height: height * 0.8 }]} pointerEvents="none">
        <LinearGradient
          colors={isOverlayCollapsed 
            ? ['transparent', 'transparent', 'transparent', 'transparent']
            : ['rgba(0, 0, 0, 0.95)', 'rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.3)', 'transparent']
          }
          locations={[0, 0.4, 0.6, 1]}
          style={{ flex: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
        />
      </View>
      
      <View 
        style={[
          styles.overlayContentContainer,
          { padding: contentPadding },
          isModal ? { bottom: 0 } : (isSmallScreenDevice || isTabletDevice) ? { bottom: bottomNavBarHeight} : {},
        ]} 
        pointerEvents="box-none"
      >
        <View style={styles.infoColumn} pointerEvents="box-none">
          {/* Repost indicator */}
          {post.repostedBy && (
            <View style={styles.repostIndicatorBox}>
              <TouchableOpacity 
                style={styles.repostIndicatorContainer} 
                activeOpacity={0.7}
                onPress={handleRepostAuthorPress}
              >
                <Avatar
                  uri={post.repostedBy?.avatar && post.repostedBy.avatar.startsWith('http')
                    ? post.repostedBy.avatar
                    : 'https://via.placeholder.com/40'}
                  type="user"
                  size={isTabletDevice ? Math.max(repostAvatarSize, 22) : repostAvatarSize}
                  ringColor="transparent"
                  style={styles.repostAvatar}
                />
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Text style={
                    isTabletDevice
                      ? styles.repostIndicatorTextTablet
                      : styles.repostIndicatorText
                  }>
                    {(post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown').length > 30 
                      ? (post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown').substring(0, 30) + '...'
                      : (post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown')
                    }
                  </Text>
                  {post.repostedBy?.handle && (
                    <VerificationBadge 
                      handle={post.repostedBy.handle} 
                      textSize={isTabletDevice ? 16 : 14} 
                      autoPosition={true}
                      textColor={styles.repostIndicatorText.color}
                    />
                  )}
                  <Text style={[
                    isTabletDevice
                      ? styles.repostIndicatorTextTablet
                      : styles.repostIndicatorText,
                    { marginLeft: -1 }
                  ]}>
                    {' reposted'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          
          {/* Description container */}
          {(record.text || !record.text) && (
            <View style={styles.descriptionContainer}>
              {record.text ? (
                <>
                  <TouchableOpacity onPress={toggleCollapsed} activeOpacity={0.8}>
                    <TextWithAuthorLinks
                      text={record.text}
                      style={styles.descriptionText}
                      numberOfLines={isOverlayCollapsed ? 1 : undefined}
                      onAuthorPress={navigateToAuthorProfile}
                    />
                  </TouchableOpacity>
                  {!isOverlayCollapsed && record.createdAt && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.dateText}>
                        {new Date(record.createdAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                        {record.metadata?.orbyt && record.metadata?.platform && (
                          <Text style={styles.orbytText}> • {record.metadata.platform}</Text>
                        )}
                      </Text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={handleSharePress} activeOpacity={0.8}>
                    <MoreFillIcon size={28} color={Colors.white} />
                  </TouchableOpacity>
                  {!isOverlayCollapsed && record.createdAt && (
                    <Text style={styles.dateText}>
                      {new Date(record.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                      {record.metadata?.orbyt && record.metadata?.platform && (
                        <Text style={styles.orbytText}> • {record.metadata.platform}</Text>
                      )}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
          
          {/* Author info */}
          <TouchableOpacity
            style={styles.authorInfoContainer}
            activeOpacity={0.7}
            onPress={handleAuthorPress}
          >
            <Avatar
              uri={profilePicUrl}
              type="profile"
              size={authorAvatarSize}
              profileColors={profileColors}
              ringColor="transparent"
                              style={[
                  isTabletDevice
                    ? styles.profilePictureTablet
                    : styles.profilePicture
                ]}
            />
            <View style={styles.authorTextContainer}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text 
                  style={[
                    styles.baseText,
                    isTabletDevice
                      ? styles.authorNameTablet
                      : styles.authorName
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {author.displayName || author.handle || 'Unknown'}
                </Text>
                {author.handle && <VerificationBadge 
                  handle={author.handle} 
                  textSize={isTabletDevice ? 16 : 14} 
                  autoPosition={true}
                  textColor={Colors.white}
                />}
              </View>
              {feedOption === 'yourMix' && sourceDisplayName ? (
                <TouchableOpacity 
                  style={styles.sourceIndicatorContainer}
                  activeOpacity={0.7}
                  onPress={onSourcePress}
                >
                  <View style={{ marginRight: 4 }}>
                    <TvIcon 
                      size={isTabletDevice ? Math.max(smallIconSize, 14) : smallIconSize}
                      color={sourceDisplayName === 'for your consideration' ? Colors.lightGray : '#cfd6e8'}
                    />
                  </View>
                  <Text style={[
                    isTabletDevice
                      ? styles.sourceTextTablet
                      : styles.sourceText,
                    { color: sourceDisplayName === 'for your consideration' ? Colors.lightGray : '#cfd6e8' }
                  ]}>
                    {sourceDisplayName}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Action buttons */}
        <View style={styles.actionsContainer} pointerEvents="box-none">
          <TouchableOpacity 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton
            ]} 
            onPress={handleSharePress}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <MoreFillIcon size={isTabletDevice ? Math.max(actionIconSize - 2, 28) : actionIconSize - 2} color={Colors.white} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton,
              isRepostPending && styles.actionButtonDisabled
            ]} 
            onPress={() => {
              // Different animation than heart: wiggle (tilt) + slight scale
              if (!isReposted) {
                repostScale.value = withSequence(
                  withTiming(1.08, { duration: 120 }),
                  withTiming(1.0, { duration: 120 })
                );
                repostRotate.value = withSequence(
                  withTiming(0.20, { duration: 90 }), // ~11.5deg
                  withTiming(-0.12, { duration: 90 }), // ~-7deg
                  withTiming(0, { duration: 90 })
                );
              } else {
                // On undo, ensure we reset any lingering transforms
                repostScale.value = withTiming(1, { duration: 100 });
                repostRotate.value = withTiming(0, { duration: 100 });
              }
              onRepost?.();
            }}
            disabled={isRepostPending}
            activeOpacity={0.7}
          >
            {renderRepostIcon()}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(repostCount)}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton
            ]} 
            onPress={() => {
              presentCommentSection({
                post,
                totalLikes: likeCount,
                totalComments: post.replyCount || 0,
                isLiked,
                postedAt: post.record?.createdAt || post.indexedAt,
                onToggleLike: onLike,
                isLikePending,
              });
            }}
            activeOpacity={0.7}
          >
            {commentIcon}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(post.replyCount || 0)}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.baseActionButton,
              isTabletDevice
                ? styles.actionButtonTablet
                : styles.actionButton,
              isLikePending && styles.actionButtonDisabled
            ]} 
            onPress={() => {
              // Animate only on like; if unliking mid-animation, reset scale
              if (!isLiked) {
                likeScale.value = withSpring(1.2, { damping: 12, stiffness: 220 }, () => {
                  likeScale.value = withSpring(1);
                });
              } else {
                // ensure we cancel any lingering animation when unliking
                likeScale.value = withSpring(1);
              }
              onLike?.();
            }}
            disabled={isLikePending}
            activeOpacity={0.7}
          >
            {renderLikeIcon()}
            <Text style={isTabletDevice ? styles.actionTextTablet : styles.actionText}>{formatNumber(likeCount)}</Text>
          </TouchableOpacity>
                 </View>
       </View>
     </View>
     </>
   );
 };

// Styles
const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 5,
  },
  uiOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.8,
    zIndex: 1,
  },
  overlayContentContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    marginBottom: 0,
  },
  repostIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  repostIndicatorText: {
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 4,
  },
  repostIndicatorTextTablet: {
    color: 'rgba(0, 0, 0, 0.8)',
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    marginLeft: 4,
  },
  repostIndicatorBox: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: BORDER_RADIUS.SMALL,
    paddingHorizontal: 4,
    marginBottom: 3,
    alignSelf: 'flex-start',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  repostAvatar: {
    marginRight: 2,
  },
  descriptionContainer: {
    marginBottom: 6,
    paddingRight: 10,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  descriptionText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dateText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  orbytText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 4,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  profilePicture: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.FULL,
  },
  profilePictureSmallScreen: {
    width: 46,
    height: 46,
    borderRadius: BORDER_RADIUS.FULL,
  },
  profilePictureTablet: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.FULL,
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  baseText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontFamily: 'Firma-Medium',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorName: {
    fontSize: 16,
    fontFamily: 'Firma-Black',
    lineHeight: 22,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    fontSize: 15,
    fontFamily: 'Firma-Black',
    lineHeight: 18,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameTablet: {
    fontSize: 19,
    fontFamily: 'Firma-Black',
    lineHeight: 25,
    includeFontPadding: false,
    flexShrink: 1,
  },
  sourceIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  sourceText: {
    fontSize: 13,
    fontFamily: 'Firma-SemiBold',
  },
  sourceTextSmallScreen: {
    fontSize: 12,
    fontFamily: 'Firma-SemiBold',
  },
  sourceTextTablet: {
    fontSize: 15,
    fontFamily: 'Firma-SemiBold',
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: 0,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  baseActionButton: {
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 36.5,
  },
  actionButton: {
    marginVertical: 4,
  },
  actionButtonSmallScreen: {
    marginVertical: 3,
  },
  actionButtonTablet: {
    marginVertical: 5,
    width: 44,
  },
  iconContainer: {
    width: 34.5,
    height: 34.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: Colors.white,
    fontSize: 12.5,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionTextTablet: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionButtonDisabled: {
    // Removed opacity transparency effect
  },
});

export default VideoOverlayUI;
