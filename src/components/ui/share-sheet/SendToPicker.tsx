/**
 * Send-to picker sheet — child of ShareSheet.
 * Isolated TrueSheet with its own footer (CommentInputFooter) and safe area handling.
 * Presented when user taps "Send" from the main share sheet.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { NativePressable } from '../NativePressable';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  useMeasuredFooterHeight,
  SHEET_SPACING,
} from '../../../utils/components/truesheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/query/queryKeys';
import { chatReactQueryOptions } from '../../../utils/query/chatQueryOptions';
import {
  BORDER_RADIUS,
  ICON_SIZES,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { useProfile } from '../../../services/data/ProfileService';
import { useUserSearchTrigger } from '../usersearch';
import CommentInputFooter from '../../features/comments/CommentInputFooter';
import { ActorService } from '../../../services/api/actor/ActorService';
import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useUserStore } from '../../../stores/userStore';
import { Colors } from '../UI';
import AuthorItem from '../AuthorItem';
import Icon from '../Icon';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import type { ProfileViewBasic } from '../../../services/api/types';
import type { ConvoView } from '../../../services/api/types';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { authorListRowStyle } from '../ItemStyles';

const SHEET_NAME = 'share-sheet-send-to';
const MAX_MESSAGE_LENGTH = 300;

const canBeMessaged = (profile: ProfileViewBasic): boolean => {
  const allowIncoming = (profile as { associated?: { chat?: { allowIncoming?: string } } })
    ?.associated?.chat?.allowIncoming;
  switch (allowIncoming) {
    case 'none':
      return false;
    case 'all':
      return true;
    case 'following':
    case undefined:
      return Boolean((profile as { viewer?: { followedBy?: string } })?.viewer?.followedBy);
    default:
      return false;
  }
};

export interface SendToPickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSent: () => void;
  postUri: string;
  postCid?: string;
  currentUserDid: string;
}

const SendToPicker: React.FC<SendToPickerProps> = ({
  visible,
  onDismiss,
  onSent,
  postUri,
  postCid,
  currentUserDid,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [sendMessageText, setSendMessageText] = useState('');
  const [sendMessageInputSelection, setSendMessageInputSelection] = useState({
    start: 0,
    end: 0,
  });
  const [selectedRecipientKey, setSelectedRecipientKey] = useState<string | null>(null);
  const [selectedRecipientItem, setSelectedRecipientItem] = useState<
    ConvoView | ProfileViewBasic | null
  >(null);
  const [isSending, setIsSending] = useState(false);
  const searchInputRef = useRef<TextInput | null>(null);
  const messageInputRef = useRef<TextInput | null>(null);
  const [isSheetPresented, setIsSheetPresented] = useState(false);

  const footerFallbackHeight = 96;
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(footerFallbackHeight);

  const currentUserHandle = useUserStore(s => s.currentUser?.handle ?? null);
  const { data: currentUserProfile } = useProfile(currentUserHandle);
  const { inputProps: messageMentionInputProps, userSearchModalProps: messageUserSearchProps } =
    useUserSearchTrigger({
      value: sendMessageText,
      selection: sendMessageInputSelection,
      onChangeText: setSendMessageText,
      onSelectionChange: e => setSendMessageInputSelection(e.nativeEvent.selection),
    });

  const { data: conversationsData, isLoading: conversationsLoading } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: async ({ pageParam }) => ChatService.listConvos(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    enabled: visible,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    ...chatReactQueryOptions,
  });

  const conversations = useMemo(
    () =>
      (conversationsData?.pages ?? []).flatMap(
        p => (p as { conversations?: ConvoView[] })?.conversations ?? []
      ),
    [conversationsData?.pages]
  );

  const {
    data: searchData,
    fetchNextPage: fetchMoreProfiles,
    hasNextPage: hasMoreProfiles,
  } = useInfiniteQuery({
    queryKey: queryKeys.search.profiles(searchQuery),
    queryFn: async ({ pageParam }) => {
      return ActorService.searchProfilesPaginated(searchQuery, pageParam as string | null);
    },
    getNextPageParam: lastPage => lastPage?.cursor ?? null,
    initialPageParam: null as string | null,
    enabled: visible && searchQuery.trim().length > 0,
  });

  const searchResults = useMemo(() => {
    if (!searchData?.pages) return [];
    return searchData.pages.flatMap(page => page.profiles ?? []);
  }, [searchData]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const conversationMatches = conversations.filter((c: ConvoView) => {
      const otherMember = c.members?.find(m => m.did !== currentUserDid) ?? c.members?.[0];
      const name = (otherMember as { displayName?: string })?.displayName ?? '';
      const handle = (otherMember as { handle?: string })?.handle ?? '';
      const q = searchQuery.toLowerCase();
      return name.toLowerCase().includes(q) || handle.toLowerCase().includes(q);
    });
    const conversationDids = new Set(conversations.flatMap(c => c.members?.map(m => m.did) ?? []));
    const newProfiles = searchResults
      .filter(p => !conversationDids.has(p.did))
      .sort((_a, b) => (canBeMessaged(b) ? 1 : -1));
    return [...conversationMatches, ...newProfiles];
  }, [conversations, currentUserDid, searchQuery, searchResults]);

  // Control TrueSheet visibility via instance ref (TrueSheet v3+)
  // Do not auto-focus search: opening the keyboard would move the list up. User can tap search to focus.
  useEffect(() => {
    if (visible) {
      if (!isSheetPresented) {
        TrueSheet.present(SHEET_NAME).catch(() => {});
      }
    } else if (isSheetPresented) {
      TrueSheet.dismiss(SHEET_NAME).catch(() => {});
    }
  }, [visible, isSheetPresented]);

  const handleDismiss = useCallback(() => {
    setIsSheetPresented(false);
    setSearchQuery('');
    setSendMessageText('');
    setSelectedRecipientKey(null);
    setSelectedRecipientItem(null);
    onDismiss();
  }, [onDismiss]);

  const getPickerItemKey = useCallback((item: ConvoView | ProfileViewBasic, idx: number) => {
    if ('id' in item && typeof (item as ConvoView).id === 'string') {
      return `convo-${(item as ConvoView).id}-${idx}`;
    }
    const p = item as ProfileViewBasic;
    const base = p.did || p.handle || `search`;
    return `profile-${base}-${idx}`;
  }, []);

  const currentUser = useUserStore(s => s.currentUser);

  const renderConversationItem = useCallback(
    ({ item, index }: { item: ConvoView | ProfileViewBasic; index: number }) => {
      const itemIsConversation = 'id' in item && typeof (item as ConvoView).id === 'string';
      const profile: ProfileViewBasic = itemIsConversation
        ? (((item as ConvoView).members?.find(m => m.did !== currentUserDid) ??
            (item as ConvoView).members?.[0]) as ProfileViewBasic)
        : (item as ProfileViewBasic);

      const isDisabled = !itemIsConversation && !canBeMessaged(item as ProfileViewBasic);
      const key = getPickerItemKey(item, index);
      const isSelected = selectedRecipientKey === key;
      const isCurrentUserProfile = isCurrentUser(profile.did, profile.handle, currentUser);

      const handlePress = () => {
        if (isDisabled) return;
        if (isSelected) {
          setSelectedRecipientKey(null);
          setSelectedRecipientItem(null);
          return;
        }
        setSelectedRecipientKey(key);
        setSelectedRecipientItem(item);
      };

      return (
        <View style={[styles.userItemContainer, isDisabled && styles.disabledItem]}>
          <AuthorItem
            handle={profile.handle ?? ''}
            did={profile.did}
            displayName={profile.displayName}
            avatar={profile.avatar}
            size="large"
            showArrow={false}
            showFollowButton={false}
            showCheckmark={isSelected && !isCurrentUserProfile}
            showCheckmarkSkeleton={!isSelected && !isCurrentUserProfile && !isDisabled}
            backgroundColor={Colors.transparent}
            textColor={Colors.neutral[50]}
            nameFontWeight="Figtree-SemiBold"
            customFontSize={16}
            style={[styles.authorItem, authorListRowStyle]}
            onPress={handlePress}
          />
        </View>
      );
    },
    [currentUserDid, getPickerItemKey, selectedRecipientKey, currentUser]
  );

  const handleSendToConversation = useCallback(
    async (item: ConvoView | ProfileViewBasic) => {
      if (isSending) return;
      const isConversation = 'id' in item && typeof (item as ConvoView).id === 'string';

      setIsSending(true);
      try {
        let cid = postCid;
        if (!cid) {
          try {
            const post = await AtprotoFeedService.getPost(postUri);
            cid = post?.cid ?? '';
          } catch {
            cid = '';
          }
        }

        if (!cid) {
          Alert.alert(t('common.error'), t('chat.unableToSendMissingInfo'));
          return;
        }

        let conversationId: string;
        if (isConversation) {
          conversationId = (item as ConvoView).id;
        } else {
          const otherDid = (item as ProfileViewBasic).did;
          const convo = await ChatService.getConvoForMembers([currentUserDid, otherDid].sort());
          if (!convo) {
            Alert.alert(t('common.error'), t('chat.couldNotStartConversation'));
            return;
          }
          conversationId = convo.id;
        }

        const messageText = sendMessageText.trim();
        await ChatService.sendMessage(conversationId, {
          text: messageText,
          embed: {
            $type: 'app.bsky.embed.record',
            record: { uri: postUri, cid },
          },
        });

        setSendMessageText('');
        setSelectedRecipientKey(null);
        setSelectedRecipientItem(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.all });
        handleDismiss();
        onSent();
      } catch (_error: unknown) {
        const msg = _error instanceof Error ? _error.message : t('errors.failedTryAgain');
        Alert.alert(t('common.error'), msg);
      } finally {
        setIsSending(false);
      }
    },
    [
      isSending,
      postUri,
      postCid,
      currentUserDid,
      sendMessageText,
      handleDismiss,
      onSent,
      queryClient,
      t,
    ]
  );

  const handleSubmitSend = useCallback(() => {
    if (!selectedRecipientItem) return;
    handleSendToConversation(selectedRecipientItem);
  }, [handleSendToConversation, selectedRecipientItem]);

  const trimmedSearch = searchQuery.trim();
  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <Icon name="search" size={ICON_SIZES.LARGE} color={Colors.neutral[200]} />
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('chat.searchPeople')}
          placeholderTextColor={Colors.neutral[500]}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          autoComplete="off"
          textContentType="none"
        />
        <View style={styles.clearSlot}>
          {trimmedSearch.length > 0 ? (
            <NativePressable
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.clearButton}
              android_ripple={{ color: Colors.overlay.white10 }}
              accessibilityRole="button"
              accessibilityLabel={t('comments.clearSearch')}
            >
              <Icon name="close-circle" size={22.5} color={Colors.neutral[200]} />
            </NativePressable>
          ) : (
            <View style={styles.clearButtonPlaceholder} />
          )}
        </View>
      </View>
    </View>
  );

  const footer = wrapFooter(
    <CommentInputFooter
      value={sendMessageText}
      onChangeText={setSendMessageText}
      inputSelection={sendMessageInputSelection}
      onSelectionChange={e => setSendMessageInputSelection(e.nativeEvent.selection)}
      placeholder={t('chat.addMessageOptional')}
      onSubmit={handleSubmitSend}
      showAvatar={false}
      showSendWhenEmpty={true}
      isSubmitDisabled={!selectedRecipientItem}
      submitAccessibilityLabel={t('share.send')}
      isPosting={isSending}
      maxLength={MAX_MESSAGE_LENGTH}
      inputRef={messageInputRef}
      currentUserAvatar={currentUserProfile?.avatar}
      userSearchModalProps={messageUserSearchProps}
      mentionInputProps={messageMentionInputProps}
    />
  );

  return (
    <AppTrueSheet
      name={SHEET_NAME}
      variant="sendToPicker"
      onDidPresent={() => setIsSheetPresented(true)}
      onDidDismiss={handleDismiss}
      header={header}
      footer={footer}
      style={styles.sheet}
      scrollable={true}
    >
      <View style={styles.content}>
        {conversationsLoading ? (
          <View style={styles.pickerLoadingContainer}>
            <ActivityIndicator size="large" color={Colors.neutral[50]} />
          </View>
        ) : (
          <View style={styles.pickerListWrap}>
            <FlatList
              style={styles.pickerList}
              data={filteredConversations}
              keyExtractor={(item, idx) => getPickerItemKey(item, idx)}
              showsVerticalScrollIndicator={
                filteredConversations.length >= SCROLL_INDICATOR_CONSTANTS.SEND_TO_PICKER_MIN_ITEMS
              }
              renderItem={renderConversationItem}
              contentContainerStyle={[
                styles.conversationList,
                {
                  paddingBottom:
                    contentBottomPadding + (typeof insets?.bottom === 'number' ? insets.bottom : 0),
                },
                filteredConversations.length === 0 && styles.conversationListEmpty,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onEndReached={() => {
                if (searchQuery.trim() && hasMoreProfiles && !conversationsLoading) {
                  fetchMoreProfiles();
                }
              }}
              onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
              ListEmptyComponent={
                <View style={styles.pickerEmptyContainer}>
                  <Text style={styles.pickerEmptyText}>{t('chat.noResults')}</Text>
                </View>
              }
            />
          </View>
        )}
      </View>
    </AppTrueSheet>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    backgroundColor: Colors.neutral[975],
    paddingHorizontal: SHEET_SPACING.mediaPickerHorizontal,
    paddingTop: 18,
    paddingBottom: 6,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.neutral[800],
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[700],
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingVertical: 11,
    minHeight: 46,
    boxShadow: '0 1px 6px rgba(5,7,10,0.25)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.title,
    height: Typography.lineHeights.title,
    padding: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
    }),
  },
  clearSlot: {
    marginLeft: 8,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.FULL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonPlaceholder: {
    width: 28,
    height: 28,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  pickerListWrap: {
    flex: 1,
    minHeight: 0,
  },
  pickerList: {
    flex: 1,
  },
  pickerLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  pickerEmptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  pickerEmptyText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.medium,
  },
  conversationList: {
    paddingTop: 4,
    paddingBottom: SHEET_SPACING.headerBottom,
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  conversationListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorItem: {
    flex: 1,
  },
  disabledItem: {
    opacity: 0.5,
  },
});

export default SendToPicker;
