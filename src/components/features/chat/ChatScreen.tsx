import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import type {
  ComposerProps,
  SendProps,
  InputToolbarProps,
  MessageProps,
  DayProps,
} from 'react-native-gifted-chat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated as RNAnimated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { Colors, Avatar } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/formatting/handles';
import Icon, { BackArrowIcon, Loading3FillIcon } from '../../ui/Icon';
import { useChatStore } from '../../../stores/chatStore';
import { ChatMessage } from '../../../utils/chat/helpers';
import { useCurrentUser } from '../../../stores/userStore';
import { useMessageReactions } from '../../../hooks/useMessageReactions';
import ChatService, { ReactionView } from '../../../services/ChatService';
import { AtprotoService } from '../../../services/api/AtprotoService';
import MessageReactions from './MessageReactions';
import ChatActionsSheet from './ChatActionsSheet';
import EmbeddedPostCard from './EmbeddedPostCard';
import EmptyFeed from '../feed/EmptyFeed';
import { queryKeys } from '../../../utils/query/queryKeys';

interface ChatScreenProps {
  conversationId: string;
  recipientDid?: string;
}

export default function ChatScreen({
  conversationId,
  recipientDid: _recipientDid,
}: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { getGiftedChatMessages, setMessages: setCachedMessages } = useChatStore();

  // Use existing hook from user store
  const { currentUser } = useCurrentUser();
  const currentUserId = currentUser?.did || '1';
  const isUserReady = true; // Store is always ready

  // Inline emoji reaction state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  // Chat actions sheet state
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  // Track optimistic message ID for error handling
  const optimisticMessageIdRef = useRef<string | null>(null);

  // Dismiss keyboard when screen loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        setTimeout(() => {
          Keyboard.dismiss();
        }, 100);
      };
    }, [])
  );

  // Fetch conversation details
  const {
    data: conversationData,
    isLoading: isLoadingConversation,
    error: _conversationError,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => ChatService.getConversation(conversationId),
    enabled: !!conversationId,
  });

  // Fetch messages for the conversation
  const {
    data: messagesData,
    isLoading,
    error: _error,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: queryKeys.chat.messages.infinite(conversationId),
    queryFn: async () => {
      const result = await ChatService.getMessages(conversationId);
      // Update store cache with fresh messages
      if (result.messages) {
        setCachedMessages(conversationId, result.messages);
      }
      return result;
    },
    refetchInterval: 10000, // Poll every 10 seconds when screen is active
    enabled: !!conversationId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (text: string) =>
      ChatService.sendMessage({
        conversationId: conversationId,
        text,
      }),
    onSuccess: () => {
      // Clear optimistic message ID on success
      optimisticMessageIdRef.current = null;
      // Refetch messages and conversations
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages.byConversation(conversationId),
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.list(),
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.count(),
        refetchType: 'active',
      });
    },
    onError: (_error: any) => {
      // Remove optimistic message on error
      if (optimisticMessageIdRef.current) {
        setMessages(previousMessages =>
          previousMessages.filter(msg => msg._id !== optimisticMessageIdRef.current)
        );
        optimisticMessageIdRef.current = null;
      }
      Alert.alert('Error', 'Failed to send message. Please try again.');
    },
  });

  // Get other user for message conversion
  const otherUser =
    conversationData?.members?.length && currentUserId
      ? conversationData.members.find(member => member.did !== currentUserId)
      : undefined;

  // Use unified reaction handling hook
  const { handleReactionToggle } = useMessageReactions({
    conversationId,
    messages,
    setMessages,
    currentUserId,
    currentUser: currentUser
      ? { handle: currentUser.handle ?? undefined, avatar: currentUser.avatar }
      : undefined,
  });

  // Accept conversation mutation
  const acceptConversationMutation = useMutation({
    mutationFn: () => ChatService.acceptConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.detail(conversationId),
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.list(),
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.count(),
        refetchType: 'active',
      });
    },
    onError: (_error: any) => {
      Alert.alert('Error', 'Failed to accept conversation');
    },
  });

  // Reject/Leave conversation mutation
  const rejectConversationMutation = useMutation({
    mutationFn: () => ChatService.leaveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.list(),
        refetchType: 'active',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations.count(),
        refetchType: 'active',
      });
      router.back();
    },
    onError: (_error: any) => {
      Alert.alert('Error', 'Failed to reject conversation');
    },
  });

  // Get the other user DID from conversation members
  const otherUserDid = useMemo(() => {
    return otherUser?.did;
  }, [otherUser]);

  // Check if current user initiated the conversation by checking if they sent the first message
  const currentUserInitiated = useMemo(() => {
    // Check messages array first
    if (messagesData?.messages && messagesData.messages.length > 0) {
      // Get the oldest message (last in the array since messages are sorted by date desc)
      const oldestMessage = messagesData.messages[messagesData.messages.length - 1];
      return oldestMessage?.senderDid === currentUserId;
    }

    // If no messages in array, check lastMessage from conversation data
    if (conversationData?.lastMessage) {
      const lastMessage = conversationData.lastMessage;
      // Check if lastMessage is a deleted message view
      if ('deleted' in lastMessage && lastMessage.deleted) {
        return false; // Can't determine from deleted message
      }
      // Check sender of last message
      if ('sender' in lastMessage && lastMessage.sender) {
        return lastMessage.sender.did === currentUserId;
      }
    }

    // If no messages at all, assume user is starting a new conversation (they initiated)
    return true;
  }, [conversationData, currentUserId, messagesData]);

  // Fetch profile information for the other user
  const { data: otherUserProfile, isLoading: isLoadingOtherUser } = useQuery({
    queryKey: ['profile', otherUserDid],
    queryFn: () => AtprotoService.getProfile(otherUserDid!),
    enabled:
      !!otherUserDid && !conversationData?.members?.find(m => m.did === otherUserDid)?.displayName,
  });

  // Update messages from store when data changes - store as single source of truth
  useEffect(() => {
    if (
      conversationId &&
      isUserReady &&
      currentUserId &&
      (messagesData?.messages !== undefined || !isLoading)
    ) {
      const giftedMessages = getGiftedChatMessages(
        conversationId,
        currentUserId,
        currentUser?.avatar,
        otherUser
      );
      // Keeping local state in sync with store-derived messages; safe to update when dependencies change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(giftedMessages);
    }
  }, [
    conversationId,
    isUserReady,
    currentUserId,
    messagesData?.messages,
    isLoading,
    getGiftedChatMessages,
    currentUser?.avatar,
    otherUser,
  ]);

  // Memoize messages with embeds for video playlist
  const messagesWithEmbeds = useMemo(() => {
    return messages.filter(m => m.embed?.record).map(m => ({ embed: m.embed }));
  }, [messages]);

  // Mark conversation as read when user views the chat screen
  useEffect(() => {
    if (
      conversationId &&
      isUserReady &&
      messagesData?.messages &&
      messagesData.messages.length > 0
    ) {
      // Mark conversation as read when user opens the chat
      ChatService.markConversationAsRead(conversationId)
        .then(() => {
          // Invalidate conversations cache to update unread counts
          queryClient.invalidateQueries({
            queryKey: queryKeys.chat.conversations.list(),
            refetchType: 'active',
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.chat.conversations.count(),
            refetchType: 'active',
          });
        })
        .catch(_error => {
          // Non-critical operation, just log the error
        });
    }
  }, [conversationId, isUserReady, messagesData?.messages, queryClient]);

  const onSend = useCallback(
    (newMessages: ChatMessage[] = []) => {
      if (newMessages.length > 0) {
        const message = newMessages[0];
        // Store optimistic message ID for error handling
        optimisticMessageIdRef.current = String(message._id);
        // Update messages state directly (modern pattern)
        setMessages(previousMessages => [...newMessages, ...previousMessages]);

        // Send the message via API (fallback to empty string if text is undefined)
        sendMessageMutation.mutate(message.text ?? '');
      }
    },
    [sendMessageMutation]
  );

  // Unified reaction handlers using the hook
  const handleEmojiSelect = useCallback(
    (emoji: string, messageId: string) => {
      handleReactionToggle(emoji, messageId);
      setSelectedMessageId(null); // Hide the emoji bar
    },
    [handleReactionToggle]
  );

  const handleReactionPress = useCallback(
    (messageId: string, emoji: string, _isCurrentUserReacted: boolean) => {
      handleReactionToggle(emoji, messageId);
    },
    [handleReactionToggle]
  );

  // Format date for day separator
  const formatDate = (date: Date) => {
    if (isToday(date)) {
      return 'Today';
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else {
      return format(date, 'EEEE, MMM d');
    }
  };

  const renderComposer = useCallback((props: ComposerProps) => {
    return (
      <View style={styles.inputWrapper}>
        <TextInput
          {...props.textInputProps}
          nativeID="chat-input"
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.gray}
          multiline={true}
          maxLength={1000}
          returnKeyType="default"
          blurOnSubmit={false}
          autoCorrect={true}
          autoCapitalize="sentences"
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          textAlignVertical="top"
          caretHidden={false}
        />
      </View>
    );
  }, []);

  const renderSend = useCallback(
    (props: SendProps) => {
      const hasText = props.text && props.text.trim().length > 0;
      const isDisabled = !hasText || sendMessageMutation.isPending;
      const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

      if (!hasText || isDisabled) return null;

      return (
        <View style={styles.sendColumn}>
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              !useLiquidGlass && styles.sendButtonFallback,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              if (
                props.text &&
                props.text.trim() &&
                !sendMessageMutation.isPending &&
                props.onSend
              ) {
                // Create the message object that GiftedChat expects
                const message: ChatMessage = {
                  _id: Math.random().toString(36).substr(2, 9),
                  text: props.text.trim(),
                  createdAt: new Date(),
                  user: {
                    _id: currentUserId,
                    name: currentUser?.handle || 'You',
                    avatar: currentUser?.avatar,
                  },
                };
                props.onSend([message], true);
              }
            }}
            disabled={isDisabled}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {useLiquidGlass ? (
              <>
                <GlassView
                  style={styles.glassBackground}
                  glassEffectStyle="clear"
                  tintColor="rgba(255, 255, 255, 1)"
                  isInteractive
                />
                <View style={styles.sendButtonContent} pointerEvents="none">
                  {sendMessageMutation.isPending ? (
                    <Loading3FillIcon size={22} color={Colors.black} />
                  ) : (
                    <Icon name="arrow-up-fill" size={22} color={Colors.black} />
                  )}
                </View>
              </>
            ) : (
              <>
                {sendMessageMutation.isPending ? (
                  <Loading3FillIcon size={22} color={Colors.black} />
                ) : (
                  <Icon name="arrow-up-fill" size={22} color={Colors.black} />
                )}
              </>
            )}
          </Pressable>
        </View>
      );
    },
    [currentUserId, currentUser, sendMessageMutation.isPending]
  );

  const renderInputToolbar = useCallback(
    (props: InputToolbarProps) => {
      // Only show accept/reject buttons if conversation status is not "accepted" (using API status directly)
      // AND the current user is the recipient (didn't initiate the conversation)
      const showAcceptReject = conversationData?.status !== 'accepted' && !currentUserInitiated;

      if (showAcceptReject) {
        return (
          <View style={styles.inputToolbar}>
            <View style={styles.actionButtonsContainer}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.rejectButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => rejectConversationMutation.mutate()}
                disabled={
                  rejectConversationMutation.isPending || acceptConversationMutation.isPending
                }
              >
                <View pointerEvents="none">
                  {rejectConversationMutation.isPending ? (
                    <Loading3FillIcon size={20} color={Colors.white} />
                  ) : (
                    <Text style={styles.actionButtonText}>Reject</Text>
                  )}
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.acceptButton,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => acceptConversationMutation.mutate()}
                disabled={
                  rejectConversationMutation.isPending || acceptConversationMutation.isPending
                }
              >
                <View pointerEvents="none">
                  {acceptConversationMutation.isPending ? (
                    <Loading3FillIcon size={20} color={Colors.black} />
                  ) : (
                    <Text style={[styles.actionButtonText, styles.acceptButtonText]}>Accept</Text>
                  )}
                </View>
              </Pressable>
            </View>
          </View>
        );
      }

      return (
        <View style={styles.inputToolbar}>
          <View style={styles.inputToolbarContent}>
            <View style={styles.avatarContainer}>
              <Avatar uri={currentUser?.avatar} type="profile" size={42} style={styles.avatar} />
            </View>
            {props.renderComposer && props.renderComposer(props as any)}
            {props.renderSend && props.renderSend(props)}
          </View>
        </View>
      );
    },
    [
      conversationData?.status,
      currentUserInitiated,
      rejectConversationMutation,
      acceptConversationMutation,
      currentUser?.avatar,
    ]
  );

  const renderAvatar = useCallback(() => null, []);

  // Get the other user (not the current user) from the conversation
  // Prefer conversation members, fallback to profile query
  const otherUserForDisplay = useMemo(() => {
    if (otherUser) return otherUser;

    // If we have profile data from the profile query, use that
    if (otherUserProfile && otherUserDid) {
      return {
        did: otherUserDid,
        handle: otherUserProfile.handle,
        displayName: formatHandle(otherUserProfile.handle) || 'User',
        avatar: otherUserProfile.avatar,
      };
    }

    return null;
  }, [otherUser, otherUserProfile, otherUserDid]);

  const renderDay = useCallback((props: DayProps) => {
    const date = props.createdAt;
    if (!date) return null;

    return (
      <View style={styles.daySeparator}>
        <View style={styles.daySeparatorLine} />
        <Text style={styles.daySeparatorText}>
          {formatDate(date instanceof Date ? date : new Date(date))}
        </Text>
        <View style={styles.daySeparatorLine} />
      </View>
    );
  }, []);

  const renderMessage = useCallback(
    (props: MessageProps<ChatMessage>) => {
      const message = props.currentMessage;
      const hasEmbed = message.embed?.record;
      const isCurrentUser = message.user._id === currentUserId;
      const isSelected = selectedMessageId === String(message._id);

      // For messages with embeds, render custom layout with proper alignment
      if (hasEmbed && message.embed?.record) {
        return (
          <View
            style={[
              styles.embeddedMessageContainer,
              isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft,
            ]}
          >
            {/* Show message text if present */}
            {message.text && (
              <Pressable
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedMessageId(String(message._id));
                }}
                onPress={() => setSelectedMessageId(null)}
                style={[
                  styles.messageBubble,
                  message.user._id === currentUserId ? styles.sentMessage : styles.receivedMessage,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    message.user._id === currentUserId
                      ? styles.sentMessageText
                      : styles.receivedMessageText,
                  ]}
                >
                  {message.text}
                </Text>
              </Pressable>
            )}

            {/* Show embedded post */}
            <View style={styles.embeddedPostContainer}>
              <EmbeddedPostCard
                postUri={message.embed.record.uri}
                postCid={message.embed.record.cid}
                isCurrentUser={isCurrentUser}
                reactions={isSelected ? [] : message.reactions}
                currentUserId={currentUserId}
                messageId={String(message._id)}
                onReactionPress={(emoji, isCurrentUserReacted) =>
                  handleReactionPress(String(message._id), emoji, isCurrentUserReacted)
                }
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedMessageId(String(message._id));
                }}
                conversationMessages={messagesWithEmbeds}
              />
            </View>
            {/* Anchored popover reaction picker below embedded content */}
            {isSelected && (
              <RNAnimated.View
                style={[
                  styles.pickerContainer,
                  isCurrentUser ? styles.inlineEmojiBarRight : styles.inlineEmojiBarLeft,
                ]}
              >
                <View style={styles.inlineEmojiBarContent}>
                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, idx, arr) => {
                    const currentUserReaction = message.reactions?.find(
                      (reaction: ReactionView) =>
                        reaction.value === emoji && reaction.sender.did === currentUserId
                    );
                    const otherUserReaction = message.reactions?.find(
                      (reaction: ReactionView) =>
                        reaction.value === emoji && reaction.sender.did !== currentUserId
                    );
                    const hasCurrentUserReaction = !!currentUserReaction;
                    const hasOtherUserReaction = !!otherUserReaction;

                    return (
                      <Pressable
                        key={emoji}
                        style={[
                          styles.emojiButton,
                          idx === 0 && styles.emojiSegmentFirst,
                          idx > 0 && idx < arr.length - 1 && styles.emojiSegmentMiddle,
                          idx === arr.length - 1 && styles.emojiSegmentLast,
                          hasCurrentUserReaction && styles.emojiButtonSelected,
                          hasOtherUserReaction && styles.emojiButtonOtherUser,
                        ]}
                        onPress={() => handleEmojiSelect(emoji, String(message._id))}
                      >
                        <Text
                          style={[
                            styles.emojiText,
                            hasCurrentUserReaction && styles.emojiTextSelected,
                          ]}
                        >
                          {emoji}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </RNAnimated.View>
            )}

            {/* Reactions moved into EmbeddedPostCard when embed is present */}
          </View>
        );
      }

      // For regular messages without embeds, use default rendering with proper alignment
      return (
        <Pressable
          style={[
            styles.defaultMessageContainer,
            isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft,
          ]}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedMessageId(String(message._id));
          }}
          onPress={() => {
            setSelectedMessageId(null);
          }}
        >
          <View
            style={[
              styles.messageBubble,
              message.user._id === currentUserId ? styles.sentMessage : styles.receivedMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                message.user._id === currentUserId
                  ? styles.sentMessageText
                  : styles.receivedMessageText,
              ]}
            >
              {message.text}
            </Text>
          </View>
          {/* Anchored popover reaction picker below message bubble */}
          {isSelected && (
            <RNAnimated.View
              style={[
                styles.pickerContainer,
                isCurrentUser ? styles.inlineEmojiBarRight : styles.inlineEmojiBarLeft,
              ]}
            >
              <View style={styles.inlineEmojiBarContent}>
                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, idx, arr) => {
                  const currentUserReaction = message.reactions?.find(
                    (reaction: ReactionView) =>
                      reaction.value === emoji && reaction.sender.did === currentUserId
                  );
                  const otherUserReaction = message.reactions?.find(
                    (reaction: ReactionView) =>
                      reaction.value === emoji && reaction.sender.did !== currentUserId
                  );
                  const hasCurrentUserReaction = !!currentUserReaction;
                  const hasOtherUserReaction = !!otherUserReaction;

                  return (
                    <Pressable
                      key={emoji}
                      style={({ pressed }) => [
                        styles.emojiButton,
                        idx === 0 && styles.emojiSegmentFirst,
                        idx > 0 && idx < arr.length - 1 && styles.emojiSegmentMiddle,
                        idx === arr.length - 1 && styles.emojiSegmentLast,
                        hasCurrentUserReaction && styles.emojiButtonSelected,
                        hasOtherUserReaction && styles.emojiButtonOtherUser,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => handleEmojiSelect(emoji, String(message._id))}
                    >
                      <Text
                        style={[
                          styles.emojiText,
                          hasCurrentUserReaction && styles.emojiTextSelected,
                        ]}
                      >
                        {emoji}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </RNAnimated.View>
          )}

          {/* Show reactions if present */}
          {!isSelected && message.reactions && message.reactions.length > 0 && (
            <MessageReactions
              messageId={String(message._id)}
              reactions={message.reactions}
              currentUserId={currentUserId}
              onReactionPress={(emoji, isCurrentUserReacted) =>
                handleReactionPress(String(message._id), emoji, isCurrentUserReacted)
              }
            />
          )}
        </Pressable>
      );
    },
    [currentUserId, selectedMessageId, handleEmojiSelect, handleReactionPress, messagesWithEmbeds]
  );

  // Memoize user object for GiftedChat
  const giftedChatUser = useMemo(
    () => ({
      _id: currentUserId,
      name: currentUser?.handle || 'You',
      avatar: currentUser?.avatar,
    }),
    [currentUserId, currentUser?.handle, currentUser?.avatar]
  );

  if (isLoading || isLoadingConversation || isLoadingOtherUser || !isUserReady) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
          <View />
        </SafeAreaView>
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.white} />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
        <SafeAreaView style={styles.safeAreaBottom} edges={['bottom']}>
          <View />
        </SafeAreaView>
      </View>
    );
  }

  if (_error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <EmptyFeed
            type="no-connection"
            message="can't connect to chats"
            onRetry={() => refetchMessages()}
          />
        </View>
      </View>
    );
  }

  // Calculate header height for keyboard offset
  const headerHeight = 60; // Approximate header height

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
        <View />
      </SafeAreaView>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight - insets.bottom : 0}
        enabled={true}
      >
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <View style={styles.headerContent}>
            <Pressable
              style={styles.backButton}
              onPress={() => {
                // Dismiss keyboard first, then navigate after a brief delay
                Keyboard.dismiss();
                setTimeout(() => {
                  router.back();
                }, 150);
              }}
            >
              <BackArrowIcon size={28} color={Colors.white} />
            </Pressable>

            {otherUserForDisplay ? (
              <>
                <View style={styles.headerCenter}>
                  <Pressable
                    style={styles.headerUserInfo}
                    onPress={() => router.push(`/profile/${otherUserForDisplay.did}`)}
                  >
                    <Avatar
                      uri={otherUserForDisplay.avatar}
                      type="profile"
                      size={45}
                      showRing={true}
                      style={styles.headerAvatar}
                    />
                    <Text style={styles.headerDisplayName} numberOfLines={1}>
                      {formatHandle(otherUserForDisplay.handle) || 'User'}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.headerActions}>
                  <Pressable
                    style={styles.headerActionButton}
                    onPress={() => setShowActionsSheet(true)}
                  >
                    <Icon name="more-fill" size={24} color={Colors.white} />
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.headerCenter}>
                <View style={styles.headerUserInfo}>
                  <View style={styles.headerAvatarPlaceholder} />
                  <View style={styles.headerTextPlaceholder}>
                    <View style={styles.headerNamePlaceholder} />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={giftedChatUser}
          renderSend={renderSend}
          renderMessage={renderMessage}
          renderComposer={renderComposer}
          renderInputToolbar={renderInputToolbar}
          renderAvatar={renderAvatar}
          renderDay={renderDay}
          scrollToBottomComponent={() => (
            <View style={styles.scrollToBottomButton}>
              <Icon name="chevron-down" size={16} color={Colors.white} />
            </View>
          )}
          minInputToolbarHeight={50}
          maxComposerHeight={120}
          minComposerHeight={42}
          messagesContainerStyle={styles.messagesContainer}
          scrollToBottomStyle={styles.scrollToBottomContainer}
          listProps={{
            keyboardShouldPersistTaps: 'handled',
            keyboardDismissMode: 'on-drag',
          }}
          keyboardAvoidingViewProps={undefined}
          onPressAvatar={() => {
            // Dismiss emoji bar when tapping avatar
            setSelectedMessageId(null);
          }}
        />

        {/* Chat Actions Sheet */}
        <ChatActionsSheet
          visible={showActionsSheet}
          onDismiss={() => setShowActionsSheet(false)}
          conversationId={conversationId}
          otherUserDid={otherUserDid}
        />
      </KeyboardAvoidingView>
      <SafeAreaView style={styles.safeAreaBottom} edges={['bottom']}>
        <View />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  safeAreaTop: {
    backgroundColor: Colors.black,
  },
  safeAreaBottom: {
    backgroundColor: Colors.black,
  },
  keyboardContainer: {
    flex: 1,
  },
  chatHeader: {
    backgroundColor: Colors.black,
    borderBottomWidth: 0,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.darkGray,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerUserInfo: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  headerAvatar: {
    marginBottom: 0,
  },
  headerAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.FULL,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  headerDisplayName: {
    fontSize: 16,
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.darkGray,
  },
  headerTextPlaceholder: {
    marginLeft: 12,
  },
  headerNamePlaceholder: {
    width: 120,
    height: 16,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    color: Colors.lightGray,
    marginTop: 20,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    padding: 20,
  },
  messagesContainer: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  daySeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 8,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.gray,
    opacity: 0.3,
  },
  daySeparatorText: {
    fontSize: 12,
    fontFamily: 'Firma-Medium',
    color: Colors.gray,
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputToolbar: {
    backgroundColor: Colors.black,
    borderTopWidth: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    marginTop: 0,
  },
  inputToolbarContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  avatarContainer: {
    marginRight: 12,
    marginTop: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 0,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
  },
  textInput: {
    backgroundColor: 'transparent',
    color: Colors.white,
    borderColor: 'transparent',
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingRight: 0,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 0,
    textAlignVertical: 'top',
    fontFamily: 'Firma-Regular',
    fontSize: 18,
    lineHeight: 24,
  },
  sendColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 10,
    elevation: 10,
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.FULL,
    width: 42,
    height: 42,
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 0,
    zIndex: 11,
    elevation: 11,
    overflow: 'hidden',
  },
  sendButtonFallback: {
    backgroundColor: Colors.lightGray,
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  sendButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonInactive: {
    opacity: 0.5,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  scrollToBottomContainer: {
    backgroundColor: Colors.blue,
    borderRadius: BORDER_RADIUS.FULL,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginRight: 16,
  },
  scrollToBottomButton: {
    backgroundColor: 'transparent',
  },
  inlineEmojiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 28,
    marginBottom: 8,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  pickerContainer: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  inlineEmojiBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 2,
    paddingVertical: 2,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  popoverTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'center',
  },
  popoverTailLeft: {
    marginLeft: 12,
  },
  popoverTailRight: {
    marginRight: 12,
    alignSelf: 'flex-end',
  },
  inlineEmojiBarLeft: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
  },
  inlineEmojiBarRight: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  emojiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
    minHeight: 28,
    minWidth: 28,
  },
  emojiSegmentFirst: {
    borderTopLeftRadius: BORDER_RADIUS.FULL,
    borderBottomLeftRadius: BORDER_RADIUS.FULL,
  },
  emojiSegmentMiddle: {
    // No special styling for middle segments
  },
  emojiSegmentLast: {
    borderTopRightRadius: BORDER_RADIUS.FULL,
    borderBottomRightRadius: BORDER_RADIUS.FULL,
  },
  emojiButtonSelected: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.18)',
  },
  emojiButtonOtherUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  emojiText: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 20,
  },
  emojiTextSelected: {
    // Keep default text styling for selected state
  },
  // Embedded message styles
  embeddedMessageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  defaultMessageContainer: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  messageContainerLeft: {
    alignItems: 'flex-start',
  },
  messageContainerRight: {
    alignItems: 'flex-end',
  },
  embeddedPostContainer: {
    marginTop: 8,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.MEDIUM,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  sentMessage: {
    backgroundColor: Colors.blurple,
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    backgroundColor: Colors.darkGray,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentMessageText: {
    color: Colors.white,
  },
  receivedMessageText: {
    color: Colors.white,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: BORDER_RADIUS.FULL,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.darkGray,
  },
  rejectButton: {
    backgroundColor: Colors.darkGray,
  },
  acceptButton: {
    backgroundColor: Colors.green,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
    color: Colors.white,
  },
  acceptButtonText: {
    color: Colors.black,
  },
});
