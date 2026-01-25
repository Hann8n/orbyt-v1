import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../utils/constants';
import { useQuery, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { queryKeys } from '../../utils/query/queryKeys';
import { convertAtUriToOrbytUrl } from '../../utils/links/bluesky';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Platform,
  Alert,
  ScrollView,
  FlatList,
  TextInput,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../utils/components/truesheet/utils';
import KeyboardAwareFooter from '../../utils/components/truesheet/KeyboardAwareFooter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { Loading3FillIcon } from './Icon';
import CloseButton from './CloseButton';
import CancelButton from './CancelButton';
import AtprotoService from '../../services/api/AtprotoService';
import { Colors } from './UI';
import { Avatar } from './UI';
import { hexToRGBA, getProfileColors } from '../../utils/formatting/colors';
import { useGlobalShareSheet } from '../../hooks/useGlobalModals';
import ChatService, { Conversation, RecordEmbed } from '../../services/ChatService';
import { formatHandle } from '../../utils/formatting/handles';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useUserStore } from '../../stores/userStore';
import { useProfile } from '../../services/data/ProfileService';
import type { ProfileViewBasic } from '../../services/api/types';

// Check if profile can receive messages based on chat settings
// Accepts ProfileViewBasic which may have associated/viewer properties
const canBeMessaged = (profile: ProfileViewBasic): boolean => {
  const allowIncoming = profile.associated?.chat?.allowIncoming;
  switch (allowIncoming) {
    case 'none':
      return false;
    case 'all':
      return true;
    case 'following':
    case undefined:
      return Boolean(profile.viewer?.followedBy);
    default:
      return false;
  }
};

// Conversation item component to use hooks
const ConversationItem: React.FC<{
  profile: ProfileViewBasic;
  isDisabled: boolean;
  onPress: () => void;
}> = ({ profile, isDisabled, onPress }) => {
  const { data: profileData } = useProfile(profile?.handle);
  const profileColors = getProfileColors(profileData);

  return (
    <Pressable
      style={[styles.conversationItem, isDisabled && styles.disabledItem]}
      onPress={onPress}
      disabled={isDisabled}
    >
      <Avatar
        uri={profile.avatar}
        type="profile"
        size={50}
        showRing={false}
        status={profileData?.status}
        profileColors={
          profileColors
            ? {
                backgroundColor: profileColors.backgroundColor,
                foregroundColor: profileColors.foregroundColor,
                textColor: profileColors.foregroundColor,
              }
            : undefined
        }
      />
      <View style={styles.conversationInfo}>
        <Text
          style={[styles.conversationName, isDisabled && styles.disabledText]}
          numberOfLines={1}
        >
          {formatHandle(profile.handle) || 'user'}
        </Text>
      </View>
    </Pressable>
  );
};

