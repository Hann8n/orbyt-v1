/**
 * Send-to picker sheet — child of ShareSheet.
 * Isolated TrueSheet with its own footer (CommentInputFooter) and safe area handling.
 * Presented when user taps "Send" from the main share sheet.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativePressable } from '../NativePressable';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  AppTrueSheet,
  DEFAULT_CONTENT_PADDING_HORIZONTAL,
  useMeasuredFooterHeight,
  SHEET_SPACING,
} from '../../../utils/components/truesheet';
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../utils/query/queryKeys';
import { chatReactQueryOptions } from '../../../utils/query/chatQueryOptions';
import {
  BORDER_RADIUS,
  ICON_SIZES,
  QUERY_CONSTANTS,
  SCROLL_INDICATOR_CONSTANTS,
} from '../../../utils/constants';
import { useProfileByDid } from '../../../services/data/ProfileService';
import CommentInputFooter from '../../features/comments/CommentInputFooter';
import { AtprotoFeedService } from '../../../services/api/feed/FeedService';
import { ChatService } from '../../../services/api/chat/ChatService';
import { useUserStore } from '../../../stores/userStore';
import { Colors } from '../UI';
import AuthorItem from '../AuthorItem';
import { isCurrentUser } from '../../../stores/profileInteractionStore';
import { formatHandle } from '../../../utils/formatting/handles';
import { exploreScreenStyles } from '../../features/explore/ExploreScreenStyles';
import { Shadows } from '../../../theme';
import { androidTextFix } from '../../../utils/styling/platformText';
import Icon from '../Icon';
import type { ProfileViewBasic } from '../../../services/api/types';
import type { ConvoView } from '../../../services/api/types';
import { FontFamily, Typography } from '../../../utils/components/typography';

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

  const footerFallbackHeight = 96;
  const [contentBottomPadding, wrapFooter] = useMeasuredFooterHeight(footerFallbackHeight);

  const { data: currentUserProfile } = useProfileByDid(currentUserDid);

  const { data: conversationsData, isLoading: conversationsLoading } = useInfiniteQuery({
    queryKey: queryKeys.chat.conversations.list(),
    queryFn: async ({ pageParam }) => ChatService.listConvos(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage?.cursor ?? undefined,
    enabled: visible,
    staleTime: QUERY_CONSTANTS.STALE_TIME_SHORT,
    ...chatReactQueryOptions,
  });

  const conversations = (conversationsData?.pages ?? []).flatMap(
    p => (p as { conversations?: ConvoView[] })?.conversations ?? []
  );

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c: ConvoView) => {
        const other = c.members?.find(m => m.did !== currentUserDid) ?? c.members?.[0];
        const name = (other as { displayName?: string })?.displayName?.toLowerCase() ?? '';
        const handle = (other as { handle?: string })?.handle?.toLowerCase() ?? '';
        const q = searchQuery.toLowerCase();
        return name.includes(q) || handle.includes(q);
      })
    : conversations;

  // Control TrueSheet visibility via global static methods (TrueSheet v3+).
  useEffect(() => {
    if (visible) TrueSheet.present(SHEET_NAME).catch(() => {});
    else TrueSheet.dismiss(SHEET_NAME).catch(() => {});
  }, [visible]);

  const handleDismiss = () => {
    setSearchQuery('');
    setSendMessageText('');
    setSelectedRecipientKey(null);
    setSelectedRecipientItem(null);
    onDismiss();
  };

  const getPickerItemKey = (item: ConvoView | ProfileViewBasic) => {
    if ('id' in item && typeof (item as ConvoView).id === 'string') {
      return `convo-${(item as ConvoView).id}`;
    }
    const p = item as ProfileViewBasic;
    return `profile-${p.did || p.handle || 'search'}`;
  };

  const currentUser = useUserStore(s => s.currentUser);

  const renderConversationItem = ({ item }: { item: ConvoView | ProfileViewBasic }) => {
    const itemIsConversation = 'id' in item && typeof (item as ConvoView).id === 'string';
    const profile: ProfileViewBasic = itemIsConversation
      ? (((item as ConvoView).members?.find(m => m.did !== currentUserDid) ??
          (item as ConvoView).members?.[0]) as ProfileViewBasic)
      : (item as ProfileViewBasic);

    const isDisabled = !itemIsConversation && !canBeMessaged(item as ProfileViewBasic);
    const key = getPickerItemKey(item);
    const isSelected = selectedRecipientKey === key;
    const isCurrentUserProfile = isCurrentUser(profile.did, profile.handle, currentUser);

    const handleItemPress = () => {
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
          handle={formatHandle(profile.handle ?? '')}
          did={profile.did}
          displayName={formatHandle(profile.handle ?? '')}
          avatar={profile.avatar}
          size="large"
          showArrow={false}
          showFollowButton={false}
          showCheckmark={isSelected && !isCurrentUserProfile}
          showCheckmarkSkeleton={!isSelected && !isCurrentUserProfile && !isDisabled}
          backgroundColor={Colors.transparent}
          textColor={Colors.neutral[50]}
          nameFontWeight="Figtree-Bold"
          style={exploreScreenStyles.authorItemStyle}
          onPress={handleItemPress}
        />
      </View>
    );
  };

  const handleSendToConversation = async (item: ConvoView | ProfileViewBasic) => {
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
  };

  const handleSubmitSend = () => {
    if (!selectedRecipientItem) return;
    handleSendToConversation(selectedRecipientItem);
  };

  const header = (
    <View style={styles.searchHeader}>
      <View style={styles.searchRow}>
        <Icon
          name="search"
          size={ICON_SIZES.LARGE}
          color={Colors.neutral[400]}
          style={styles.searchIcon}
        />
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('chat.searchPeople')}
          placeholderTextColor={Colors.neutral[500]}
          style={styles.searchInput}
          autoCorrect={true}
          autoCapitalize="none"
          returnKeyType="search"
          autoComplete="off"
          textContentType="none"
          keyboardAppearance="dark"
        />
        {searchQuery.length > 0 && (
          <NativePressable
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={exploreScreenStyles.clearButton}
            accessibilityRole="button"
            accessibilityLabel={t('comments.clearSearch')}
          >
            <Icon name="close-circle" size={22.5} color={Colors.neutral[400]} />
          </NativePressable>
        )}
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
    />
  );

  return (
    <AppTrueSheet
      name={SHEET_NAME}
      variant="sendToPicker"
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
              keyExtractor={item => getPickerItemKey(item)}
              showsVerticalScrollIndicator={
                filteredConversations.length >= SCROLL_INDICATOR_CONSTANTS.SEND_TO_PICKER_MIN_ITEMS
              }
              renderItem={renderConversationItem}
              contentContainerStyle={[
                styles.conversationList,
                { paddingBottom: contentBottomPadding },
                filteredConversations.length === 0 && styles.conversationListEmpty,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
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
  searchHeader: {
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
    paddingVertical: 10,
    minHeight: 44,
    ...Shadows.small,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: Colors.neutral[50],
    fontFamily: Typography.families.regular,
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
    padding: 0,
    ...androidTextFix,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: DEFAULT_CONTENT_PADDING_HORIZONTAL,
  },
  pickerListWrap: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: -DEFAULT_CONTENT_PADDING_HORIZONTAL,
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
  disabledItem: {
    opacity: 0.5,
  },
});

export default SendToPicker;
