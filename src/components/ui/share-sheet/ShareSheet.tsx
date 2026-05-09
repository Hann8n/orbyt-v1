import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '../../../utils/constants';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/query/queryKeys';
import { View, Text, StyleSheet, Share, Platform, Alert, ScrollView } from 'react-native';
import { NativePressable } from '../NativePressable';
import { SquircleView } from '../Squircle';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  FOOTER_TOP_PADDING_DEFAULT,
  SheetActionFooter,
  useMeasuredFooterHeight,
  getFooterBottomPadding,
  SHEET_SPACING,
  SHEET_STYLES,
} from '../../../utils/components/truesheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../Icon';
import CloseButton from '../CloseButton';
import CancelButton from '../CancelButton';
import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { BookmarkService } from '../../../services/api/bookmark/BookmarkService';
import { ModerationService } from '../../../services/moderation/ModerationService';
import { Colors } from '../UI';
import { useGlobalShareSheet } from '../../../hooks/useGlobalModals';
import { formatHandle } from '../../../utils/formatting/handles';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import { useUserStore } from '../../../stores/userStore';
import SendToPicker from './SendToPicker';
import { FontFamily, Typography } from '../../../utils/components/typography';

const ShareSheet: React.FC = () => {
  const { t } = useTranslation();
  const { getCurrentData, dismissShareSheet } = useGlobalShareSheet();
  const data = getCurrentData();

  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, authorHandle } = data || {};
  const queryClient = useQueryClient();
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);
  const [showConversationPicker, setShowConversationPicker] = useState<boolean>(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const [isSheetPresented, setIsSheetPresented] = useState(false);
  // Bookmark store
  const isBookmarked = useBookmarkStore(state => (postUri ? state.isBookmarked(postUri) : false));
  const addBookmark = useBookmarkStore(state => state.addBookmark);
  const removeBookmark = useBookmarkStore(state => state.removeBookmark);

  const insets = useSafeAreaInsets();
  const footerBottomPadding = getFooterBottomPadding(insets.bottom);
  const footerTop = FOOTER_TOP_PADDING_DEFAULT;
  const footerFallbackHeight = footerTop + 44 + footerBottomPadding;
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(footerFallbackHeight);

  // Present/dismiss sheet based on data presence (TrueSheet v3+)
  useEffect(() => {
    if (data) {
      if (!isSheetPresented) {
        TrueSheet.present('share-sheet').catch(() => {});
      }
    } else if (isSheetPresented) {
      TrueSheet.dismiss('share-sheet').catch(() => {});
    }
  }, [data, isSheetPresented]);

  // Get current user from store instead of API call
  const currentUser = useUserStore(state => state.currentUser);
  // Check if the current user is the author - use store instead of API call
  useEffect(() => {
    if (authorDid) {
      const did = currentUser?.did || '';
      setCurrentUserDid(did);
      setIsCurrentUser(did === authorDid);
    }
  }, [authorDid, currentUser?.did]);

  // Handle dismiss from TrueSheet - fires when sheet is dismissed by any means
  const handleDismiss = useCallback(() => {
    setIsSheetPresented(false);
    dismissShareSheet(true);
    setShowConversationPicker(false);
  }, [dismissShareSheet, setIsSheetPresented, setShowConversationPicker]);

  // Programmatic dismiss function for buttons
  const dismissSheet = useCallback(() => {
    // Let TrueSheet handle dismissal; onDidDismiss (handleDismiss) clears store state
    TrueSheet.dismiss('share-sheet').catch(() => {});
  }, []);

  // Bookmark handler - instant optimistic update
  const handleBookmark = () => {
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
            const post = await AtprotoFeedService.getPost(postUri);
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
          await BookmarkService.createBookmark(postUri, cid);
        } else {
          await BookmarkService.deleteBookmark(postUri);
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
  };

  // Helper function to report content
  const reportContent = async (reasonType: 'spam' | 'violation' | 'misleading' | 'sexual' | 'rude' | 'other') => {
    if (!postUri) return;

    // Optimistic update - mark as reported immediately and dismiss
    const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
    const store = useReportedPostsStore.getState();
    store.reportPost(postUri);
    dismissSheet();

    // Show success message immediately
    Alert.alert(t('common.thankYou'), t('alerts.contentReported'));

    // Perform report in background
    try {
      const success = await ModerationService.reportContent(postUri, reasonType);
      if (!success) {
        store.unreportPost(postUri);
        Alert.alert(t('common.error'), t('alerts.failedToReport'));
      }
    } catch (_error) {
      store.unreportPost(postUri);
      Alert.alert(t('common.error'), t('alerts.failedToReport'));
    }
  };

  // Report or delete post handler
  const handleReportOrDelete = () => {
    // For current user, show delete option
    if (isCurrentUser) {
      Alert.alert(t('alerts.deletePost'), t('alerts.deletePostConfirm'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
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
              const success = await AtprotoFeedService.deletePost(postUri);
              if (!success) {
                // Re-invalidate on error to ensure UI is correct
                queryClient.invalidateQueries({
                  queryKey: queryKeys.feed.all,
                  refetchType: 'active',
                });
                Alert.alert(t('common.error'), t('alerts.failedToDeletePost'));
              }
            } catch (_error) {
              // Re-invalidate on error to ensure UI is correct
              queryClient.invalidateQueries({
                queryKey: queryKeys.feed.all,
                refetchType: 'active',
              });
              Alert.alert(t('common.error'), t('alerts.failedToDeletePost'));
            }
          },
        },
      ]);
    } else {
      // For other users' content, show report option
      Alert.alert(t('alerts.reportContent'), t('alerts.reportContentPrompt'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('alerts.spam'),
          onPress: () => reportContent('spam'),
        },
        {
          text: t('alerts.harmfulContent'),
          onPress: () => reportContent('violation'),
        },
        {
          text: t('alerts.misleading'),
          onPress: () => reportContent('misleading'),
        },
        {
          text: t('alerts.sexualContent'),
          onPress: () => reportContent('sexual'),
        },
        {
          text: t('alerts.rudeOffensive'),
          onPress: () => reportContent('rude'),
        },
        {
          text: t('alerts.other'),
          onPress: () => reportContent('other'),
        },
      ]);
    }
  };

  // Share link handler
  const handleShare = async () => {
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
        title: t('share.checkOutPost'),
      });
    } catch (_error: unknown) {
      // ignore
    }
  };

  const handleSend = useCallback(() => {
    setShowConversationPicker(true);
  }, []);

  const handleSendToDismiss = useCallback(() => {
    setShowConversationPicker(false);
  }, []);

  const handleSendToSent = useCallback(() => {
    setShowConversationPicker(false);
    dismissSheet();
  }, [dismissSheet]);

  // Neon accent colors for share-sheet (electric glow)
  const NEON = {
    purple: '#c084fc',
    green: '#22c55e',
    amber: '#facc15',
    coral: '#ff3366',
  };

  // Get menu options based on current state
  const getMenuOptions = () => {
    const options = [
      {
        id: 'share',
        label: t('share.share'),
        icon: 'share-sheet-share-cute-fill',
        onPress: handleShare,
        color: NEON.purple,
        buttonColor: Colors.purple[950],
      },
      {
        id: 'send',
        label: t('share.send'),
        icon: 'share-sheet-send-cute-fill',
        onPress: handleSend,
        color: NEON.green,
        buttonColor: Colors.teal[950],
      },
      {
        id: 'bookmark',
        label: isBookmarked ? t('share.saved') : t('share.save'),
        icon: 'share-sheet-bookmark-cute-fill',
        onPress: handleBookmark,
        color: NEON.amber,
        buttonColor: Colors.amber[950],
      },
      {
        id: 'report',
        label: isCurrentUser ? t('share.delete') : t('share.report'),
        icon: isCurrentUser ? 'share-sheet-delete-cute-fill' : 'share-sheet-report-cute-fill',
        onPress: async () => handleReportOrDelete(),
        color: NEON.coral,
        buttonColor: Colors.coral[950],
      },
    ];

    return options;
  };

  const menuOptions = getMenuOptions();

  // Header component for TrueSheet header prop
  const headerTitleText =
    authorName || authorHandle
      ? t('share.postBy', { author: authorHandle ? formatHandle(authorHandle) : authorName })
      : t('share.share');

  const headerComponent = (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {headerTitleText}
      </Text>
      <CloseButton onPress={dismissSheet} />
    </View>
  );

  // Don't render content if no data
  if (!data) {
    return (
      <AppTrueSheet
        name="share-sheet"
        grabber={false}
        onDidPresent={() => setIsSheetPresented(true)}
        onDidDismiss={handleDismiss}
      >
        <View style={styles.contentContainer} />
      </AppTrueSheet>
    );
  }

  return (
    <>
      <AppTrueSheet
        name="share-sheet"
        grabber={false}
        insetAdjustment="automatic"
        onDidPresent={() => setIsSheetPresented(true)}
        onDidDismiss={handleDismiss}
        header={headerComponent}
        footer={wrapFooter(
          <SheetActionFooter bottomPadding={footerBottomPadding} topPadding={footerTop}>
            <CancelButton onPress={dismissSheet} text={t('common.close')} />
          </SheetActionFooter>
        )}
      >
        <View style={[styles.contentContainer, { paddingBottom: contentBottomPadding }]}>
          <ScrollView
            horizontal
            style={styles.optionsScroll}
            showsHorizontalScrollIndicator={
              menuOptions.length >=
              SCROLL_INDICATOR_CONSTANTS.SHARE_ACTIONS_ROW_HORIZONTAL_MIN_ITEMS
            }
            showsVerticalScrollIndicator={
              menuOptions.length >= SCROLL_INDICATOR_CONSTANTS.SHARE_ACTIONS_ROW_VERTICAL_MIN_ITEMS
            }
            alwaysBounceHorizontal={true}
            alwaysBounceVertical={false}
            bounces={true}
            contentContainerStyle={[
              styles.optionsContainer,
              styles.optionsContainerContent,
              styles.optionsContainerGap,
            ]}
          >
            {menuOptions.map(option => (
              <View key={option.id} style={styles.optionWrapper}>
                <NativePressable onPress={option.onPress}>
                  {({ pressed }) => {
                    const isSwapped = (option.id === 'bookmark' && isBookmarked) || pressed;
                    const iconColor = isSwapped ? option.buttonColor : option.color;
                    const backgroundColor = isSwapped ? option.color : option.buttonColor;

                    return (
                      <SquircleView
                        style={[
                          styles.option,
                          {
                            backgroundColor,
                          },
                        ]}
                      >
                        <Icon name={option.icon} size={45} color={iconColor} />
                      </SquircleView>
                    );
                  }}
                </NativePressable>
                <Text style={styles.optionText}>{option.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </AppTrueSheet>

      {/* Send-to picker: isolated child sheet with its own footer */}
      {data && (
        <SendToPicker
          visible={showConversationPicker}
          onDismiss={handleSendToDismiss}
          onSent={handleSendToSent}
          postUri={postUri!}
          postCid={postCid}
          currentUserDid={currentUserDid}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    ...SHEET_STYLES.headerContainer,
  },
  headerTitle: {
    ...SHEET_STYLES.headerTitle,
  },
  contentContainer: {
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    // Extend options row to sheet edges while preserving overall content padding
    marginLeft: -DEFAULT_CONTENT_PADDING_HORIZONTAL,
    marginRight: -DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  optionsScroll: {
    marginBottom: 0,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginTop: 0,
    paddingHorizontal: 0,
    flexWrap: 'nowrap',
  },
  optionsContainerContent: {
    paddingLeft: SHEET_SPACING.headerHorizontal,
  },
  optionsContainerGap: {
    gap: 12,
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
  optionText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: FontFamily.medium,
  },
});

export default ShareSheet;
