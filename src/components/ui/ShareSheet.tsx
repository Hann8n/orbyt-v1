import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  safeDismiss,
  safePresent,
  useMeasuredFooterHeight,
  FOOTER_BOTTOM_PADDING_MIN,
} from '../../utils/components/truesheet';
import KeyboardAwareFooter from '../../utils/components/truesheet/KeyboardAwareFooter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import CloseButton from './CloseButton';
import CancelButton from './CancelButton';
import AtprotoService from '../../services/api/AtprotoService';
import { Colors } from './UI';
import { useGlobalShareSheet } from '../../hooks/useGlobalModals';
import { formatHandle } from '../../utils/formatting/handles';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useUserStore } from '../../stores/userStore';

const ShareSheet: React.FC = () => {
  const { getCurrentData, dismissShareSheet } = useGlobalShareSheet();
  const data = getCurrentData();

  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, authorHandle } = data || {};
  const queryClient = useQueryClient();
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);
  const sheetRef = useRef<TrueSheet>(null);

  // Bookmark store
  const isBookmarked = useBookmarkStore(state => (postUri ? state.isBookmarked(postUri) : false));
  const addBookmark = useBookmarkStore(state => state.addBookmark);
  const removeBookmark = useBookmarkStore(state => state.removeBookmark);

  // TrueSheet detents - v3 uses 'auto' or fractional numbers (0-1)
  const sheetDetents: ('auto' | number)[] = useMemo(() => ['auto'], []);
  const insets = useSafeAreaInsets();
  const footerBottomPadding = Math.max(insets.bottom, FOOTER_BOTTOM_PADDING_MIN);
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(8 + 44);

  // Present sheet when data arrives
  useEffect(() => {
    if (data) {
      safePresent('share-sheet');
    }
  }, [data]);

  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);

  // Check if the current user is the author - use store instead of API call
  useEffect(() => {
    if (authorDid) {
      const did = currentUser?.did || '';
      setIsCurrentUser(did === authorDid);
    }
  }, [authorDid, currentUser?.did]);

  // Handle dismiss from TrueSheet - fires when sheet is dismissed by any means
  const handleDismiss = useCallback(() => {
    // Clear the data state - skip dismiss since we're already in onDismiss callback
    dismissShareSheet(true);
    // Reset local UI state
  }, [dismissShareSheet]);

  // Programmatic dismiss function for buttons
  const dismissSheet = useCallback(() => {
    // Dismiss the global sheet name if mounted; ignore if it's not present.
    safeDismiss('share-sheet');
    // onDismiss (handleDismiss) will handle the overlay clearing
  }, []);

  // Bookmark handler - instant optimistic update
  const handleBookmark = useCallback(() => {
    if (!postUri) return;

    const newIsBookmarked = !isBookmarked;

    // Instant optimistic update - no waiting
    if (newIsBookmarked) {
      // Use postCid if available, otherwise use empty string (will be fetched in background)
      addBookmark(postUri, { uri: postUri, cid: postCid || '' });
    } else {
      removeBookmark(postUri);
    }

    // Perform API call in background without blocking
    (async () => {
      try {
        // Get CID if missing (only for API call)
        let cid = postCid;
        if (!cid) {
          try {
            const post = await AtprotoService.getPost(postUri);
            cid = post?.cid || '';
          } catch {
            cid = '';
          }
        }

        if (!cid) {
          // If we still don't have CID, try to revert
          if (newIsBookmarked) {
            removeBookmark(postUri);
          } else {
            addBookmark(postUri, { uri: postUri, cid: '' });
          }
          return;
        }

        if (newIsBookmarked) {
          await AtprotoService.createBookmark(postUri, cid);
        } else {
          await AtprotoService.deleteBookmark(postUri);
        }
      } catch (_error) {
        // Revert optimistic update on error
        if (newIsBookmarked) {
          removeBookmark(postUri);
        } else {
          addBookmark(postUri, { uri: postUri, cid: postCid || '' });
        }
      }
    })();
  }, [postUri, postCid, isBookmarked, addBookmark, removeBookmark]);

  // Helper function to report content
  const reportContent = useCallback(
    async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
      if (!postUri) return;

      // Optimistic update - mark as reported immediately and dismiss
      const { useReportedPostsStore } = await import('../../stores/reportedPostsStore');
      const store = useReportedPostsStore.getState();
      store.reportPost(postUri);
      dismissSheet();

      // Show success message immediately
      Alert.alert('thank you', 'this content has been reported for review.');

      // Perform report in background
      try {
        const success = await AtprotoService.reportContent(postUri, reasonType);
        if (!success) {
          // Revert optimistic update on error - remove from reported set
          const newSet = new Set(store.reportedPostUris);
          newSet.delete(postUri);
          store.reportedPostUris = newSet;
          Alert.alert('error', 'failed to submit report. please try again.');
        }
      } catch (_error) {
        // Revert optimistic update on error - remove from reported set
        const newSet = new Set(store.reportedPostUris);
        newSet.delete(postUri);
        store.reportedPostUris = newSet;
        Alert.alert('error', 'failed to submit report. please try again.');
      }
    },
    [postUri, dismissSheet]
  );

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
            style: 'cancel',
          },
          {
            text: 'delete',
            style: 'destructive',
            onPress: async () => {
              if (!postUri) return;

              // Optimistic update - dismiss sheet immediately
              dismissSheet();

              // Invalidate queries immediately for responsive UI
              queryClient.invalidateQueries({
                queryKey: queryKeys.feed.all,
                refetchType: 'active',
              });

              // Perform deletion in background
              try {
                const success = await AtprotoService.deletePost(postUri);
                if (!success) {
                  // Re-invalidate on error to ensure UI is correct
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.feed.all,
                    refetchType: 'active',
                  });
                  Alert.alert('error', 'failed to delete post. please try again.');
                }
              } catch (_error) {
                // Re-invalidate on error to ensure UI is correct
                queryClient.invalidateQueries({
                  queryKey: queryKeys.feed.all,
                  refetchType: 'active',
                });
                Alert.alert('error', 'failed to delete post. please try again.');
              }
            },
          },
        ]
      );
    } else {
      // For other users' content, show report option
      Alert.alert('report content', 'please select a reason for reporting this content:', [
        {
          text: 'cancel',
          style: 'cancel',
        },
        {
          text: 'spam',
          onPress: () => reportContent('spam'),
        },
        {
          text: 'harmful content',
          onPress: () => reportContent('violation'),
        },
        {
          text: 'misleading',
          onPress: () => reportContent('misleading'),
        },
        {
          text: 'sexual content',
          onPress: () => reportContent('sexual'),
        },
        {
          text: 'rude/offensive',
          onPress: () => reportContent('rude'),
        },
        {
          text: 'other',
          onPress: () => reportContent('other'),
        },
      ]);
    }
  }, [dismissSheet, isCurrentUser, postUri, queryClient, reportContent]);

  // Share link handler
  const handleShare = useCallback(async () => {
    if (!postUri) return;
    try {
      // Extract rkey from AT URI: at://did:plc:abc123/app.bsky.feed.post/rkey
      const parts = postUri.replace('at://', '').split('/');
      const rkey = parts.length >= 3 ? parts[2] : '';
      if (!rkey) return;

      // Use DID if handle ends with .invalid, otherwise use handle
      const identifier =
        authorHandle && !authorHandle.endsWith('.invalid') ? authorHandle : authorDid;
      if (!identifier) return;

      const shareUrl = `https://getorbyt.com/@${identifier}/${rkey}`;

      await Share.share({
        message: Platform.OS === 'ios' ? '' : shareUrl,
        url: Platform.OS === 'ios' ? shareUrl : '',
        title: 'check out this post on bluesky',
      });
    } catch (_error: unknown) {
      // ignore
    }
  }, [postUri, authorHandle, authorDid]);

  // Get menu options based on current state (vibrant accent colors for pop)
  const getMenuOptions = () => {
    const options = [
      {
        id: 'share',
        label: 'Share',
        icon: 'share',
        onPress: handleShare,
        color: Colors.purple[300],
        buttonColor: Colors.purple[950],
      },
      {
        id: 'bookmark',
        label: isBookmarked ? 'Saved' : 'Save',
        icon: 'bookmark-fill',
        onPress: handleBookmark,
        color: Colors.amber[300],
        buttonColor: Colors.amber[950],
      },
      {
        id: 'report',
        label: isCurrentUser ? 'Delete' : 'Report',
        icon: isCurrentUser ? 'delete-2-fill' : 'report',
        onPress: async () => handleReportOrDelete(),
        color: Colors.coral[400],
        buttonColor: Colors.coral[950],
      },
    ];

    return options;
  };

  const menuOptions = getMenuOptions();

  // Use fixed spacing instead of dynamic calculation
  const fixedSpacing = 12;

  // Header component for TrueSheet header prop
  const headerComponent =
    authorName || authorHandle ? (
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          post by {authorHandle ? formatHandle(authorHandle) : authorName}
        </Text>
        <CloseButton onPress={dismissSheet} />
      </View>
    ) : undefined;

  // Don't render content if no data
  if (!data) {
    return (
      <TrueSheet
        ref={sheetRef}
        name="share-sheet"
        detents={sheetDetents}
        backgroundColor={Colors.black}
        onDidDismiss={handleDismiss}
        grabber={false}
      >
        <View style={styles.content}>{/* Empty content when no data or clear view mode */}</View>
      </TrueSheet>
    );
  }

  return (
    <TrueSheet
      ref={sheetRef}
      name="share-sheet"
      detents={sheetDetents}
      backgroundColor={Colors.black}
      onDidDismiss={handleDismiss}
      grabber={false}
      header={headerComponent}
      footer={wrapFooter(
        <View style={{ backgroundColor: Colors.black, paddingBottom: footerBottomPadding }}>
          <KeyboardAwareFooter
            hideOnKeyboard={true}
            bottomPadding={0}
            style={{ backgroundColor: Colors.black }}
          >
            <View style={[styles.cancelContainer, { backgroundColor: Colors.black }]}>
              <CancelButton onPress={dismissSheet} />
            </View>
          </KeyboardAwareFooter>
        </View>
      )}
    >
      <View style={styles.content}>
        <View style={[styles.contentContainer, { paddingBottom: contentBottomPadding + 20 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            alwaysBounceHorizontal={true}
            alwaysBounceVertical={false}
            bounces={true}
            contentContainerStyle={[
              styles.optionsContainer,
              { gap: fixedSpacing, paddingLeft: 20 },
            ]}
          >
            {menuOptions.map(option => (
              <View key={option.id} style={styles.optionWrapper}>
                <Pressable onPress={option.onPress}>
                  {({ pressed }) => {
                    const isSwapped = (option.id === 'bookmark' && isBookmarked) || pressed;
                    const iconColor = isSwapped ? option.buttonColor : option.color;
                    const backgroundColor = isSwapped ? option.color : option.buttonColor;

                    return (
                      <View
                        style={[
                          styles.option,
                          {
                            backgroundColor,
                            shadowColor: option.color,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.45,
                            shadowRadius: 10,
                            elevation: 8,
                          },
                        ]}
                      >
                        <Icon name={option.icon} size={45} color={iconColor} />
                      </View>
                    );
                  }}
                </Pressable>
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
  content: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
    flex: 1,
  },
  contentContainer: {
    // Extend options row to sheet edges while preserving overall content padding
    marginLeft: -12,
    marginRight: -12,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginTop: 0,
    paddingHorizontal: 0,
    flexWrap: 'nowrap',
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
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
  },
  cancelContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  optionText: {
    color: Colors.neutral[200],
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
  },
});

export default ShareSheet;
