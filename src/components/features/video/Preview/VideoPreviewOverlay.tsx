import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { BRAND, PROFILE, INTERACTIVE } from '../../../../utils/formatting/Colors';
import VerificationBadge from '../../verification/VerificationBadge';
import { isSmallScreen, getBottomNavBarHeight } from '../../../../utils/helpers/screenSize';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../../ui/Icon';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Author {
  avatar?: string;
  displayName?: string;
  handle?: string;
  did?: string;
  profileColors?: {
    backgroundColor: string;
    foregroundColor: string;
  };
}

interface Record {
  text?: string;
}

interface Post {
  uri: string;
  cid?: string;
  author?: Author;
  record?: Record;
  viewer?: {
    like?: string;
    repost?: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  embed?: any;
  repostedBy?: Author;
}

interface VideoPreviewOverlayProps {
  post: Post;
}

const VideoPreviewOverlay: React.FC<VideoPreviewOverlayProps> = ({ post }) => {
  const isSmallDevice = isSmallScreen();
  const insets = useSafeAreaInsets();
  const bottomNavBarHeight = getBottomNavBarHeight(insets);
  
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

  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [needsCollapsing, setNeedsCollapsing] = useState<boolean>(false);

  // Memoize text collapsing logic
  React.useEffect(() => {
    if (record.text && record.text.length > 80) {
      setNeedsCollapsing(true);
    } else {
      setNeedsCollapsing(false);
      setIsCollapsed(false);
    }
  }, [record.text]);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  const formatNumber = (num: number): string => {
    if (num >= 100000) {
      return `${Math.floor(num / 1000)}K`;
    } else if (num >= 10000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <View style={[
      styles.overlayContentContainer,
      isSmallDevice && { 
        bottom: bottomNavBarHeight,
      }
    ]}>
      <View style={styles.infoColumn}>
        {post.repostedBy && (
          <View style={styles.repostIndicatorContainer}>
            <Icon name="repeat" size={22} color={INTERACTIVE.REPOST.ACTIVE} />
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={styles.repostIndicatorText}>
                {post.repostedBy?.displayName || post.repostedBy?.handle || 'Unknown'} reposted
              </Text>
              {post.repostedBy?.handle && (
                <VerificationBadge 
                  handle={post.repostedBy.handle} 
                  size={12} 
                  style={{
                    marginLeft: 4,
                    shadowColor: 'rgba(0, 0, 0, 0.3)',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.5,
                    shadowRadius: 2
                  }}
                  textColor={styles.repostIndicatorText.color}
                />
              )}
            </View>
          </View>
        )}
        
        {record.text && (
          <View style={styles.descriptionContainer}>
            <TouchableOpacity onPress={toggleCollapsed} activeOpacity={0.8}>
              <Text
                style={styles.descriptionText}
                numberOfLines={isCollapsed && needsCollapsing ? 1 : undefined}
              >
                {record.text}
              </Text>
              {needsCollapsing && (
                <Text style={styles.expandText}>
                  {isCollapsed ? 'Show more' : 'Show less'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.authorInfoContainer}>
          <Image
            source={{ uri: profilePicUrl }}
            style={[
              isSmallDevice ? styles.profilePictureSmallScreen : styles.profilePicture,
              { borderColor: author.profileColors?.foregroundColor || PROFILE.DEFAULT_RING }
            ]}
          />
          <View style={styles.authorTextContainer}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <Text style={isSmallDevice ? styles.authorNameSmallScreen : styles.authorName}>
                {author.displayName || author.handle || 'Unknown'}
              </Text>
              {author.handle && <VerificationBadge 
                handle={author.handle} 
                size={14} 
                style={{
                  marginLeft: 4,
                  shadowColor: 'rgba(0, 0, 0, 0.3)',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.5,
                  shadowRadius: 2
                }}
                textColor={BRAND.SECONDARY}
              />}
            </View>
            <Text style={isSmallDevice ? styles.authorHandleSmallScreen : styles.authorHandle}>
              @{author.handle || 'unknown'}
            </Text>
          </View>
        </View>
      </View>
      
      {/* Post Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={isSmallDevice ? styles.actionButtonSmallScreen : styles.actionButton} 
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <Icon name="more-horizontal" size={28} color={BRAND.SECONDARY} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={isSmallDevice ? styles.actionButtonSmallScreen : styles.actionButton} 
          activeOpacity={0.7}
        >
          <Icon name="repeat" size={30} color={INTERACTIVE.REPOST.INACTIVE} />
          <Text style={styles.actionText}>{formatNumber(post.repostCount || 0)}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={isSmallDevice ? styles.actionButtonSmallScreen : styles.actionButton} 
          activeOpacity={0.7}
        >
          <Image 
            source={require('../../../../assets/PostActions/Comments-PixelArtIcon-x3.png')} 
            style={[styles.icon, { tintColor: INTERACTIVE.COMMENT }]} 
          />
          <Text style={styles.actionText}>{formatNumber(post.replyCount || 0)}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={isSmallDevice ? styles.actionButtonSmallScreen : styles.actionButton} 
          activeOpacity={0.7}
        >
          <Image 
            source={require('../../../../assets/PostActions/Heart-PixelArtIconx3.png')} 
            style={[styles.icon, { tintColor: BRAND.SECONDARY }]} 
          />
          <Text style={styles.actionText}>{formatNumber(post.likeCount || 0)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginLeft: 4,
  },
  descriptionContainer: {
    marginBottom: 4,
    paddingRight: 10,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  descriptionText: {
    color: BRAND.SECONDARY,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  expandText: {
    color: BRAND.PRIMARY,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  profilePicture: {
    width: 45,
    height: 45,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: PROFILE.DEFAULT_RING,
  },
  profilePictureSmallScreen: {
    width: 42,
    height: 42,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: PROFILE.DEFAULT_RING,
  },
  authorTextContainer: {
    marginLeft: 8,
    flex: 1,
    marginRight: 20,
  },
  authorName: {
    color: BRAND.SECONDARY,
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 22,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorNameSmallScreen: {
    color: BRAND.SECONDARY,
    fontWeight: 'bold',
    fontSize: 15,
    fontFamily: 'Firma-Black',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 18,
    includeFontPadding: false,
    flexShrink: 1,
  },
  authorHandle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  authorHandleSmallScreen: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontFamily: 'Firma-SemiBold',
    textShadowColor: 'rgba(2, 2, 2, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionsContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginLeft: 5,
    marginBottom: -6,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionButton: {
    alignItems: 'center',
    marginVertical: 5,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 32.5,
  },
  actionButtonSmallScreen: {
    alignItems: 'center',
    marginVertical: 3,
    shadowColor: BRAND.PRIMARY,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 32.5,
  },
  iconContainer: {
    width: 30.5,
    height: 30.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: BRAND.SECONDARY,
    fontSize: 12.5,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
    minWidth: 45,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  icon: {
    width: 30,
    height: 30,
    alignSelf: 'center',
    resizeMode: 'contain',
  },
});

export default VideoPreviewOverlay; 