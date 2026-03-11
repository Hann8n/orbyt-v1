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
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  DEFAULT_HEADER_STYLE,
  useMeasuredFooterHeight,
  FOOTER_BOTTOM_PADDING_MIN,
} from '../../../utils/components/truesheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/query/queryKeys';
import { BORDER_RADIUS, QUERY_CONSTANTS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import { useProfile } from '../../../services/data/ProfileService';
import { getProfileColors } from '../../../utils/formatting/colors';
import { useUserSearchTrigger } from '../usersearch';
import CommentInputFooter from '../../features/comments/CommentInputFooter';
import AtprotoService from '../../../services/api/AtprotoService';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useUserStore } from '../../../stores/userStore';
import { Colors, Avatar } from '../UI';
import CloseButton from '../CloseButton';
import Icon from '../Icon';
import type { ProfileViewBasic } from '../../../services/api/types';
import type { ConvoView } from '../../../services/api/types';

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

const ConversationItem: React.FC<{
  profile: ProfileViewBasic;
  isDisabled: boolean;
  isSelected: boolean;
  onPress: () => void;
}> = ({ profile, isDisabled, isSelected, onPress }) => {
  const { data: profileData } = useProfile(profile?.handle);
  const profileColors = getProfileColors(profileData);

  return (
    <Pressable
      style={[
        styles.conversationItem,
        isSelected && styles.conversationItemSelected,
        isDisabled && styles.disabledItem,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      <View style={styles.conversationAvatarWrap}>
        <Avatar
          uri={profile.avatar}
          type="profile"
          size={55}
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
          style={styles.conversationAvatar}
        />
      </View>
      <View style={styles.conversationInfo}>
        <Text
          style={[styles.conversationName, isDisabled && styles.disabledText]}
          numberOfLines={1}
        >
          {formatHandle(profile.handle) || 'user'}
        </Text>
      </View>
      <View style={[styles.selectorBox, isSelected && styles.selectorBoxSelected]}>
        {isSelected && <Icon name="checkmark" size={16} color={Colors.black} />}
      </View>
    </Pressable>
  );
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
  const sheetRef = useRef<TrueSheet>(null);

  const footerBottomPadding = Math.max(insets.bottom, FOOTER_BOTTOM_PADDING_MIN);
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
      return AtprotoService.searchProfilesPaginated(searchQuery, pageParam as string | null);
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
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (visible) {
      sheet.present().catch(() => {});
      searchInputRef.current?.focus();
    } else {
      sheet.dismiss().catch(() => {});
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
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

      return (
        <ConversationItem
          profile={profile}
          isDisabled={isDisabled}
          isSelected={isSelected}
          onPress={() => {
            if (isDisabled) return;
            if (isSelected) {
              setSelectedRecipientKey(null);
              setSelectedRecipientItem(null);
              return;
            }
            setSelectedRecipientKey(key);
            setSelectedRecipientItem(item);
          }}
        />
      );
    },
    [currentUserDid, getPickerItemKey, selectedRecipientKey]
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
            const post = await AtprotoService.getPost(postUri);
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

  const header = (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {t('share.sendTo')}
      </Text>
      <CloseButton onPress={onDismiss} />
    </View>
  );

  const footer = wrapFooter(
    <View style={styles.footerWrapper}>
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
        safeAreaBottom={footerBottomPadding}
      />
    </View>
  );

  return (
    <AppTrueSheet
      ref={sheetRef}
      name={SHEET_NAME}
      variant="sendToPicker"
      onDidDismiss={handleDismiss}
      header={header}
      footer={footer}
      style={styles.sheet}
      scrollable={true}
    >
      <View style={styles.content}>
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('chat.searchPeople')}
          placeholderTextColor={Colors.neutral[400]}
          style={styles.searchInput}
          autoComplete="off"
          textContentType="none"
        />
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
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.conversationDivider} />}
              renderItem={renderConversationItem}
              contentContainerStyle={[
                styles.conversationList,
                { paddingBottom: contentBottomPadding },
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...DEFAULT_HEADER_STYLE,
  },
  headerTitle: {
    color: Colors.neutral[50],
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Figtree-Bold',
    flex: 1,
  },
  footerWrapper: {
    backgroundColor: Colors.black,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
  },
  searchInput: {
    marginBottom: 16,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.neutral[800],
    color: Colors.neutral[50],
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Figtree-Medium',
    fontSize: 16,
    borderWidth: 0,
    textAlign: 'left',
    textAlignVertical: 'center',
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
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  conversationList: {
    paddingTop: 4,
    paddingBottom: 20,
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  conversationListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  conversationItemSelected: {
    opacity: 0.92,
  },
  conversationAvatarWrap: {
    width: 55,
    height: 55,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 12,
    overflow: 'hidden',
  },
  conversationAvatar: {
    width: '100%',
    height: '100%',
  },
  conversationDivider: {
    height: 1,
    backgroundColor: Colors.neutral[900],
    marginLeft: 67,
    marginRight: 0,
  },
  disabledItem: {
    opacity: 0.5,
  },
  conversationInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    justifyContent: 'center',
  },
  selectorBox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorBoxSelected: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[50],
  },
  conversationName: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-Black',
    marginBottom: 2,
  },
  disabledText: {
    color: Colors.neutral[500],
  },
});

export default SendToPicker;
