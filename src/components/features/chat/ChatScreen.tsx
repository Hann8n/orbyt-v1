import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, Keyboard, InteractionManager } from 'react-native';
import { LegendList } from '@legendapp/list';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday, parseISO, isSameDay } from 'date-fns';

import { Colors, Avatar } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/helpers';
import Icon, { BackArrowIcon, Loading3FillIcon } from '../../ui/Icon';
import { Conversation, Message } from '../../../services/ChatService';
import { useChatStore } from '../../../stores/chatStore';
import { useCurrentUser } from '../../../stores/userStore';
import { useMessageReactions } from '../../../hooks/useMessageReactions';
import ChatService from '../../../services/ChatService';
import { AtprotoService } from '../../../services/api/AtprotoService';
import MessageReactions from './MessageReactions';
import ChatActionsSheet from './ChatActionsSheet';
import EmbeddedPostCard from './EmbeddedPostCard';

interface ChatScreenProps {
  conversationId: string;
  recipientDid?: string;
}

export default function ChatScreen({ conversationId, recipientDid }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { getMessages, setMessages: setCachedMessages } = useChatStore();
  const newMessageIdsRef = useRef<Set<string>>(new Set());
  
  // Use existing hook from user store
  const { currentUser } = useCurrentUser();
  const currentUserId = currentUser?.did || '1';
  const isUserReady = true; // Store is always ready
  
  // Inline emoji reaction state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Chat actions sheet state
  const [showActionsSheet, setShowActionsSheet] = useState(false);

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
    error: conversationError,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => ChatService.getConversation(conversationId),
    enabled: !!conversationId,
  });

  // Fetch messages for the conversation
  const {
    data: messagesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['messages', conversationId],
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
    mutationFn: (text: string) => ChatService.sendMessage({
      conversationId: conversationId,
      text,
    }),
    onSuccess: () => {
      // Refetch messages and conversations
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations-count'] });
    },
    onError: (error: any) => {
      Alert.alert('Error', 'Failed to send message. Please try again.');
    },
  });

  // Get other user for message conversion
  const otherUser = useMemo(() => {
    if (!conversationData?.members?.length) return undefined;
    return conversationData.members.find(member => member.did !== currentUserId);
  }, [conversationData?.members, currentUserId]);

  // Use unified reaction handling hook
  const { handleReactionToggle } = useMessageReactions({
    conversationId,
    messages,
    setMessages,
    currentUserId,
    currentUser: currentUser ? { handle: currentUser.handle, avatar: currentUser.avatar } : undefined,
  });

  // Accept conversation mutation
  const acceptConversationMutation = useMutation({
    mutationFn: () => ChatService.acceptConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations-count'] });
    },
    onError: (error: any) => {
      Alert.alert('Error', 'Failed to accept conversation');
    },
  });

  // Reject/Leave conversation mutation
  const rejectConversationMutation = useMutation({
    mutationFn: () => ChatService.leaveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations-count'] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Error', 'Failed to reject conversation');
    },
  });

  // Get the other user DID from conversation members
  const otherUserDid = useMemo(() => {
    return otherUser?.did || null;
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
  }, [messagesData?.messages, conversationData?.lastMessage, currentUserId]);

  // Fetch profile information for the other user
  const {
    data: otherUserProfile,
    isLoading: isLoadingOtherUser,
  } = useQuery({
    queryKey: ['profile', otherUserDid],
    queryFn: () => AtprotoService.getProfile(otherUserDid!),
    enabled: !!otherUserDid && !conversationData?.members?.find(m => m.did === otherUserDid)?.displayName,
  });


  // Update messages from store when data changes - track new messages for animations
  useEffect(() => {
    if (conversationId && isUserReady && currentUserId && (messagesData?.messages !== undefined || !isLoading)) {
      const cachedMessages = getMessages(conversationId);
      if (cachedMessages && cachedMessages.length > 0) {
        // Track new messages for animation
        const currentMessageIds = new Set(messages.map(m => m.id));
        cachedMessages.forEach(msg => {
          if (!currentMessageIds.has(msg.id)) {
            newMessageIdsRef.current.add(msg.id);
          }
        });
        
        setMessages(cachedMessages);
        
        // Clear animation tracking after a delay to prevent re-animations
        setTimeout(() => {
          newMessageIdsRef.current.clear();
        }, 1000);
      } else if (messagesData?.messages) {
        setCachedMessages(conversationId, messagesData.messages);
        setMessages(messagesData.messages);
      }
    }
  }, [conversationId, isUserReady, currentUserId, messagesData?.messages, isLoading, getMessages, setCachedMessages]);

  // Use InteractionManager to ensure data is ready before rendering chat UI
  useEffect(() => {
    if (conversationId && isUserReady && currentUserId && conversationData && messagesData && !isLoading && !isLoadingConversation && !isLoadingOtherUser) {
      // Wait for interactions to complete, then mark as ready
      InteractionManager.runAfterInteractions(() => {
        // Additional small delay to ensure layout is ready
        setTimeout(() => {
          setIsReady(true);
        }, 100);
      });
    } else {
      setIsReady(false);
    }
  }, [conversationId, isUserReady, currentUserId, conversationData, messagesData, isLoading, isLoadingConversation, isLoadingOtherUser]);

  // Memoize messages with embeds for video playlist
  const messagesWithEmbeds = useMemo(() => {
    return messages.filter(m => m.embed?.record).map(m => ({ embed: m.embed }));
  }, [messages]);

  // Prepare messages with day separators for LegendList (normal order: oldest to newest)
  const messagesWithSeparators = useMemo(() => {
    const result: Array<Message | { type: 'day-separator'; date: Date }> = [];
    
    // Messages come from API newest-first, so reverse to get oldest-first for display
    const sortedMessages = [...messages].reverse();
    
    sortedMessages.forEach((message, index) => {
      const messageDate = new Date(message.createdAt);
      const prevMessage = index > 0 ? sortedMessages[index - 1] : null;
      const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
      
      // Add day separator if this is the first message or date changed
      if (!prevDate || !isSameDay(messageDate, prevDate)) {
        result.push({ type: 'day-separator', date: messageDate } as any);
      }
      
      result.push(message);
    });
    
    return result;
  }, [messages]);

  // Calculate initial scroll index to start at the last (newest) message
  // This uses LegendList's initialScrollIndex prop to scroll to bottom on mount
  const initialScrollIndex = useMemo(() => {
    if (messagesWithSeparators.length > 0) {
      return messagesWithSeparators.length - 1;
    }
    return undefined;
  }, [messagesWithSeparators.length]);

  // Mark conversation as read when user views the chat screen
  useEffect(() => {
    if (conversationId && isUserReady && messagesData?.messages?.length > 0) {
      // Mark conversation as read when user opens the chat
      ChatService.markConversationAsRead(conversationId)
        .then(() => {
          // Invalidate conversations cache to update unread counts
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['conversations-count'] });
        })
        .catch((error) => {
          // Non-critical operation, just log the error
        });
    }
  }, [conversationId, isUserReady, messagesData?.messages, queryClient]);

  const onSend = useCallback(() => {
    if (!inputText.trim() || sendMessageMutation.isPending) return;
    
    const text = inputText.trim();
    setInputText('');
    
    // Create optimistic message
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      rev: '',
      text,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      conversationId,
      senderDid: currentUserId,
      sent: true,
      received: false,
      sender: {
        did: currentUserId,
        handle: currentUser?.handle || '',
        displayName: formatHandle(currentUser?.handle) || 'You',
        avatar: currentUser?.avatar,
      },
    };
    
    // Add to new messages for animation
    newMessageIdsRef.current.add(optimisticMessage.id);
    
    // Update messages state optimistically
    setMessages((previousMessages) => [optimisticMessage, ...previousMessages]);
    
    // Send the message via API
    sendMessageMutation.mutate(text, {
      onSuccess: (sentMessage) => {
        // Replace optimistic message with real one
        setMessages((previousMessages) => {
          const filtered = previousMessages.filter(m => m.id !== optimisticMessage.id);
          return [sentMessage, ...filtered];
        });
        // Update cache
        setCachedMessages(conversationId, [sentMessage, ...messages]);
      },
      onError: () => {
        // Remove optimistic message on error
        setMessages((previousMessages) => 
          previousMessages.filter(m => m.id !== optimisticMessage.id)
        );
      },
    });
  }, [inputText, sendMessageMutation, currentUserId, currentUser, conversationId, setCachedMessages, messages]);

  // Unified reaction handlers using the hook
  const handleEmojiSelect = useCallback((emoji: string, messageId: string) => {
    handleReactionToggle(emoji, messageId);
    setSelectedMessageId(null); // Hide the emoji bar
  }, [handleReactionToggle]);

  const handleReactionPress = useCallback((messageId: string, emoji: string, isCurrentUserReacted: boolean) => {
    handleReactionToggle(emoji, messageId);
  }, [handleReactionToggle]);

  // Render day separator
  const renderDaySeparator = useCallback((date: Date) => {
    return (
      <View style={styles.daySeparator}>
        <View style={styles.daySeparatorLine} />
        <Text style={styles.daySeparatorText}>{formatDate(date)}</Text>
        <View style={styles.daySeparatorLine} />
      </View>
    );
  }, []);

  // Render message item for LegendList
  const renderMessageItem = useCallback(({ item, index }: { item: Message | { type: 'day-separator'; date: Date }; index: number }) => {
    // Handle day separator
    if ('type' in item && item.type === 'day-separator') {
      return renderDaySeparator(item.date);
    }

    const message = item as Message;
    const hasEmbed = message.embed?.record;
    const isCurrentUser = message.senderDid === currentUserId;
    const isSelected = selectedMessageId === message.id;
    const shouldAnimate = newMessageIdsRef.current.has(message.id);

    // For messages with embeds, render custom layout with proper alignment
    if (hasEmbed) {
      return (
        <Animated.View
          entering={shouldAnimate ? FadeInDown.duration(200).springify() : undefined}
          style={[
            styles.embeddedMessageContainer,
            isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
          ]}
        >
          {/* Show message text if present */}
          {message.text && (
            <Pressable
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedMessageId(message.id);
              }}
              onPress={() => setSelectedMessageId(null)}
              style={[
                styles.messageBubble,
                isCurrentUser ? styles.sentMessage : styles.receivedMessage
              ]}
            >
              <Text style={[
                styles.messageText,
                isCurrentUser ? styles.sentMessageText : styles.receivedMessageText
              ]}>
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
              messageId={message.id}
              onReactionPress={(emoji, isCurrentUserReacted) =>
                handleReactionPress(message.id, emoji, isCurrentUserReacted)
              }
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedMessageId(message.id);
              }}
              conversationMessages={messagesWithEmbeds}
            />
          </View>
          {/* Anchored popover reaction picker below embedded content */}
          {isSelected && (
            <Animated.View
              style={[
                styles.pickerContainer,
                isCurrentUser ? styles.inlineEmojiBarRight : styles.inlineEmojiBarLeft,
              ]}
            >
              <View style={styles.inlineEmojiBarContent}>
                {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, idx, arr) => {
                  const currentUserReaction = message.reactions?.find(
                    reaction => reaction.value === emoji && reaction.sender.did === currentUserId
                  );
                  const otherUserReaction = message.reactions?.find(
                    reaction => reaction.value === emoji && reaction.sender.did !== currentUserId
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
                      onPress={() => handleEmojiSelect(emoji, message.id)}
                    >
                      <Text style={[
                        styles.emojiText,
                        hasCurrentUserReaction && styles.emojiTextSelected
                      ]}>
                        {emoji}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          )}
        </Animated.View>
      );
    }
    
    // For regular messages without embeds
    return (
      <Animated.View
        entering={shouldAnimate ? FadeInDown.duration(200).springify() : undefined}
        style={[
          styles.defaultMessageContainer,
          isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
        ]}
      >
        <Pressable 
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedMessageId(message.id);
          }}
          onPress={() => {
            setSelectedMessageId(null);
          }}
          style={[
            styles.messageBubble,
            isCurrentUser ? styles.sentMessage : styles.receivedMessage
          ]}
        >
          <Text style={[
            styles.messageText,
            isCurrentUser ? styles.sentMessageText : styles.receivedMessageText
          ]}>
            {message.text}
          </Text>
        </Pressable>
        {/* Anchored popover reaction picker below message bubble */}
        {isSelected && (
          <Animated.View
            style={[
              styles.pickerContainer,
              isCurrentUser ? styles.inlineEmojiBarRight : styles.inlineEmojiBarLeft,
            ]}
          >
            <View style={styles.inlineEmojiBarContent}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji, idx, arr) => {
                const currentUserReaction = message.reactions?.find(
                  reaction => reaction.value === emoji && reaction.sender.did === currentUserId
                );
                const otherUserReaction = message.reactions?.find(
                  reaction => reaction.value === emoji && reaction.sender.did !== currentUserId
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
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => handleEmojiSelect(emoji, message.id)}
                  >
                    <Text style={[
                      styles.emojiText,
                      hasCurrentUserReaction && styles.emojiTextSelected
                    ]}>
                      {emoji}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        )}
        
        {/* Show reactions if present */}
        {!isSelected && message.reactions && message.reactions.length > 0 && (
          <MessageReactions
            messageId={message.id}
            reactions={message.reactions}
            currentUserId={currentUserId}
            onReactionPress={(emoji, isCurrentUserReacted) => 
              handleReactionPress(message.id, emoji, isCurrentUserReacted)
            }
          />
        )}
      </Animated.View>
    );
  }, [currentUserId, selectedMessageId, handleEmojiSelect, handleReactionPress, messagesWithEmbeds, renderDaySeparator]);

  // Format date for day separator
  const formatDate = useCallback((date: Date) => {
    if (isToday(date)) {
      return 'Today';
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else {
      return format(date, 'EEEE, MMM d');
    }
  }, []);

  // Key extractor for LegendList
  const keyExtractor = useCallback((item: Message | { type: 'day-separator'; date: Date }, index: number) => {
    if ('type' in item && item.type === 'day-separator') {
      return `day-${item.date.getTime()}`;
    }
    return (item as Message).id;
  }, []);

  // Get item type for LegendList
  const getItemType = useCallback((item: Message | { type: 'day-separator'; date: Date }) => {
    if ('type' in item && item.type === 'day-separator') {
      return 'day-separator';
    }
    return 'message';
  }, []);

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

  // Don't render chat UI until data is ready (handled by InteractionManager)
  if (!isReady) {
    return null;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
          <View />
        </SafeAreaView>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={48} color={Colors.lightRed} />
          <Text style={styles.errorTitle}>Unable to load messages</Text>
          <Text style={styles.errorSubtitle}>Please check your connection and try again</Text>
        </View>
        <SafeAreaView style={styles.safeAreaBottom} edges={['bottom']}>
          <View />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
        <View />
      </SafeAreaView>
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={true}
      >
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <View style={styles.headerContent}>
          <Pressable 
            style={styles.backButton}
            onPress={() => {
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
        {/* Messages List - LegendList handles all scrolling and alignment */}
        <View style={styles.listContainer}>
          <LegendList
            data={messagesWithSeparators}
            renderItem={renderMessageItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            estimatedItemSize={80}
            initialScrollIndex={initialScrollIndex}
            alignItemsAtEnd
            maintainScrollAtEnd
            maintainScrollAtEndThreshold={0.1}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        </View>

        {/* Input Toolbar */}
        {conversationData?.status !== 'accepted' && !currentUserInitiated ? (
          <View style={styles.inputToolbar}>
            <View style={styles.actionButtonsContainer}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.rejectButton,
                  pressed && { opacity: 0.7 }
                ]}
                onPress={() => rejectConversationMutation.mutate()}
                disabled={rejectConversationMutation.isPending || acceptConversationMutation.isPending}
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
                  pressed && { opacity: 0.7 }
                ]}
                onPress={() => acceptConversationMutation.mutate()}
                disabled={rejectConversationMutation.isPending || acceptConversationMutation.isPending}
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
        ) : (
          <View style={styles.inputToolbar}>
            <View style={styles.inputToolbarContent}>
              <View style={styles.avatarContainer}>
                <Avatar
                  uri={currentUser?.avatar}
                  type="profile"
                  size={42}
                  style={styles.avatar}
                />
              </View>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type a message..."
                  placeholderTextColor={Colors.gray}
                  multiline={true}
                  maxLength={1000}
                  returnKeyType="default"
                  blurOnSubmit={false}
                  autoCorrect={true}
                  autoCapitalize="sentences"
                  textAlignVertical="top"
                  value={inputText}
                  onChangeText={setInputText}
                />
              </View>
              {inputText.trim().length > 0 && !sendMessageMutation.isPending && (
                <View style={styles.sendColumn}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.sendButton,
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={onSend}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                  >
                    <Icon 
                      name="arrow-up-fill" 
                      size={22} 
                      color={Colors.black}
                    />
                  </Pressable>
                </View>
              )}
              {sendMessageMutation.isPending && (
                <View style={styles.sendColumn}>
                  <View style={styles.sendButton}>
                    <Loading3FillIcon size={22} color={Colors.black} />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
        
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
    flexDirection: 'column',
  },
  listContainer: {
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.black,
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    color: Colors.lightGray,
    textAlign: 'center',
    lineHeight: 22,
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
    backgroundColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.FULL,
    width: 42,
    height: 42,
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 0,
    zIndex: 11,
    elevation: 11,
  },
  sendButtonInactive: {
    opacity: 0.5,
  },
  sendButtonDisabled: {
    opacity: 0.5,
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