const ShareSheet: React.FC = () => {
  const { getCurrentData, dismissShareSheet } = useGlobalShareSheet();
  const data = getCurrentData();

  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, authorHandle } = data || {};
  const queryClient = useQueryClient();
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);
  const [showConversationPicker, setShowConversationPicker] = useState<boolean>(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput | null>(null);
  const sheetRef = useRef<TrueSheet>(null);

  // Bookmark store
  const isBookmarked = useBookmarkStore(state => (postUri ? state.isBookmarked(postUri) : false));
  const addBookmark = useBookmarkStore(state => state.addBookmark);
  const removeBookmark = useBookmarkStore(state => state.removeBookmark);

  // TrueSheet detents - v3 uses 'auto' or fractional numbers (0-1)
  const sheetDetents: ('auto' | number)[] = useMemo(() => ['auto'], []);
  const insets = useSafeAreaInsets();

  // Calculate footer height as constant: cancelContainer paddingTop (8) + button minHeight (44)
  const footerHeight = 8 + 44;

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
      setCurrentUserDid(did);
      setIsCurrentUser(did === authorDid);
    }
  }, [authorDid, currentUser?.did]);

  // Handle dismiss from TrueSheet - fires when sheet is dismissed by any means
  const handleDismiss = useCallback(() => {
    // Clear the data state - skip dismiss since we're already in onDismiss callback
    dismissShareSheet(true);
    // Reset local UI state
    setShowConversationPicker(false);
    setShowSearch(false);
    setSearchQuery('');
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
  }, [dismissSheet, isCurrentUser, postUri, queryClient]);

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

  // Share link handler
  const handleShare = useCallback(async () => {
    if (!postUri) return;
    try {
      // Convert AT URI to a web URL using the utility function
      const shareUrl = convertAtUriToOrbytUrl(postUri, authorHandle, authorDid);

      await Share.share({
        message: Platform.OS === 'ios' ? '' : shareUrl,
        url: Platform.OS === 'ios' ? shareUrl : '',
        title: 'check out this post on bluesky',
      });
    } catch (_error: unknown) {
      // ignore
    }
  }, [postUri, authorHandle, authorDid, dismissSheet]);

  // Fetch conversations for send picker
  const { data: conversationsData, isLoading: conversationsLoading } = useQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: () => ChatService.getConversations(),
    enabled: showConversationPicker,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
  });

  const conversations = conversationsData?.conversations || [];

  // Search profiles when search query exists
  const {
    data: searchData,
    fetchNextPage: fetchMoreProfiles,
    hasNextPage: hasMoreProfiles,
  } = useInfiniteQuery<
    { profiles: ProfileViewBasic[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: ProfileViewBasic[]; cursor: string | null }, string | null>,
    ReturnType<typeof queryKeys.search.profiles>,
    string | null
  >({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null,
    enabled: searchQuery.trim().length > 0,
  });

  const searchResults = useMemo(() => {
    if (!searchData?.pages) return [];
    return searchData.pages.flatMap(page => page.profiles || []);
  }, [searchData]);

  // Smart sorting: conversations first (recent), then search results sorted by canBeMessaged
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show recent conversations by default
      return conversations;
    }
    // Show conversations matching search first, then new search profiles
    const conversationMatches = conversations.filter((c: Conversation) => {
      const otherMember = c.members.find(m => m.did !== currentUserDid) || c.members[0];
      const name = otherMember?.displayName || '';
      const handle = otherMember?.handle || '';
      const q = searchQuery.toLowerCase();
      return name.toLowerCase().includes(q) || handle.toLowerCase().includes(q);
    });

    // Add search profiles that aren't already in conversations
    const conversationDids = new Set(conversations.flatMap(c => c.members.map(m => m.did)));
    const newProfiles = searchResults
      .filter(p => !conversationDids.has(p.did))
      .sort((_a, b) => {
        // Sort by canBeMessaged status (enabled first)
        return canBeMessaged(b) ? 1 : -1;
      });

    return [...conversationMatches, ...newProfiles];
  }, [conversations, currentUserDid, searchQuery, searchResults]);

  // Auto-focus search input when search is shown
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    }
  }, [showSearch]);

  // Send video handler - opens conversation picker
  const handleSend = useCallback(() => {
    setShowConversationPicker(true);
    setShowSearch(true);
  }, []);

  // Send video to selected conversation or create one with new profile
  const handleSendToConversation = useCallback(
    async (item: Conversation | ProfileViewBasic) => {
      const isConversation = 'id' in item;
      if (!postUri) {
        Alert.alert('error', 'missing post information.');
        return;
      }

      // Optimistic update - dismiss sheet immediately
      setShowConversationPicker(false);
      dismissSheet();
      Alert.alert('sent', 'video sent successfully.');

      // Perform send in background
      (async () => {
        try {
          // Get CID if missing
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
            Alert.alert('error', 'unable to send post. missing post information.');
            return;
          }

          // Check if item is a conversation or a new profile
          let conversationId: string;
          if (isConversation) {
            conversationId = item.id;
          } else {
            // New profile - create conversation first
            const convo = await ChatService.createConversation({ recipientDid: item.did });
            conversationId = convo.id;
          }

          const embed: RecordEmbed = {
            $type: 'app.bsky.embed.record',
            record: {
              uri: postUri,
              cid,
            },
          };

          await ChatService.sendMessage({
            conversationId,
            text: '',
            embed: embed,
          });
        } catch (_error: unknown) {
          const errorMessage =
            _error instanceof Error ? _error.message : 'failed to send video. please try again.';
          Alert.alert('error', errorMessage);
        }
      })();
    },
    [postUri, postCid, dismissSheet]
  );

  // Get menu options based on current state
  const getMenuOptions = () => {
    const options = [
      {
        id: 'share',
        label: 'Share',
        icon: 'share',
        onPress: handleShare,
        color: Colors.neonPurple,
        buttonColor: Colors.darkBlue,
      },
      {
        id: 'send',
        label: 'Send',
        icon: 'send-plane-fill',
        onPress: handleSend,
        color: Colors.green,
        buttonColor: Colors.darkGreen,
      },
      {
        id: 'bookmark',
        label: isBookmarked ? 'Saved' : 'Save',
        icon: 'bookmark-fill',
        onPress: handleBookmark,
        color: Colors.yellow,
        buttonColor: Colors.darkYellow,
      },
      {
        id: 'report',
        label: isCurrentUser ? 'Delete' : 'Report',
        icon: isCurrentUser ? 'delete-2-fill' : 'report',
        onPress: async () => handleReportOrDelete(),
        color: Colors.red,
        buttonColor: Colors.darkRed,
      },
    ];

    return options;
  };

  const menuOptions = getMenuOptions();

  // Use fixed spacing instead of dynamic calculation
  const fixedSpacing = 12;

  // Header component for TrueSheet header prop
  const headerComponent =
    (authorName || authorHandle) && !showConversationPicker ? (
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
      footer={
        showConversationPicker ? undefined : (
          <View style={{ backgroundColor: Colors.black, paddingBottom: insets.bottom }}>
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
        )
      }
    >
      <View style={styles.content}>
        {/* Conversation picker */}
        {showConversationPicker ? (
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Pressable style={styles.backButton} onPress={() => setShowConversationPicker(false)}>
                <Icon name="left_arrow_filled" size={20} color={Colors.white} />
              </Pressable>
              <Text style={styles.pickerTitle}>Send to</Text>
              <View style={styles.headerSpacer} />
            </View>
            <TextInput
              ref={searchInputRef}
              nativeID="share-sheet-search-input"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search people"
              placeholderTextColor={Colors.lightGray}
              style={styles.searchInput}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              caretHidden={false}
              autoFocus={true}
            />
            {conversationsLoading ? (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.white} />
              </View>
            ) : (
              <FlatList
                data={filteredConversations}
                keyExtractor={(item, idx) => {
                  if ('id' in item) {
                    return item.id;
                  }
                  return item.did || `search-${idx}`;
                }}
                renderItem={({ item }) => {
                  // Handle both conversations and search profiles
                  const itemIsConversation = 'id' in item;
                  const profile: ProfileViewBasic = itemIsConversation
                    ? item.members.find(
                        (member: ProfileViewBasic) => member.did !== currentUserDid
                      ) || item.members[0]
                    : item;

                  const isDisabled =
                    !itemIsConversation && !canBeMessaged(item as ProfileViewBasic);

                  return (
                    <ConversationItem
                      profile={profile}
                      isDisabled={isDisabled}
                      onPress={() => handleSendToConversation(item)}
                    />
                  );
                }}
                contentContainerStyle={[
                  styles.conversationList,
                  filteredConversations.length === 0 && styles.conversationListEmpty,
                ]}
                keyboardShouldPersistTaps="handled"
                onEndReached={() => {
                  if (searchQuery.trim() && hasMoreProfiles && !conversationsLoading) {
                    fetchMoreProfiles();
                  }
                }}
                onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No results</Text>
                  </View>
                }
              />
            )}
          </View>
        ) : (
          /* Options */
          <View style={[styles.contentContainer, { paddingBottom: footerHeight + 20 }]}>
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
                            { backgroundColor, borderColor: hexToRGBA(option.color, 0.28) },
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
        )}
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    color: Colors.white,
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
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
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
    paddingTop: 8,
  },
  optionText: {
    color: Colors.lightGray,
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionTextDisabled: {
    opacity: 0.5,
  },
  pickerContainer: {
    flex: 1,
    maxHeight: 400,
    marginLeft: -12,
    marginRight: -12,
    paddingLeft: 20,
    paddingRight: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    marginBottom: 4,
    marginLeft: -12,
    marginRight: -12,
  },
  pickerTitle: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Figtree-Bold',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
  },
  searchInput: {
    marginHorizontal: 8,
    marginBottom: 12,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    color: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Figtree-Medium',
    fontSize: 17,
  },
  conversationList: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
    gap: 6,
  },
  conversationListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  disabledItem: {
    opacity: 0.5,
  },
  conversationInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  conversationName: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '600',
    fontFamily: 'Figtree-SemiBold',
    marginBottom: 2,
  },
  disabledText: {
    color: Colors.lightGray,
  },
  conversationHandle: {
    color: Colors.lightGray,
    fontSize: 15,
    fontFamily: 'Figtree-Medium',
  },
});

export default ShareSheet;
