import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%'], []);

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
      
      // Optimistically update UI
      if (feedbackSent === type) {
        setFeedbackSent(null);
        feedbackStateMap.delete(postUri);
      } else {
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
  }, [postUri, feedbackSent, isSubmitting]);

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
        color: Colors.white
      }
    ];

    // Add Zen option (only when not in zen mode)
    if (!isClearViewMode) {
      options.push({
        id: 'zen',
        label: 'zen',
        icon: 'zen',
        onPress: async () => toggleClearViewMode(),
        color: Colors.white
      });
    }

    // Add Block/Mute option
    options.push({
      id: 'block',
      label: isCurrentUser ? 'mute' : (isBlocked ? 'unblock' : 'block'),
      icon: 'block',
      onPress: handleBlockToggle,
      color: Colors.white
    });

    // Add Report/Delete option
    options.push({
      id: 'report',
      label: isCurrentUser ? 'delete' : 'report',
      icon: 'report',
      onPress: async () => handleReportOrDelete(),
      color: isCurrentUser ? Colors.black : Colors.black,
      buttonColor: isCurrentUser ? Colors.red : Colors.red
    } as any);

    return options;
  };

  const menuOptions = getMenuOptions();

  // Calculate dynamic spacing based on screen width and number of options
  const calculateSpacing = () => {
    const optionWidth = 64; // Width of each option button
    const totalOptionsWidth = menuOptions.length * optionWidth;
    const availableWidth = SCREEN_WIDTH - 60; // Account for horizontal padding
    const remainingSpace = availableWidth - totalOptionsWidth;
    const spacing = Math.max(20, remainingSpace / (menuOptions.length + 1)); // Minimum 20px spacing
    return spacing;
  };

  const dynamicSpacing = calculateSpacing();

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
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        {/* Interest feedback buttons - only show for yourMix feed from thevids source and not current user's content */}
        {feedOption === 'yourMix' && canSendFeedback(sourceFeed) && !isCurrentUser && (
          <>
            <View style={styles.feedbackContainer}>
              <View style={styles.feedbackOptions}>
                <TouchableOpacity 
                  style={[
                    styles.feedbackButton,
                    feedbackSent === 'interested' && styles.feedbackButtonSelected
                  ]} 
                  onPress={() => handleInterestFeedback('interested')}
                  disabled={isSubmitting}
                >
                  <InterestedIcon size={24} color={feedbackSent === 'interested' ? Colors.black : Colors.white} />
                  <Text style={[
                    styles.feedbackButtonText,
                    feedbackSent === 'interested' && styles.feedbackButtonTextSelected
                  ]}>
                    interested
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.feedbackButton,
                    feedbackSent === 'not_interested' && styles.feedbackButtonSelected
                  ]} 
                  onPress={() => handleInterestFeedback('not_interested')}
                  disabled={isSubmitting}
                >
                  <NotInterestedIcon size={24} color={feedbackSent === 'not_interested' ? Colors.black : Colors.white} />
                  <Text style={[
                    styles.feedbackButtonText,
                    feedbackSent === 'not_interested' && styles.feedbackButtonTextSelected
                  ]}>
                    not interested
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Divider - only show when feedback buttons are visible */}
            <View style={styles.divider} />
          </>
        )}
        
        {/* Options */}
        <View style={[styles.optionsContainer, { gap: dynamicSpacing }]}>
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
                  <ShareIcon size={32} color={option.color} />
                )}
                {option.icon === 'eye' && (
                  <Icon name="eye" size={32} color={option.color} />
                )}
                {option.icon === 'zen' && (
                  <Icon name="zen" size={32} color={option.color} />
                )}
                {option.icon === 'block' && (
                  <BlockIcon size={32} color={option.color} />
                )}
                {option.icon === 'report' && (
                  <ReportIcon size={32} color={option.color} />
                )}
              </TouchableOpacity>
              <Text style={styles.optionText}>{option.label}</Text>
            </View>
          ))}
        </View>
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
    borderTopWidth: 0.5,
    borderTopColor: Colors.mediumGray,
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
  feedbackContainer: {
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
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray,
    width: '48%',
  },
  feedbackButtonSelected: {
    backgroundColor: Colors.white,
    borderColor: Colors.white,
  },
  feedbackButtonText: {
    color: Colors.white,
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
    justifyContent: 'center',
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
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.gray,
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
    borderWidth: 1,
    borderColor: Colors.gray,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  optionText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default ShareSheet;