import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/query/queryKeys';
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
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  CONTENT_TO_FOOTER_GAP_REDUCTION,
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
import AtprotoService from '../../../services/api/AtprotoService';
import { FeedService } from '../../../services/api/feed/FeedService';
import { Colors } from '../UI';
import { useGlobalShareSheet } from '../../../hooks/useGlobalModals';
import { formatHandle } from '../../../utils/formatting/handles';
import { useBookmarkStore } from '../../../stores/bookmarkStore';
import { useUserStore } from '../../../stores/userStore';
import SendToPicker from './SendToPicker';
import { FontFamily, Typography } from '../../../utils/components/typography';
import {
  type Interaction,
  REQUESTMORE as REQUESTMORE_CONST,
  REQUESTLESS as REQUESTLESS_CONST,
} from '../../../services/api/types';
import {
  getOrbytMixInteractionCapability,
  type OrbytMixInteractionCapability,
} from '../../../services/OrbytMixWarmupService';
import { YOUR_MIX_FEED_GENERATOR_URI } from '../../../utils/constants';

interface ShareSheetMenuOption {
  id: string;
  label: string;
  icon: string;
  onPress: () => void | Promise<void>;
  color: string;
  buttonColor: string;
}

const ShareSheet: React.FC = () => {
  const { t } = useTranslation();
  const { getCurrentData, dismissShareSheet } = useGlobalShareSheet();
  const data = getCurrentData();

  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, authorHandle, sourceFeed, feedContext } =
    data || {};
  const queryClient = useQueryClient();
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);
  const [showConversationPicker, setShowConversationPicker] = useState<boolean>(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const [orbytMixCapability, setOrbytMixCapability] =
    useState<OrbytMixInteractionCapability | null>(null);
  const [feedPreference, setFeedPreference] = useState<'interested' | 'not_interested' | null>(
    null
  );
  const sheetRef = useRef<TrueSheet>(null);
  const isOrbytMixContext = Boolean(data?.isOrbytMixSource || data?.feedOption === 'your-mix');

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
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (data) {
      sheet.present().catch(() => {});
    } else {
      sheet.dismiss().catch(() => {});
    }
  }, [data]);

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

  useEffect(() => {
    let isMounted = true;

    if (!isOrbytMixContext) {
      setOrbytMixCapability(null);
      setFeedPreference(null);
      return () => {
        isMounted = false;
      };
    }

    getOrbytMixInteractionCapability()
      .then(capability => {
        if (isMounted) {
          setOrbytMixCapability(capability);
        }
      })
      .catch(() => {
        if (isMounted) {
          setOrbytMixCapability({
            describeSucceeded: false,
            acceptsInteractions: false,
            checkedAt: Date.now(),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOrbytMixContext]);

  // Load persisted feed preference when sheet opens with a post
  useEffect(() => {
    if (!postUri || !isOrbytMixContext) {
      setFeedPreference(null);
      return;
    }
    FeedService.getVideoFeedback(postUri).then(feedback => {
      setFeedPreference(feedback?.type ?? null);
    });
  }, [postUri, isOrbytMixContext]);

  // Handle dismiss from TrueSheet - fires when sheet is dismissed by any means
  const handleDismiss = useCallback(() => {
    dismissShareSheet(true);
    setShowConversationPicker(false);
  }, [dismissShareSheet]);

  // Programmatic dismiss function for buttons
  const dismissSheet = useCallback(() => {
    // Let TrueSheet handle dismissal; onDidDismiss (handleDismiss) clears store state
    sheetRef.current?.dismiss().catch(() => {});
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
      const { useReportedPostsStore } = await import('../../../stores/reportedPostsStore');
      const store = useReportedPostsStore.getState();
      store.reportPost(postUri);
      dismissSheet();

      // Show success message immediately
      Alert.alert(t('common.thankYou'), t('alerts.contentReported'));

      // Perform report in background
      try {
        const success = await AtprotoService.reportContent(postUri, reasonType);
        if (!success) {
          // Revert optimistic update on error - remove from reported set
          const newSet = new Set(store.reportedPostUris);
          newSet.delete(postUri);
          store.reportedPostUris = newSet;
          Alert.alert(t('common.error'), t('alerts.failedToReport'));
        }
      } catch (_error) {
        // Revert optimistic update on error - remove from reported set
        const newSet = new Set(store.reportedPostUris);
        newSet.delete(postUri);
        store.reportedPostUris = newSet;
        Alert.alert(t('common.error'), t('alerts.failedToReport'));
      }
    },
    [postUri, dismissSheet, t]
  );

  // Report or delete post handler
  const handleReportOrDelete = useCallback(() => {
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
              const success = await AtprotoService.deletePost(postUri);
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
  }, [dismissSheet, isCurrentUser, postUri, queryClient, reportContent, t]);

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
        title: t('share.checkOutPost'),
      });
    } catch (_error: unknown) {
      // ignore
    }
  }, [postUri, authorHandle, authorDid, t]);

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

  const sendPreferenceInteraction = useCallback(
    async (event: NonNullable<Interaction['event']>) => {
      if (!postUri) return;

      const interaction: Interaction = {
        $type: 'app.bsky.feed.defs#interaction',
        item: postUri,
        event,
      };
      if (feedContext) {
        interaction.feedContext = feedContext;
      }

      const targetFeed = sourceFeed || YOUR_MIX_FEED_GENERATOR_URI;
      await FeedService.sendFeedInteractions([interaction], targetFeed);
    },
    [postUri, feedContext, sourceFeed]
  );

  const handleShowMoreLikeThis = useCallback(async () => {
    if (!postUri) return;
    try {
      if (feedPreference === 'interested') {
        // Unselect: clear stored preference
        FeedService.removeVideoFeedback(postUri);
        setFeedPreference(null);
        return;
      }
      await sendPreferenceInteraction(REQUESTMORE_CONST);
      await FeedService.persistFeedPreference(postUri, 'interested');
      setFeedPreference('interested');
    } catch {
      // Best-effort; interaction may still have been sent
    }
  }, [postUri, feedPreference, sendPreferenceInteraction]);

  const handleShowLessLikeThis = useCallback(async () => {
    if (!postUri) return;
    try {
      if (feedPreference === 'not_interested') {
        // Unselect: clear stored preference
        FeedService.removeVideoFeedback(postUri);
        setFeedPreference(null);
        return;
      }
      await sendPreferenceInteraction(REQUESTLESS_CONST);
      await FeedService.persistFeedPreference(postUri, 'not_interested');
      setFeedPreference('not_interested');
    } catch {
      // Best-effort; interaction may still have been sent
    }
  }, [postUri, feedPreference, sendPreferenceInteraction]);

  // Share sheet palette — semantic colors for each action
  const SHARE_OPTIONS_PALETTE = {
    share: { accent: Colors.purple[400], bg: Colors.purple[950] }, // Brand, spread/share
    send: { accent: Colors.blue[400], bg: Colors.blue[950] }, // Universal send/message
    bookmark: { accent: Colors.amber[400], bg: Colors.amber[950] }, // Save/star gold
    report: { accent: Colors.coral[400], bg: Colors.coral[950] }, // Danger, negative
    showMore: { accent: Colors.teal[400], bg: Colors.teal[950] }, // Growth, positive
    showLess: { accent: Colors.neutral[300], bg: Colors.neutral[800] }, // Muted, dial back
  };

  // Get menu options based on current state
  const getMenuOptions = () => {
    const canShowOrbytMixFeedback =
      isOrbytMixContext && Boolean(orbytMixCapability?.acceptsInteractions);

    const options: ShareSheetMenuOption[] = [
      {
        id: 'share',
        label: t('share.share'),
        icon: 'share',
        onPress: handleShare,
        color: SHARE_OPTIONS_PALETTE.share.accent,
        buttonColor: SHARE_OPTIONS_PALETTE.share.bg,
      },
      {
        id: 'send',
        label: t('share.send'),
        icon: 'send-plane-fill',
        onPress: handleSend,
        color: SHARE_OPTIONS_PALETTE.send.accent,
        buttonColor: SHARE_OPTIONS_PALETTE.send.bg,
      },
      {
        id: 'bookmark',
        label: isBookmarked ? t('share.saved') : t('share.save'),
        icon: 'bookmark-fill',
        onPress: handleBookmark,
        color: SHARE_OPTIONS_PALETTE.bookmark.accent,
        buttonColor: SHARE_OPTIONS_PALETTE.bookmark.bg,
      },
      ...(canShowOrbytMixFeedback
        ? [
            {
              id: 'show-more' as const,
              label: t('share.showMore'),
              icon: 'interested' as const,
              onPress: handleShowMoreLikeThis,
              color: SHARE_OPTIONS_PALETTE.showMore.accent,
              buttonColor: SHARE_OPTIONS_PALETTE.showMore.bg,
            },
            {
              id: 'show-less' as const,
              label: t('share.showLess'),
              icon: 'not_interested' as const,
              onPress: handleShowLessLikeThis,
              color: SHARE_OPTIONS_PALETTE.showLess.accent,
              buttonColor: SHARE_OPTIONS_PALETTE.showLess.bg,
            },
          ]
        : []),
      {
        id: 'report',
        label: isCurrentUser ? t('share.delete') : t('share.report'),
        icon: (isCurrentUser ? 'delete-2-fill' : 'report') as 'delete-2-fill' | 'report',
        onPress: handleReportOrDelete,
        color: SHARE_OPTIONS_PALETTE.report.accent,
        buttonColor: SHARE_OPTIONS_PALETTE.report.bg,
      },
    ];

    return options;
  };

  const menuOptions = getMenuOptions();

  // Header component for TrueSheet header prop
  const headerComponent =
    authorName || authorHandle ? (
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('share.postBy', { author: authorHandle ? formatHandle(authorHandle) : authorName })}
        </Text>
        <CloseButton onPress={dismissSheet} />
      </View>
    ) : undefined;

  // Don't render content if no data
  if (!data) {
    return (
      <AppTrueSheet ref={sheetRef} name="share-sheet" onDidDismiss={handleDismiss}>
        <View style={styles.contentContainer} />
      </AppTrueSheet>
    );
  }

  return (
    <>
      <AppTrueSheet
        ref={sheetRef}
        name="share-sheet"
        onDidDismiss={handleDismiss}
        header={headerComponent}
        footer={wrapFooter(
          <SheetActionFooter
            bottomPadding={footerBottomPadding}
            topPadding={footerTop}
            backgroundColor={Colors.black}
          >
            <CancelButton onPress={dismissSheet} />
          </SheetActionFooter>
        )}
      >
        <View
          style={[
            styles.contentContainer,
            {
              paddingBottom: Math.max(0, contentBottomPadding - CONTENT_TO_FOOTER_GAP_REDUCTION),
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
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
                <Pressable onPress={option.onPress}>
                  {({ pressed }) => {
                    const isSwapped =
                      (option.id === 'bookmark' && isBookmarked) ||
                      (option.id === 'show-more' && feedPreference === 'interested') ||
                      (option.id === 'show-less' && feedPreference === 'not_interested') ||
                      pressed;
                    const iconColor = isSwapped ? option.buttonColor : option.color;
                    const backgroundColor = isSwapped ? option.color : option.buttonColor;

                    return (
                      <View
                        style={[
                          styles.option,
                          styles.optionShadow,
                          {
                            backgroundColor,
                            shadowColor: option.color,
                            shadowOffset: { width: 0, height: 0 },
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
    // Extend options row to sheet edges while preserving padding via scroll content
    marginLeft: -DEFAULT_CONTENT_PADDING_HORIZONTAL,
    marginRight: -DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginTop: 0,
    flexWrap: 'nowrap',
  },
  optionsContainerContent: {
    paddingHorizontal: SHEET_SPACING.headerHorizontal,
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
  optionShadow: {
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 12,
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
