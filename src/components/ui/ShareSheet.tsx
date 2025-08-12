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
} from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Icon, { ShareIcon, BlockIcon, ReportIcon, InterestedIcon, NotInterestedIcon } from './Icon';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';
import { useClearView } from '../../services/ClearViewContext';
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
  // Helper function to check if the source feed supports feedback
  const canSendFeedback = (feed: string | undefined): boolean => {
    return feed === 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/thevids';
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

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['70%'], []);

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
      const previousFeedback = feedbackStateMap.get(postUri);
      if (previousFeedback) {
        setFeedbackSent(previousFeedback);
      } else {
        setFeedbackSent(null);
      }
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
        // Currently there's no API to remove feedback, so we just clear it locally
        // console.log(`Cleared ${type} feedback for post: ${postUri}`);
      } else {
        await AtprotoService.sendVideoFeedback(postUri, type);
        // console.log(`Sent ${type} feedback for post: ${postUri}`);
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
        label: 'share',
        icon: 'share',
        onPress: handleShare,
        color: '#d140fc',
        buttonColor: Colors.darkBlue
      }
    ];

    // Add Zen option (only when not in zen mode)
    if (!isClearViewMode) {
      options.push({
        id: 'zen',
        label: 'zen',
        icon: 'zen',
        onPress: async () => toggleClearViewMode(),
        color: Colors.green,
        buttonColor: Colors.darkGreen
      });
    }

    // Add Report/Delete option
    options.push({
      id: 'report',
      label: isCurrentUser ? 'delete' : 'report',
      icon: 'report',
      onPress: async () => handleReportOrDelete(),
      color: Colors.red,
      buttonColor: Colors.darkRed
    } as any);

    return options;
  };

  const menuOptions = getMenuOptions();

  // Use fixed spacing instead of dynamic calculation
  const fixedSpacing = 16;

  // Backdrop component
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Don't render the sheet if in clear view mode
  if (isClearViewMode) {
    return null;
  }

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={{ display: 'none' }}
    >
      <BottomSheetView style={styles.content}>
        {/* Author name and close button */}
        {authorName && (
          <View style={styles.authorContainer}>
            <Text style={styles.authorName} numberOfLines={1}>
              video by {authorName}
            </Text>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Options */}
        <View style={[styles.optionsContainer, { gap: fixedSpacing }]}>
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
              </TouchableOpacity>
              <Text style={styles.optionText}>{option.label}</Text>
            </View>
          ))}
        </View>

        {/* Interest feedback buttons - only show for yourMix feed from thevids source and not current user's content */}
        {feedOption === 'yourMix' && canSendFeedback(sourceFeed) && !isCurrentUser && (
          <>
            <View style={styles.feedbackContainer}>
              <View style={styles.feedbackOptions}>
                                  <Animated.View style={[
                    styles.feedbackButton,
                    {
                      backgroundColor: interestedAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [Colors.darkGray, Colors.lightGray],
                      }),
                    }
                  ]}>
                  <TouchableOpacity 
                    style={styles.feedbackButtonTouchable}
                    onPress={() => handleInterestFeedback('interested')}
                    disabled={isSubmitting}
                  >
                    <InterestedIcon 
                      size={24} 
                      color={feedbackSent === 'interested' ? Colors.black : Colors.lightGray} 
                    />
                    <Animated.Text style={[
                      styles.feedbackButtonText,
                      {
                        color: interestedAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [Colors.lightGray, Colors.black],
                        }),
                      }
                    ]}>
                      interested
                    </Animated.Text>
                  </TouchableOpacity>
                </Animated.View>
                
                <Animated.View style={[
                  styles.feedbackButton,
                  {
                    backgroundColor: notInterestedAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [Colors.darkGray, Colors.lightGray],
                    }),
                  }
                ]}>
                  <TouchableOpacity 
                    style={styles.feedbackButtonTouchable}
                    onPress={() => handleInterestFeedback('not_interested')}
                    disabled={isSubmitting}
                  >
                    <NotInterestedIcon 
                      size={24} 
                      color={feedbackSent === 'not_interested' ? Colors.black : Colors.lightGray} 
                    />
                    <Animated.Text style={[
                      styles.feedbackButtonText,
                      {
                        color: notInterestedAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [Colors.lightGray, Colors.black],
                        }),
                      }
                    ]}>
                      not interested
                    </Animated.Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
          </>
        )}
        <View style={styles.cancelContainer}>
          <TouchableOpacity 
            style={[styles.cancelButton]} 
            onPress={onDismiss} 
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelButtonText}>cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
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
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 30,
  },
  authorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  authorName: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Firma-Bold',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: Colors.lightGray,
    fontSize: 24,
    fontWeight: 'bold',
  },
  feedbackContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  feedbackOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '48%',
  },
  feedbackButtonTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  feedbackButtonSelected: {
    backgroundColor: Colors.lightGray,
    borderColor: Colors.lightGray,
  },
  feedbackButtonText: {
    color: Colors.lightGray,
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  feedbackButtonTextSelected: {
    color: Colors.black,
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
    marginTop: 20,
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