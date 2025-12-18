import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
import { useQuery, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { createQueryKeys } from '../../services/FeedService';
import { convertAtUriToBlueskyUrl } from '../../utils/blueskyLinks';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Platform,
  Alert,
  Dimensions,
  ScrollView,
  FlatList,
  TextInput,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss, safePresent } from '../../utils/truesheet/trueSheetUtils';
import KeyboardAwareFooter from '../../utils/truesheet/KeyboardAwareFooter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon, { Loading3FillIcon } from './Icon';
import AtprotoService from '../../services/api/AtprotoService';
import ProfileCache from '../../services/cache/ProfileCache';
import { Colors } from './UI';
import { Avatar } from './UI';
import { hexToRGBA } from '../../utils/formatting/colorUtils';
import { useGlobalShareSheet } from '../../hooks/useGlobalModals';
import ChatService, { Conversation, RecordEmbed } from '../../services/ChatService';
import { formatHandle } from '../../utils/helpers';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useUserStore } from '../../stores/userStore';

// No props needed for global ShareSheet
interface ShareSheetProps {}

// Check if profile can receive messages based on chat settings
const canBeMessaged = (profile: any): boolean => {
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

const ShareSheet: React.FC<ShareSheetProps> = () => {
  const { getCurrentData, dismissShareSheet } = useGlobalShareSheet();
  const data = getCurrentData();
  
  // Always render the TrueSheet component, but only show content when there's data
  const { postUri, postCid, authorDid, authorName, authorHandle } = data || {};
  const queryClient = useQueryClient();
  const SCREEN_WIDTH = Dimensions.get('window').width;
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [isCurrentUser, setIsCurrentUser] = useState<boolean>(false);
  const [showConversationPicker, setShowConversationPicker] = useState<boolean>(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [isBookmarkPending, setIsBookmarkPending] = useState<boolean>(false);
  const searchInputRef = useRef<TextInput | null>(null);
  const sheetRef = useRef<TrueSheet>(null);
  
  // Bookmark store
  const isBookmarked = useBookmarkStore((state) => postUri ? state.isBookmarked(postUri) : false);
  const addBookmark = useBookmarkStore((state) => state.addBookmark);
  const removeBookmark = useBookmarkStore((state) => state.removeBookmark);

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

  const { data: blockStatus = false } = useQuery({
    queryKey: createQueryKeys.blocks.status(authorDid),
    queryFn: () => AtprotoService.isBlocked(authorDid),
    enabled: !!authorDid && !isCurrentUser,
    initialData: false
  });

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



  // Update isBlocked state when blockStatus changes
  useEffect(() => {
    setIsBlocked(blockStatus);
  }, [blockStatus]);



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
                } catch (error) {
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
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('error', 'failed to update block status. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [authorDid, isBlocked, dismissSheet, queryClient, isCurrentUser, postUri]);


  // Bookmark handler - optimistic update
  const handleBookmark = useCallback(async () => {
    if (!postUri || !postCid || isBookmarkPending) return;
    
    const newIsBookmarked = !isBookmarked;
    setIsBookmarkPending(true);
    
    // Optimistic update - update UI immediately
    if (newIsBookmarked) {
      addBookmark(postUri, { uri: postUri, cid: postCid });
    } else {
      removeBookmark(postUri);
    }
    
    try {
      if (newIsBookmarked) {
        await AtprotoService.createBookmark(postUri, postCid);
      } else {
        await AtprotoService.deleteBookmark(postUri);
      }
    } catch (error) {
      // Revert optimistic update on error
      if (newIsBookmarked) {
        removeBookmark(postUri);
      } else {
        addBookmark(postUri, { uri: postUri, cid: postCid });
      }
      Alert.alert('error', 'failed to update bookmark. please try again.');
    } finally {
      setIsBookmarkPending(false);
    }
  }, [postUri, postCid, isBookmarked, isBookmarkPending, addBookmark, removeBookmark]);

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
      } else {
        Alert.alert('error', 'failed to submit report. please try again.');
      }
    } catch (error) {
      Alert.alert('error', 'failed to submit report. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, dismissSheet]);

  // Share link handler
  const handleShare = useCallback(async () => {
    try {
      // Convert AT URI to a web URL using the utility function
      const shareUrl = convertAtUriToBlueskyUrl(postUri);
      
      await Share.share({
        message: Platform.OS === 'ios' ? '' : shareUrl,
        url: Platform.OS === 'ios' ? shareUrl : '',
        title: 'check out this post on bluesky',
      });
    } catch (error) {
    }
  }, [postUri, dismissSheet]);

  // Fetch conversations for send picker
  const { data: conversationsData, isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => ChatService.getConversations(),
    enabled: showConversationPicker,
  });

  const conversations = conversationsData?.conversations || [];
  
  // Search profiles when search query exists
  const { data: searchData, fetchNextPage: fetchMoreProfiles, hasNextPage: hasMoreProfiles } = useInfiniteQuery<
    { profiles: any[]; cursor: string | null },
    Error,
    InfiniteData<{ profiles: any[]; cursor: string | null }, string | null>,
    ReturnType<typeof createQueryKeys.search.profiles>,
    string | null
  >({
    queryKey: createQueryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: (lastPage) => lastPage?.cursor ?? null,
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
      .sort((a, b) => {
        // Sort by canBeMessaged status (enabled first)
        const aEnabled = canBeMessaged(a);
        const bEnabled = canBeMessaged(b);
        return bEnabled ? 1 : -1;
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
  const handleSendToConversation = useCallback(async (item: any) => {
    if (!postUri || !postCid) {
      Alert.alert('error', 'missing post information.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Check if item is a conversation or a new profile
      let conversationId = item.id;
      if (!conversationId) {
        // New profile - create conversation first
        const convo = await ChatService.createConversation({ recipientDid: item.did });
        conversationId = convo.id;
      }

      const embed: RecordEmbed = {
        $type: 'app.bsky.embed.record',
        record: {
          uri: postUri,
          cid: postCid,
        },
      };

      await ChatService.sendMessage({
        conversationId,
        text: '',
        embed: embed,
      });

      Alert.alert('sent', 'video sent successfully.');
      setShowConversationPicker(false);
      dismissSheet();
    } catch (error: any) {
      Alert.alert('error', error.message || 'failed to send video. please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [postUri, postCid, dismissSheet]);

  // Get menu options based on current state
  const getMenuOptions = () => {
    const options = [
      {
        id: 'share',
        label: 'Share',
        icon: 'share',
        onPress: handleShare,
        color: Colors.neonPurple,
        buttonColor: Colors.darkBlue
      },
      {
        id: 'send',
        label: 'Send',
        icon: 'send-plane-fill',
        onPress: handleSend,
        color: Colors.green,
        buttonColor: Colors.darkGreen
      },
      {
        id: 'bookmark',
        label: isBookmarked ? 'Saved' : 'Save',
        icon: 'bookmark-fill',
        onPress: handleBookmark,
        color: isBookmarked ? Colors.darkYellow : Colors.yellow,
        buttonColor: isBookmarked ? Colors.yellow : Colors.darkYellow
      },
      {
        id: 'report',
        label: isCurrentUser ? 'Delete' : 'Report',
        icon: 'report',
        onPress: async () => handleReportOrDelete(),
        color: Colors.red,
        buttonColor: Colors.darkRed
      }
    ];

    return options;
  };

  const menuOptions = getMenuOptions();

  // Use fixed spacing instead of dynamic calculation
  const fixedSpacing = 12;

  // Header component for TrueSheet header prop
  const headerComponent = (authorName || authorHandle) && !showConversationPicker ? (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        post by {authorHandle ? formatHandle(authorHandle) : authorName}
      </Text>
      <Pressable 
        style={styles.closeButton} 
        onPress={dismissSheet}
      >
        <Icon name="close" size={20} color={Colors.white} />
      </Pressable>
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
        <View style={styles.content}>
          {/* Empty content when no data or clear view mode */}
        </View>
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
        showConversationPicker
          ? null
          : (
            <View style={{ backgroundColor: Colors.black, paddingBottom: typeof insets?.bottom === 'number' ? insets.bottom : 0 }}>
              <KeyboardAwareFooter hideOnKeyboard={true} bottomPadding={0} style={{ backgroundColor: Colors.black }}>
                <View 
                  style={[styles.cancelContainer, { backgroundColor: Colors.black }]}
                > 
                  <Pressable 
                    style={styles.cancelButton} 
                    onPress={dismissSheet} 
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
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
              <Pressable 
                style={styles.backButton} 
                onPress={() => setShowConversationPicker(false)}
              >
                <Icon name="left_arrow_filled" size={20} color={Colors.white} />
              </Pressable>
              <Text style={styles.pickerTitle}>Send to</Text>
              <View style={styles.headerSpacer} />
            </View>
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search people"
              placeholderTextColor={Colors.lightGray}
              style={styles.searchInput}
              autoFocus={true}
            />
            {conversationsLoading ? (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.white} />
              </View>
            ) : (
              <FlatList
                data={filteredConversations}
                keyExtractor={(item, idx) => item.id || item.did || `search-${idx}`}
                renderItem={({ item }) => {
                  // Handle both conversations and search profiles
                  const isConversation = !!item.id;
                  const profile = isConversation 
                    ? (item.members.find((member: any) => member.did !== currentUserDid) || item.members[0])
                    : item;
                  
                  const isDisabled = !isConversation && !canBeMessaged(item);
                  
                  return (
                    <Pressable
                      style={[styles.conversationItem, isDisabled && styles.disabledItem]}
                      onPress={() => handleSendToConversation(item)}
                      disabled={isSubmitting || isDisabled}
                    >
                      <Avatar
                        uri={profile.avatar}
                        type="profile"
                        size={50}
                        showRing={false}
                      />
                      <View style={styles.conversationInfo}>
                        <Text style={[styles.conversationName, isDisabled && styles.disabledText]} numberOfLines={1}>
                          {formatHandle(profile.handle) || 'user'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
                contentContainerStyle={[
                  styles.conversationList,
                  filteredConversations.length === 0 && styles.conversationListEmpty
                ]}
                keyboardShouldPersistTaps="handled"
                onEndReached={() => {
                  if (searchQuery.trim() && hasMoreProfiles && !conversationsLoading) {
                    fetchMoreProfiles();
                  }
                }}
                onEndReachedThreshold={0.5}
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
          <View style={[styles.contentContainer, { paddingBottom: footerHeight }]}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              scrollEnabled={true}
              alwaysBounceHorizontal={true}
              alwaysBounceVertical={false}
              bounces={false}
              contentContainerStyle={[styles.optionsContainer, { gap: fixedSpacing, paddingLeft: 20, paddingRight: 20 }]}
            >
              {menuOptions.map((option) => (
                <View key={option.id} style={styles.optionWrapper}>
                  <Pressable 
                    style={[
                      styles.option,
                      { backgroundColor: option.buttonColor, borderColor: hexToRGBA(option.color, 0.28) }
                    ]}
                    onPress={option.onPress}
                    disabled={isSubmitting || (option.id === 'bookmark' && isBookmarkPending)}
                  >
                    <Icon name={option.icon} size={45} color={option.color} />
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
    fontFamily: 'Firma-Bold',
    flex: 1,
  },
  contentContainer: {
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
    borderColor: 'transparent'
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
    fontFamily: 'Firma-Bold',
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
    fontFamily: 'Firma-Medium',
  },
  searchInput: {
    marginHorizontal: 8,
    marginBottom: 12,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: hexToRGBA(Colors.gray, 0.12),
    color: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Firma-Medium',
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
    fontFamily: 'Firma-SemiBold',
    marginBottom: 2,
  },
  disabledText: {
    color: Colors.lightGray,
  },
  conversationHandle: {
    color: Colors.lightGray,
    fontSize: 15,
    fontFamily: 'Firma-Medium',
  },
});

export default ShareSheet;