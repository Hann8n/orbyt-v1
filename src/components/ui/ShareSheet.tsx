import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import Icon, { ShareIcon, BlockIcon, ReportIcon, InterestedIcon, NotInterestedIcon } from './Icon';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';
import { useClearView } from '../../stores/uiStore';
import { Colors } from './UI';

interface ShareSheetProps {
  visible: boolean;
  onDismiss: () => void;
  postUri: string;
  postCid?: string;
  authorDid: string;
  authorName?: string; // Add author name prop
  feedOption?: 'yourMix' | 'following' | 'discover';
  sourceFeed?: string; // Add sourceFeed prop to determine if feedback is available
}

// Map to store feedback state by post URI
const feedbackStateMap = new Map<string, string>();



const ShareSheet: React.FC<ShareSheetProps> = ({ 
  visible, 
  onDismiss, 
  postUri, 
  postCid,
  authorDid,
  authorName,
  feedOption,
  sourceFeed
}) => {
  // Helper function to check if feedback can be sent for this video
  const canSendFeedback = (feed: string | undefined): boolean => {
    // Allow feedback for any video
    return true;
  };
  const queryClient = useQueryClient();
  const { isClearViewMode, toggleClearViewMode } = useClearView();
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);

  // Animated values for smooth transitions
  const interestedAnimation = useRef(new Animated.Value(0)).current;
  const notInterestedAnimation = useRef(new Animated.Value(0)).current;

  // TrueSheet ref and sizes
  const bottomSheetRef = useRef<TrueSheet>(null);
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
    
    if (visible && authorDid) {
      checkCurrentUser();
    }
  }, [visible, authorDid]);

  const { data: blockStatus = false } = useQuery({
    queryKey: createQueryKeys.blocks.status(authorDid),
    queryFn: () => AtprotoService.isBlocked(authorDid),
    enabled: visible && !!authorDid && !isCurrentUser,
    initialData: false
  });



  // Update isBlocked state when blockStatus changes
  useEffect(() => {
    setIsBlocked(blockStatus);
  }, [blockStatus]);

  // Load previous feedback state for this post if it exists
  useEffect(() => {
    if (visible && postUri) {
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
  }, [visible, postUri]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

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
                  onDismiss();
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
                onDismiss();
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
  }, [authorDid, isBlocked, onDismiss, queryClient, isCurrentUser, postUri]);

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
        console.log(`Removed ${type} feedback for post: ${postUri}`);
      } else {
        await AtprotoService.sendVideoFeedback(postUri, type);
        console.log(`Sent ${type} feedback for post: ${postUri} to vids feed`);
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
                  onDismiss();
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
  }, [onDismiss, isCurrentUser, postUri, queryClient]);

  // Helper function to report content
  const reportContent = useCallback(async (
    reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other'
  ) => {
    setIsSubmitting(true);
    try {
      const success = await AtprotoService.reportContent(postUri, reasonType);
      if (success) {
        Alert.alert('thank you', 'this content has been reported for review.');
        onDismiss();
      } else {
        Alert.alert('error', 'failed to submit report. please try again.');
      }
    } catch (error) {
      console.error('Error reporting content:', error);
      Alert.alert('error', 'failed to submit report. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, onDismiss]);

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
      onDismiss();
    } catch (error) {
      console.error('Error sharing post:', error);
    }
  }, [postUri, onDismiss]);

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
        color: feedbackSent === 'interested' ? Colors.interestedDark : Colors.darkYellow,
        buttonColor: feedbackSent === 'interested' ? Colors.darkYellow : Colors.interestedDark
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

    // Add Zen option (only when not in zen mode) - placed after Dislike
    if (!isClearViewMode) {
      options.push({
        id: 'zen',
        label: 'Zen',
        icon: 'zen',
        onPress: async () => toggleClearViewMode(),
        color: Colors.green,
        buttonColor: Colors.darkGreen
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

  // Don't render the sheet if in clear view mode
  if (isClearViewMode) {
    return null;
  }

  // Handle TrueSheet visibility
  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  return (
    <TrueSheet
      ref={bottomSheetRef}
      sizes={snapPoints}
      backgroundColor={Colors.black}
      onDismiss={onDismiss}
      cornerRadius={25}
      grabber={false}
      FooterComponent={
        <View style={[styles.cancelContainer, { paddingBottom: insets.bottom }]}>
          <TouchableOpacity 
            style={styles.cancelButton} 
            onPress={onDismiss} 
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
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
              onPress={onDismiss}
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
            contentContainerStyle={[styles.optionsContainer, { gap: fixedSpacing, paddingHorizontal: 15 }]}
          >
            {menuOptions.map((option) => (
              <View key={option.id} style={styles.optionWrapper}>
                <TouchableOpacity 
                  style={[
                    styles.option,
                    (option as any).buttonColor ? { backgroundColor: (option as any).buttonColor } : null
                  ]} 
                  onPress={option.onPress}
                  activeOpacity={0.7}
                  disabled={isSubmitting}
                >
                  {option.icon === 'share' && (
                    <ShareIcon size={40} color={option.color} />
                  )}
                  {option.icon === 'eye' && (
                    <Icon name="eye" size={40} color={option.color} />
                  )}
                  {option.icon === 'zen' && (
                    <Icon name="zen" size={40} color={option.color} />
                  )}
                  {option.icon === 'block' && (
                    <BlockIcon size={40} color={option.color} />
                  )}
                  {option.icon === 'report' && (
                    <ReportIcon size={40} color={option.color} />
                  )}
                  {option.icon === 'interested' && (
                    <InterestedIcon size={40} color={option.color} />
                  )}
                  {option.icon === 'not_interested' && (
                    <NotInterestedIcon size={40} color={option.color} />
                  )}
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
    paddingHorizontal: 4,
    paddingTop: 4,
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
    borderRadius: 20,
    backgroundColor: Colors.darkGray,
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
    backgroundColor: Colors.darkGray,
    borderRadius: 50,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
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