import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import Icon from './Icon';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';

interface ShareSheetProps {
  visible: boolean;
  onDismiss: () => void;
  postUri: string;
  postCid?: string;
  authorDid: string;
  feedOption?: 'yourMix' | 'following' | 'discover';
}

// Map to store feedback state by post URI
const feedbackStateMap = new Map<string, string>();

const ShareSheet: React.FC<ShareSheetProps> = ({ 
  visible, 
  onDismiss, 
  postUri, 
  postCid,
  authorDid,
  feedOption
}) => {
  const queryClient = useQueryClient();
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
    queryKey: queryKeys.blocks.status(authorDid),
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
          'Mute Chats',
          'Do you want to mute all comments for this post?',
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Mute',
              onPress: async () => {
                try {
                  const success = await AtprotoService.mutePostComments(postUri);
                  if (success) {
                    Alert.alert('Success', 'Comments have been muted for this post.');
                  } else {
                    Alert.alert('Error', 'Failed to mute comments. Please try again.');
                  }
                  onDismiss();
                } catch (error) {
                  console.error('Error muting comments:', error);
                  Alert.alert('Error', 'Failed to mute comments. Please try again.');
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
        queryClient.invalidateQueries({ queryKey: queryKeys.blocks.status(authorDid) });
        setIsBlocked(false);
      } else {
        Alert.alert(
          'Block User',
          'Are you sure you want to block this user? They will not be able to see your posts or interact with you.',
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                await AtprotoService.blockUser(authorDid);
                queryClient.invalidateQueries({ queryKey: queryKeys.blocks.status(authorDid) });
                setIsBlocked(true);
                onDismiss();
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error toggling block status:', error);
      Alert.alert('Error', 'Failed to update block status. Please try again.');
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
        console.log(`Cleared ${type} feedback for post: ${postUri}`);
      } else {
        await AtprotoService.sendVideoFeedback(postUri, type);
        console.log(`Sent ${type} feedback for post: ${postUri}`);
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
      Alert.alert('Error', 'Failed to save your feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, feedbackSent, isSubmitting]);

  // Report or delete post handler
  const handleReportOrDelete = useCallback(() => {
    // For current user, show delete option
    if (isCurrentUser) {
      Alert.alert(
        'Delete Post',
        'Are you sure you want to delete this post? This action cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setIsSubmitting(true);
              try {
                const success = await AtprotoService.deletePost(postUri);
                if (success) {
                  Alert.alert('Success', 'Your post has been deleted.');
                  // Invalidate any related queries to refresh feeds
                  queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
                  onDismiss();
                } else {
                  Alert.alert('Error', 'Failed to delete post. Please try again.');
                }
              } catch (error) {
                console.error('Error deleting post:', error);
                Alert.alert('Error', 'Failed to delete post. Please try again.');
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
        'Report Content',
        'Please select a reason for reporting this content:',
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Spam',
            onPress: () => reportContent('spam')
          },
          {
            text: 'Harmful Content',
            onPress: () => reportContent('violation')
          },
          {
            text: 'Misleading',
            onPress: () => reportContent('misleading')
          },
          {
            text: 'Sexual Content',
            onPress: () => reportContent('sexual')
          },
          {
            text: 'Rude/Offensive',
            onPress: () => reportContent('rude')
          },
          {
            text: 'Other',
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
        Alert.alert('Thank you', 'This content has been reported for review.');
        onDismiss();
      } else {
        Alert.alert('Error', 'Failed to submit report. Please try again.');
      }
    } catch (error) {
      console.error('Error reporting content:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
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
        title: 'Check out this post on Bluesky',
      });
      
      // Close the sheet after successful share
      onDismiss();
    } catch (error) {
      console.error('Error sharing post:', error);
    }
  }, [postUri, onDismiss]);

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
        {/* Interest feedback buttons - only show for yourMix feed and not current user's content */}
        {feedOption === 'yourMix' && !isCurrentUser && (
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
                  <Icon 
                    name={feedbackSent === 'interested' ? 'mood-happy' : 'mood-happy'} 
                    size={24} 
                    color={feedbackSent === 'interested' ? '#000' : '#fff'} 
                  />
                  <Text style={[
                    styles.feedbackButtonText,
                    feedbackSent === 'interested' && styles.feedbackButtonTextSelected
                  ]}>
                    Interested
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
                  <Icon 
                    name={feedbackSent === 'not_interested' ? 'mood-sad' : 'mood-sad'} 
                    size={24} 
                    color={feedbackSent === 'not_interested' ? '#000' : '#fff'} 
                  />
                  <Text style={[
                    styles.feedbackButtonText,
                    feedbackSent === 'not_interested' && styles.feedbackButtonTextSelected
                  ]}>
                    Not Interested
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Divider - only show when feedback buttons are visible */}
            <View style={styles.divider} />
          </>
        )}
        
        {/* Options */}
        <View style={styles.optionsContainer}>
          <View style={styles.optionWrapper}>
            <TouchableOpacity 
              style={[styles.option]} 
              onPress={handleShare}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <Icon name="link" size={32} color="white" />
            </TouchableOpacity>
            <Text style={styles.optionText}>Share</Text>
          </View>

          <View style={styles.optionWrapper}>
            <TouchableOpacity 
              style={[styles.option]} 
              onPress={handleBlockToggle}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              {isCurrentUser ? (
                <Icon name="message-minus" size={32} color="white" />
              ) : (
                <Icon name="user-x" size={32} color="white" />
              )}
            </TouchableOpacity>
            <Text style={styles.optionText}>
              {isCurrentUser ? 'Mute' : (isBlocked ? 'Unblock' : 'Block')}
            </Text>
          </View>

          <View style={styles.optionWrapper}>
            <TouchableOpacity 
              style={[styles.option, styles.reportOption]} 
              onPress={handleReportOrDelete}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              {isCurrentUser ? (
                <Icon name="trash" size={32} color="#000000" />
              ) : (
                <Icon name="warning-box" size={37} color="#000000" />
              )}
            </TouchableOpacity>
            <Text style={styles.optionText}>
              {isCurrentUser ? 'Delete' : 'Report'}
            </Text>
          </View>
        </View>
        <View style={styles.cancelContainer}>
          <TouchableOpacity 
            style={[styles.cancelButton]} 
            onPress={onDismiss} 
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: '#000',
    borderTopWidth: 0.5,
    borderTopColor: '#333',
    // Square top corners - no border radius
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleIndicator: {
    backgroundColor: '#666',
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
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#333',
    width: '48%',
  },
  feedbackButtonSelected: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  feedbackButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Firma-Medium',
  },
  feedbackButtonTextSelected: {
    color: '#000',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 15,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 60,
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
  },
  reportOption: {
    backgroundColor: '#FE4359',
  },
  cancelContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
  optionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
  },
});

export default ShareSheet;