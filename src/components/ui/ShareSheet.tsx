import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { Animated } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createQueryKeys } from '../../services/FeedService';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';
import { Colors } from './UI';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useGlobalShareSheet } from '../../hooks/useGlobalShareSheet';

// No props needed for global ShareSheet
interface ShareSheetProps {}

// Map to store feedback state by post URI
const feedbackStateMap = new Map<string, string>();



const ShareSheet: React.FC<ShareSheetProps> = () => {
  const { getCurrentData } = useGlobalShareSheet();
  const data = getCurrentData();
  
  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, feedOption, sourceFeed } = data || {};
  // Helper function to check if feedback can be sent for this video
  const canSendFeedback = (feed: string | undefined): boolean => {
    // Allow feedback for any video
    return true;
  };
  const queryClient = useQueryClient();
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);

  // Animated values for smooth transitions
  const interestedAnimation = useRef(new Animated.Value(0)).current;
  const notInterestedAnimation = useRef(new Animated.Value(0)).current;
  const interestedScale = interestedAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const notInterestedScale = notInterestedAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  // TrueSheet sizes
  const snapPoints = useMemo(() => ['auto'] as any, []);
  const insets = useSafeAreaInsets();

  // Check if the current user is the author
  useEffect(() => {
    const checkCurrentUser = async () => {
      try {
        const currentUserDid = ProfileCache.getCurrentUserDid();
        // If we don't have the currentUserDid cached, try to get it from the service
        if (!currentUserDid) {
          const currentUser = await AtprotoService.getCurrentUser();
          setIsCurrentUser(currentUser?.did === authorDid);
        } else {
          setIsCurrentUser(currentUserDid === authorDid);
        }
      } catch (error) {
        console.error('Error checking current user:', error);
      }
    };
    
    if (authorDid) {
      checkCurrentUser();
    }
  }, [authorDid]);

  const { data: blockStatus = false } = useQuery({
    queryKey: createQueryKeys.blocks.status(authorDid),
    queryFn: () => AtprotoService.isBlocked(authorDid),
    enabled: !!authorDid && !isCurrentUser,
    initialData: false
  });

  // Global dismiss function
  const dismissSheet = useCallback(() => {
    TrueSheet.dismiss('share-sheet');
  }, []);



  // Update isBlocked state when blockStatus changes
  useEffect(() => {
    setIsBlocked(blockStatus);
  }, [blockStatus]);

  // Load previous feedback state for this post if it exists
  useEffect(() => {
    if (postUri) {
      const loadFeedback = async () => {
        try {
          // First check the in-memory map
          const previousFeedback = feedbackStateMap.get(postUri);
          if (previousFeedback) {
            setFeedbackSent(previousFeedback);
            return;
          }
          
          // If not in memory, try to load from storage
          const storedFeedback = await AtprotoService.getVideoFeedback(postUri);
          if (storedFeedback) {
            setFeedbackSent(storedFeedback.type);
            feedbackStateMap.set(postUri, storedFeedback.type);
          } else {
            setFeedbackSent(null);
          }
        } catch (error) {
          console.error('Error loading feedback:', error);
          setFeedbackSent(null);
        }
      };
      
      loadFeedback();
    }
  }, [postUri]);



  // Block/unblock or mute chat handler
  const handleBlockToggle = useCallback(async () => {
    try {
      setIsSubmitting(true);
      
      // For current user, handle mute chat functionality instead of block
      if (isCurrentUser) {
        Alert.alert(
          'mute chats',
          'do you want to mute all comments for this post?',
          [
            {
              text: 'cancel',
              style: 'cancel'
            },
            {
              text: 'mute',
              onPress: async () => {
                try {
                  const success = await AtprotoService.mutePostComments(postUri);
                  if (success) {
                    Alert.alert('success', 'comments have been muted for this post.');
                  } else {
                    Alert.alert('error', 'failed to mute comments. please try again.');
                  }
                  dismissSheet();
                } catch (error) {
                  console.error('Error muting comments:', error);
                  Alert.alert('error', 'failed to mute comments. please try again.');
                }
              }
            }
          ]
        );
        return;
      }
      
      // Regular block/unblock flow for other users' content
      if (isBlocked) {
        await AtprotoService.unblockUser(authorDid);
        queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(authorDid) });
        setIsBlocked(false);
      } else {
        Alert.alert(
          'block user',
          'are you sure you want to block this user? they will not be able to see your posts or interact with you.',
          [
            {
              text: 'cancel',
              style: 'cancel'
            },
            {
              text: 'block',
              style: 'destructive',
              onPress: async () => {
                await AtprotoService.blockUser(authorDid);
                queryClient.invalidateQueries({ queryKey: createQueryKeys.blocks.status(authorDid) });
                setIsBlocked(true);
                dismissSheet();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error toggling block status:', error);
      Alert.alert('error', 'failed to update block status. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [authorDid, isBlocked, dismissSheet, queryClient, isCurrentUser, postUri]);

  // Handle interest feedback
  const handleInterestFeedback = useCallback(async (type: 'interested' | 'not_interested') => {
    if (isSubmitting) return;
    
    // Store previous state for rollback if needed
    const previousFeedback = feedbackSent;
    
    try {
      setIsSubmitting(true);
      
      // Animate the transition
      const targetAnimation = type === 'interested' ? interestedAnimation : notInterestedAnimation;
      const otherAnimation = type === 'interested' ? notInterestedAnimation : interestedAnimation;
      
      if (feedbackSent === type) {
        // Deselecting - animate to 0
        Animated.parallel([
          Animated.timing(targetAnimation, {
            toValue: 0,
            duration: 100,
            useNativeDriver: false,
          }),
          Animated.timing(otherAnimation, {
            toValue: 0,
            duration: 100,
            useNativeDriver: false,
          })
        ]).start();
        setFeedbackSent(null);
        feedbackStateMap.delete(postUri);
      } else {
        // Selecting - animate to 1
        Animated.parallel([
          Animated.timing(targetAnimation, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false,
          }),
          Animated.timing(otherAnimation, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          })
        ]).start();
        setFeedbackSent(type);
        feedbackStateMap.set(postUri, type);
      }

      // Make API call
      if (feedbackSent === type) {
        // Remove feedback
        await AtprotoService.removeVideoFeedback(postUri);
      } else {
        await AtprotoService.sendVideoFeedback(postUri, type);
      }
    } catch (error) {
      // Revert to previous state on error
      setFeedbackSent(previousFeedback);
      if (previousFeedback) {
        feedbackStateMap.set(postUri, previousFeedback);
      } else {
        feedbackStateMap.delete(postUri);
      }
      
      console.error('Error handling feedback:', error);
      Alert.alert('error', 'failed to save your feedback. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, feedbackSent, isSubmitting, interestedAnimation, notInterestedAnimation]);

  // Report or delete post handler
  const handleReportOrDelete = useCallback(() => {
    // For current user, show delete option
    if (isCurrentUser) {
      Alert.alert(
        'delete post',
        'are you sure you want to delete this post? this action cannot be undone.',
        [
          {
            text: 'cancel',
            style: 'cancel'
          },
          {
            text: 'delete',
            style: 'destructive',
            onPress: async () => {
              setIsSubmitting(true);
              try {
                const success = await AtprotoService.deletePost(postUri);
                if (success) {
                  Alert.alert('success', 'your post has been deleted.');
                  // Invalidate any related queries to refresh feeds
                  queryClient.invalidateQueries({ queryKey: createQueryKeys.feed.all });
                  dismissSheet();
                } else {
                  Alert.alert('error', 'failed to delete post. please try again.');
                }
              } catch (error) {
                console.error('Error deleting post:', error);
                Alert.alert('error', 'failed to delete post. please try again.');
              } finally {
                setIsSubmitting(false);
              }
            }
          }
        ]
      );
    } else {
      // For other users' content, show report option
      Alert.alert(
        'report content',
        'please select a reason for reporting this content:',
        [
          {
            text: 'cancel',
            style: 'cancel'
          },
          {
            text: 'spam',
            onPress: () => reportContent('spam')
          },
          {
            text: 'harmful content',
            onPress: () => reportContent('violation')
          },
          {
            text: 'misleading',
            onPress: () => reportContent('misleading')
          },
          {
            text: 'sexual content',
            onPress: () => reportContent('sexual')
          },
          {
            text: 'rude/offensive',
            onPress: () => reportContent('rude')
          },
          {
            text: 'other',
            onPress: () => reportContent('other')
          }
        ]
      );
    }
  }, [dismissSheet, isCurrentUser, postUri, queryClient]);

  // Helper function to report content
  const reportContent = useCallback(async (
    reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other'
  ) => {
    setIsSubmitting(true);
    try {
      const success = await AtprotoService.reportContent(postUri, reasonType);
      if (success) {
        Alert.alert('thank you', 'this content has been reported for review.');
        dismissSheet();
      } else {
        Alert.alert('error', 'failed to submit report. please try again.');
      }
    } catch (error) {
      console.error('Error reporting content:', error);
      Alert.alert('error', 'failed to submit report. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, dismissSheet]);

  // Share link handler
  const handleShare = useCallback(async () => {
    try {
      // Convert AT URI to a web URL
      let shareUrl = postUri;
      
      if (postUri.startsWith('at://')) {
        // Extract the necessary parts from the AT URI
        const parts = postUri.replace('at://', '').split('/');
        if (parts.length >= 3) {
          const did = parts[0];
          const collection = parts[1];
          const rkey = parts[2];
          
          // Format as a bsky.app URL
          shareUrl = `https://bsky.app/profile/${did}/post/${rkey}`;
        }
      }
      
      await Share.share({
        message: Platform.OS === 'ios' ? '' : shareUrl,
        url: Platform.OS === 'ios' ? shareUrl : '',
        title: 'check out this post on bluesky',
      });
      
      // Close the sheet after successful share
      dismissSheet();
    } catch (error) {
      console.error('Error sharing post:', error);
    }
  }, [postUri, dismissSheet]);

  // Get menu options based on current state
  const getMenuOptions = () => {
    const options = [
      {
        id: 'share',
        label: 'Share',
        icon: 'share',
        onPress: handleShare,
        color: '#d140fc',
        buttonColor: Colors.darkBlue
      }
    ];

    

    // Add Interest feedback options (for any video, not current user's content)
    if (canSendFeedback(sourceFeed) && !isCurrentUser) {
      options.push({
        id: 'interested',
        label: 'Like',
        icon: 'interested',
        onPress: () => handleInterestFeedback('interested'),
        color: Colors.green,
        buttonColor: Colors.darkGreen
      } as any);
      
      options.push({
        id: 'not_interested',
        label: 'Dislike',
        icon: 'not_interested',
        onPress: () => handleInterestFeedback('not_interested'),
        color: feedbackSent === 'not_interested' ? Colors.dislikeBackground : Colors.dislikeIconBlue,
        buttonColor: feedbackSent === 'not_interested' ? Colors.dislikeIconBlue : Colors.dislikeBackground
      } as any);
    }


    // Add Report/Delete option
    options.push({
      id: 'report',
      label: isCurrentUser ? 'Delete' : 'Report',
      icon: 'report',
      onPress: async () => handleReportOrDelete(),
      color: Colors.red,
      buttonColor: Colors.darkRed
    } as any);

    return options;
  };

  const menuOptions = getMenuOptions();

  // Use fixed spacing instead of dynamic calculation
  const fixedSpacing = 12;

  // Don't render content if no data
  if (!data) {
    return (
      <TrueSheet
        name="share-sheet"
        sizes={snapPoints}
        backgroundColor={Platform.OS === 'ios' && isLiquidGlassAvailable() ? 'rgba(0,0,0,0.6)' : Colors.black}
        onDismiss={dismissSheet}
        grabber={false}
      >
        <View style={styles.content}>
          {/* Empty content when no data or clear view mode */}
        </View>
      </TrueSheet>
    );
  }



  return (
    <TrueSheet
      name="share-sheet"
      sizes={snapPoints}
      backgroundColor={Platform.OS === 'ios' && isLiquidGlassAvailable() ? 'rgba(0,0,0,0.6)' : Colors.black}
      onDismiss={dismissSheet}
      grabber={false}
      FooterComponent={
        <View style={[styles.cancelContainer, { paddingBottom: insets.bottom, backgroundColor: Platform.OS === 'ios' && isLiquidGlassAvailable() ? 'transparent' : Colors.black }]}> 
          <TouchableOpacity 
            style={[styles.cancelButton, Platform.OS === 'ios' && isLiquidGlassAvailable() && styles.cancelButtonGlass]} 
            onPress={dismissSheet} 
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            {Platform.OS === 'ios' && isLiquidGlassAvailable() && (
              <GlassView
                style={StyleSheet.absoluteFill}
                glassEffectStyle="clear"
                tintColor="rgba(255,255,255,0.05)"
                isInteractive
              />
            )}
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.content}>
        {/* Author name and close button */}
        {authorName && (
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              post by {authorName}
            </Text>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={dismissSheet}
              activeOpacity={0.7}
            >
              <Icon name="close" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}
        
                {/* Options */}
        <View style={styles.contentContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.optionsContainer, { gap: fixedSpacing, paddingLeft: 20, paddingRight: 20 }]}
          >
            {menuOptions.map((option) => (
              <View key={option.id} style={styles.optionWrapper}>
                <TouchableOpacity 
                  style={[
                    styles.option,
                    isLiquidGlassAvailable()
                      ? { backgroundColor: 'transparent', borderColor: 'transparent' }
                      : { backgroundColor: option.buttonColor, borderColor: hexToRGBA(option.color, 0.28) }
                  ]}
                  onPress={option.onPress}
                  activeOpacity={0.7}
                  disabled={isSubmitting}
                >
                  {isLiquidGlassAvailable() && (
                    <GlassView
                      style={styles.optionGlass}
                      glassEffectStyle="clear"
                      tintColor={hexToRGBA(option.buttonColor, 0.9)}
                      isInteractive
                    />
                  )}
                  {(() => {
                    const scale = option.id === 'interested'
                      ? interestedScale
                      : option.id === 'not_interested'
                        ? notInterestedScale
                        : 1;
                    return (
                      <Animated.View style={typeof scale === 'number' ? undefined : { transform: [{ scale }] }}>
                        <Icon name={option.icon} size={36} color={option.color} />
                      </Animated.View>
                    );
                  })()}
                </TouchableOpacity>
                <Text style={styles.optionText}>{option.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </TrueSheet>
  );
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: Colors.black,
    // Square top corners - no border radius
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: Colors.gray,
    width: 40,
    height: 5,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 15,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 20,
    // Extend options row to sheet edges while preserving overall content padding
    marginLeft: -12,
    marginRight: -12,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.gray,
    marginVertical: 15,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginTop: 0,
    paddingHorizontal: 0,
  },
  optionWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent'
  },
  optionGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.FULL,
  },
  reportOption: {
    backgroundColor: Colors.red,
  },
  clearViewOptionActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.white,
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  cancelButton: {
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 44,
    borderWidth: 0,
    borderColor: 'transparent'
  },
  cancelButtonGlass: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
  },
  cancelButtonText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  optionText: {
    color: Colors.lightGray,
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
});

export default ShareSheet;