import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Alert, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { GiftedChat, IMessage } from 'react-native-gifted-chat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Animated as RNAnimated } from 'react-native';

import { Colors, Avatar } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/helpers';
import Icon, { BackArrowIcon, Loading3FillIcon } from '../../ui/Icon';
import { Message, Conversation, ReactionView } from '../../../services/ChatService';

// Extend IMessage to include reactions
interface ChatMessage extends IMessage {
  reactions?: ReactionView[];
}
import ChatService from '../../../services/ChatService';
import { AtProtoOAuthService } from '../../../services/auth/OAuthService';
import { AtprotoService } from '../../../services/api/AtprotoService';
import AuthorItem from '../../ui/AuthorItem';
import MessageReactions from './MessageReactions';
import ChatActionsSheet from './ChatActionsSheet';
import EmbeddedPostCard from './EmbeddedPostCard';

interface ChatScreenProps {
  conversationId: string;
  recipientDid?: string;
}

export default function ChatScreen({ conversationId, recipientDid }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('1');
  const [isUserReady, setIsUserReady] = useState(false);
  
  // Inline emoji reaction state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Chat actions sheet state
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  // Dismiss keyboard when screen loses focus
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Dismiss keyboard when navigating away with a small delay
        // to allow animations to complete
        setTimeout(() => {
          Keyboard.dismiss();
        }, 100);
      };
    }, [])
  );

  useEffect(() => {
    const getUserSession = async () => {
      try {
        const { useUserStore } = await import('../../../stores/userStore');
        const userStore = useUserStore.getState();
        const session = userStore.currentUser;
        setCurrentUser(session);
        setCurrentUserId(session?.did || '1');
        setIsUserReady(true);
      } catch (error) {
        setIsUserReady(true); // Still render, but with fallback user
      }
    };
    getUserSession();
  }, []);

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
    refetch,
  } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => ChatService.getMessages(conversationId),
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

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => 
      ChatService.addReaction({
        conversationId: conversationId,
        messageId: messageId,
        reactionValue: emoji,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: (error: any) => {
      // Don't show alert for reactions - they're non-critical
    },
  });

  // Remove reaction mutation
  const removeReactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => 
      ChatService.removeReaction({
        conversationId: conversationId,
        messageId: messageId,
        reactionValue: emoji,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: (error: any) => {
      // Don't show alert for reactions - they're non-critical
    },
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
    if (conversationData?.members?.length > 0) {
      const otherMember = conversationData.members.find(member => member.did !== currentUserId);
      return otherMember?.did;
    }
    return null;
  }, [conversationData, currentUserId]);

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

  // Convert API messages to GiftedChat format
  const convertToGiftedChatMessages = useCallback((apiMessages: Message[]): ChatMessage[] => {
    // Derive the other user's display name from normalized conversation members
    const otherMember = conversationData?.members?.find(m => m.did !== currentUserId);
    const otherDisplayName = formatHandle(otherMember?.handle) || 'Other';
    return apiMessages.map((msg) => ({
      _id: msg.id,
      text: msg.text,
      createdAt: new Date(msg.createdAt),
      user: {
        _id: msg.senderDid,
        name: msg.senderDid === currentUserId ? 'You' : otherDisplayName,
        avatar: msg.senderDid === currentUserId ? currentUser?.avatar : undefined,
      },
      // Include reactions data for the MessageReactions component
      reactions: msg.reactions || [],
      // Include embed data for embedded posts
      embed: msg.embed,
    }));
  }, [currentUserId, currentUser, conversationData?.members]);

  // Update messages when data changes
  useEffect(() => {
    if (messagesData?.messages) {
      const giftedMessages = convertToGiftedChatMessages(messagesData.messages);
      setMessages(giftedMessages);
    }
  }, [messagesData, convertToGiftedChatMessages]);

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

  const onSend = useCallback((newMessages: ChatMessage[] = []) => {
    if (newMessages.length > 0) {
      const message = newMessages[0];
      // Update messages state directly (modern pattern)
      setMessages((previousMessages) => [...newMessages, ...previousMessages]);
      
      // Send the message via API
      sendMessageMutation.mutate(message.text);
    }
  }, [sendMessageMutation]);

  // Handle inline emoji selection
  const handleEmojiSelect = useCallback((emoji: string, messageId: string) => {
    // Find the message to check current reactions
    const targetMessage = messages.find(msg => String(msg._id) === messageId);
    const isCurrentUserReacted = targetMessage?.reactions?.some(
      reaction => reaction.value === emoji && reaction.sender.did === currentUserId
    );

    // Prepare optimistic update
    const previousMessages = messages;

    if (isCurrentUserReacted) {
      // Optimistically remove
      setMessages(prev => prev.map(m => {
        if (String(m._id) !== messageId) return m;
        const nextReactions = (m.reactions || []).filter(r => !(r.value === emoji && r.sender.did === currentUserId));
        return { ...m, reactions: nextReactions } as ChatMessage;
      }));

      removeReactionMutation.mutate(
        { messageId, emoji },
        {
          onError: () => {
            // Rollback
            setMessages(previousMessages);
          },
          onSettled: () => {
            // Refresh to sync with server
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        }
      );
    } else {
      // Optimistically add
      const optimisticReaction: ReactionView = {
        value: emoji,
        sender: {
          did: currentUserId,
          handle: currentUser?.handle || '',
          displayName: formatHandle(currentUser?.handle) || 'You',
          avatar: currentUser?.avatar,
        },
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => prev.map(m => {
        if (String(m._id) !== messageId) return m;
        const nextReactions = [...(m.reactions || []), optimisticReaction];
        return { ...m, reactions: nextReactions } as ChatMessage;
      }));

      addReactionMutation.mutate(
        { messageId, emoji },
        {
          onError: () => {
            // Rollback
            setMessages(previousMessages);
          },
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        }
      );
    }

    setSelectedMessageId(null); // Hide the emoji bar
  }, [addReactionMutation, removeReactionMutation, messages, currentUserId, currentUser, queryClient, conversationId]);

  // Handle reaction press (toggle add/remove)
  const handleReactionPress = useCallback((messageId: string, emoji: string, isCurrentUserReacted: boolean) => {
    const previousMessages = messages;

    if (isCurrentUserReacted) {
      // Optimistically remove
      setMessages(prev => prev.map(m => {
        if (String(m._id) !== messageId) return m;
        const nextReactions = (m.reactions || []).filter(r => !(r.value === emoji && r.sender.did === currentUserId));
        return { ...m, reactions: nextReactions } as ChatMessage;
      }));

      removeReactionMutation.mutate(
        { messageId, emoji },
        {
          onError: () => {
            setMessages(previousMessages);
          },
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        }
      );
    } else {
      // Optimistically add
      const optimisticReaction: ReactionView = {
        value: emoji,
        sender: {
          did: currentUserId,
          handle: currentUser?.handle || '',
          displayName: formatHandle(currentUser?.handle) || 'You',
          avatar: currentUser?.avatar,
        },
        createdAt: new Date().toISOString(),
      };

      setMessages(prev => prev.map(m => {
        if (String(m._id) !== messageId) return m;
        const nextReactions = [...(m.reactions || []), optimisticReaction];
        return { ...m, reactions: nextReactions } as ChatMessage;
      }));

      addReactionMutation.mutate(
        { messageId, emoji },
        {
          onError: () => {
            setMessages(previousMessages);
          },
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        }
      );
    }
  }, [addReactionMutation, removeReactionMutation, messages, currentUserId, currentUser, queryClient, conversationId]);

  // Format date for day separator
  const formatDate = (date: Date) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };


  const renderComposer = useCallback((props: any) => {
    return (
      <TextInput
        {...props.textInputProps}
        style={styles.textInput}
        placeholder="Type a message..."
        placeholderTextColor={Colors.lightGray}
        multiline={true}
        maxLength={1000}
        returnKeyType="default"
        blurOnSubmit={false}
        autoCorrect={true}
        autoCapitalize="sentences"
        textAlignVertical="top"
      />
    );
  }, []);

  const renderSend = useCallback((props: any) => {
    const hasText = props.text && props.text.trim().length > 0;
    const isDisabled = !hasText || sendMessageMutation.isPending;
    
    return (
      <TouchableOpacity
        style={[
          styles.sendButton,
          { backgroundColor: hasText ? Colors.green : Colors.gray },
          isDisabled && styles.sendButtonDisabled
        ]}
        onPress={() => {
          if (props.text && props.text.trim() && !sendMessageMutation.isPending) {
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
            props.onSend([message]);
          }
        }}
        activeOpacity={0.8}
        disabled={isDisabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {sendMessageMutation.isPending ? (
          <Loading3FillIcon size={24} color={Colors.black} />
        ) : (
          <Icon 
            name="send-plane-fill" 
            size={22} 
            color={Colors.black}
          />
        )}
      </TouchableOpacity>
    );
  }, [currentUserId, currentUser, sendMessageMutation.isPending]);

  const renderInputToolbar = useCallback((props: any) => {
    // Only show accept/reject buttons if conversation status is not "accepted" (using API status directly)
    // AND the current user is the recipient (didn't initiate the conversation)
    const showAcceptReject = conversationData?.status !== 'accepted' && !currentUserInitiated;
    
    if (showAcceptReject) {
      return (
        <View style={styles.inputToolbar}>
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => rejectConversationMutation.mutate()}
              disabled={rejectConversationMutation.isPending || acceptConversationMutation.isPending}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                {rejectConversationMutation.isPending ? (
                  <Loading3FillIcon size={20} color={Colors.white} />
                ) : (
                  <Text style={styles.actionButtonText}>Reject</Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => acceptConversationMutation.mutate()}
              disabled={rejectConversationMutation.isPending || acceptConversationMutation.isPending}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                {acceptConversationMutation.isPending ? (
                  <Loading3FillIcon size={20} color={Colors.black} />
                ) : (
                  <Text style={[styles.actionButtonText, styles.acceptButtonText]}>Accept</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    
    return (
      <View style={styles.inputToolbar}>
        <View style={styles.inputToolbarContent}>
          {props.renderComposer && props.renderComposer(props)}
          {props.renderSend && props.renderSend(props)}
        </View>
      </View>
    );
  }, [conversationData?.status, currentUserInitiated, rejectConversationMutation, acceptConversationMutation]);

  const renderAvatar = useCallback(() => null, []);

  // Get the other user (not the current user) from the conversation
  const otherUser = useMemo(() => {
    if (!otherUserDid) {
      return null;
    }
    
    // First try to get from conversation members (this has the most complete data)
    if (conversationData?.members?.length > 0) {
      const otherUser = conversationData.members.find(member => member.did !== currentUserId);
      if (otherUser) {
        return otherUser;
      }
    }
    
    // If we have profile data from the profile query, use that
    if (otherUserProfile) {
      return {
        did: otherUserDid,
        handle: otherUserProfile.handle,
        displayName: formatHandle(otherUserProfile.handle) || 'User',
        avatar: otherUserProfile.avatar,
      };
    }
    
    return null;
  }, [otherUserDid, conversationData, otherUserProfile, currentUserId]);

  const renderDay = useCallback((dayProps: any) => {
    const date = dayProps.currentMessage?.createdAt;
    if (!date) return null;
    
    return (
      <View style={styles.daySeparator}>
        <View style={styles.daySeparatorLine} />
        <Text style={styles.daySeparatorText}>{formatDate(date)}</Text>
        <View style={styles.daySeparatorLine} />
      </View>
    );
  }, []);

  const renderMessage = useCallback((props: any) => {
    const message = props.currentMessage;
    const hasEmbed = message.embed?.record;
    const isCurrentUser = message.user._id === currentUserId;
    const isSelected = selectedMessageId === String(message._id);
    
    // For messages with embeds, render custom layout with proper alignment
    if (hasEmbed) {
      return (
        <View 
          style={[
            styles.embeddedMessageContainer,
            isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
          ]}
        >
          {/* Show message text if present */}
          {message.text && (
            <TouchableOpacity
              activeOpacity={1}
              onLongPress={() => setSelectedMessageId(String(message._id))}
              onPress={() => setSelectedMessageId(null)}
              style={[
                styles.messageBubble,
                message.user._id === currentUserId ? styles.sentMessage : styles.receivedMessage
              ]}
            >
              <Text style={[
                styles.messageText,
                message.user._id === currentUserId ? styles.sentMessageText : styles.receivedMessageText
              ]}>
                {message.text}
              </Text>
            </TouchableOpacity>
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
              onLongPress={() => setSelectedMessageId(String(message._id))}
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
                    reaction => reaction.value === emoji && reaction.sender.did === currentUserId
                  );
                  const otherUserReaction = message.reactions?.find(
                    reaction => reaction.value === emoji && reaction.sender.did !== currentUserId
                  );
                  const hasCurrentUserReaction = !!currentUserReaction;
                  const hasOtherUserReaction = !!otherUserReaction;
                  
                  return (
                    <TouchableOpacity
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
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.emojiText,
                        hasCurrentUserReaction && styles.emojiTextSelected
                      ]}>
                        {emoji}
                      </Text>
                    </TouchableOpacity>
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
      <TouchableOpacity 
        style={[
          styles.defaultMessageContainer,
          isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
        ]}
        onLongPress={() => {
          setSelectedMessageId(String(message._id));
        }}
        onPress={() => {
          setSelectedMessageId(null);
        }}
        activeOpacity={1}
      >
        <View style={[
          styles.messageBubble,
          message.user._id === currentUserId ? styles.sentMessage : styles.receivedMessage
        ]}>
          <Text style={[
            styles.messageText,
            message.user._id === currentUserId ? styles.sentMessageText : styles.receivedMessageText
          ]}>
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
                  reaction => reaction.value === emoji && reaction.sender.did === currentUserId
                );
                const otherUserReaction = message.reactions?.find(
                  reaction => reaction.value === emoji && reaction.sender.did !== currentUserId
                );
                const hasCurrentUserReaction = !!currentUserReaction;
                const hasOtherUserReaction = !!otherUserReaction;
                
                return (
                  <TouchableOpacity
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
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.emojiText,
                      hasCurrentUserReaction && styles.emojiTextSelected
                    ]}>
                      {emoji}
                    </Text>
                  </TouchableOpacity>
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
      </TouchableOpacity>
    );
  }, [currentUserId, selectedMessageId, handleEmojiSelect, handleReactionPress]);

  // Memoize user object for GiftedChat
  const giftedChatUser = useMemo(() => ({
    _id: currentUserId,
    name: currentUser?.handle || 'You',
    avatar: currentUser?.avatar,
  }), [currentUserId, currentUser]);

  if (isLoading || isLoadingConversation || isLoadingOtherUser || !isUserReady) {
    return (
      <View style={styles.loadingContainer}>
        <Loading3FillIcon size={48} color={Colors.white} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={48} color={Colors.lightRed} />
        <Text style={styles.errorTitle}>Unable to load messages</Text>
        <Text style={styles.errorSubtitle}>Please check your connection and try again</Text>
      </View>
    );
  }

  // Calculate header height for keyboard offset
  const headerHeight = 60; // Approximate header height

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight - insets.bottom : 0}
        enabled={true}
      >
        {/* Chat Header */}
        <View style={styles.chatHeader}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => {
              // Dismiss keyboard first, then navigate after a brief delay
              Keyboard.dismiss();
              setTimeout(() => {
                router.back();
              }, 150);
            }}
            activeOpacity={0.7}
          >
            <BackArrowIcon size={28} color={Colors.white} />
          </TouchableOpacity>
          
          {otherUser ? (
            <>
              <View style={styles.headerCenter}>
                <TouchableOpacity 
                  style={styles.headerUserInfo}
                  onPress={() => router.push(`/profile/${otherUser.did}`)}
                  activeOpacity={0.7}
                >
                  <Avatar
                    uri={otherUser.avatar}
                    type="profile"
                    size={45}
                    showRing={true}
                    style={styles.headerAvatar}
                  />
                  <Text style={styles.headerDisplayName} numberOfLines={1}>
                    {formatHandle(otherUser.handle) || 'User'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={() => setShowActionsSheet(true)}
                  activeOpacity={0.7}
                >
                  <Icon name="more-fill" size={24} color={Colors.white} />
                </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingBottom: 0,
    paddingHorizontal: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    marginTop: 0,
  },
  inputToolbarContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 0,
    paddingTop: 0,
  },
  textInput: {
    backgroundColor: 'transparent',
    color: Colors.white,
    borderColor: 'transparent',
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    textAlignVertical: 'top',
    fontFamily: 'Firma-Regular',
    fontSize: 18,
    lineHeight: 24,
    marginRight: 8,
  },
  sendColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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