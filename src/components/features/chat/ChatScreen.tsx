import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, Text, ActivityIndicator, TouchableOpacity, TextInput, Image } from 'react-native';
import { GiftedChat, IMessage, Send, Bubble, InputToolbar, Composer } from 'react-native-gifted-chat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import Icon, { BackArrowIcon } from '../../ui/Icon';
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

interface ChatScreenProps {
  conversationId: string;
  recipientDid?: string;
}

export default function ChatScreen({ conversationId, recipientDid }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const queryClient = useQueryClient();
  const oauthService = AtProtoOAuthService.getInstance();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('1');
  const [isUserReady, setIsUserReady] = useState(false);
  
  // Inline emoji reaction state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  
  // Chat actions sheet state
  const [showActionsSheet, setShowActionsSheet] = useState(false);

  useEffect(() => {
    const getUserSession = async () => {
      try {
        const session = await oauthService.getCurrentOAuthSession();
        setCurrentUser(session);
        setCurrentUserId(session?.did || '1');
        setIsUserReady(true);
      } catch (error) {
        setIsUserReady(true); // Still render, but with fallback user
      }
    };
    getUserSession();
  }, [oauthService]);

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
      console.error('Error sending message:', error);
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
      console.error('Error adding reaction:', error);
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
      console.error('Error removing reaction:', error);
      // Don't show alert for reactions - they're non-critical
    },
  });

  // Get the other user DID from conversation members
  const otherUserDid = React.useMemo(() => {
    if (conversationData?.members?.length > 0) {
      const otherMember = conversationData.members.find(member => member.did !== currentUserId);
      return otherMember?.did;
    }
    return null;
  }, [conversationData, currentUserId]);

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
    return apiMessages.map((msg) => ({
      _id: msg.id,
      text: msg.text,
      createdAt: new Date(msg.createdAt),
      user: {
        _id: msg.senderDid,
        name: msg.senderDid === currentUserId ? 'You' : 'Other',
        avatar: msg.senderDid === currentUserId ? currentUser?.avatar : undefined,
      },
      sent: undefined,
      received: undefined,
      // Include reactions data for the MessageReactions component
      reactions: msg.reactions || [],
    }));
  }, [currentUserId, currentUser]);

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
          console.warn('Failed to mark conversation as read:', error);
        });
    }
  }, [conversationId, isUserReady, messagesData?.messages, queryClient]);

  const onSend = useCallback((newMessages: ChatMessage[] = []) => {
    console.log('[ChatScreen] onSend called with messages:', newMessages.length);
    if (newMessages.length > 0) {
      const message = newMessages[0];
      console.log('[ChatScreen] Sending message:', message.text);
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, newMessages)
      );
      
      // Send the message via API
      sendMessageMutation.mutate(message.text);
    }
  }, [sendMessageMutation]);

  // Handle inline emoji selection
  const handleEmojiSelect = useCallback((emoji: string, messageId: string) => {
    // Find the message to check current reactions
    const message = messages.find(msg => String(msg._id) === messageId);
    const isCurrentUserReacted = message?.reactions?.some(
      reaction => reaction.value === emoji && reaction.sender.did === currentUserId
    );
    
    if (isCurrentUserReacted) {
      removeReactionMutation.mutate({ messageId, emoji });
    } else {
      addReactionMutation.mutate({ messageId, emoji });
    }
    
    setSelectedMessageId(null); // Hide the emoji bar
  }, [addReactionMutation, removeReactionMutation, messages, currentUserId]);

  // Handle reaction press (toggle add/remove)
  const handleReactionPress = useCallback((messageId: string, emoji: string, isCurrentUserReacted: boolean) => {
    if (isCurrentUserReacted) {
      removeReactionMutation.mutate({ messageId, emoji });
    } else {
      addReactionMutation.mutate({ messageId, emoji });
    }
  }, [addReactionMutation, removeReactionMutation]);



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

  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: Colors.green,
          marginVertical: 2,
          marginHorizontal: 8,
          borderRadius: BORDER_RADIUS.LARGE,
          paddingHorizontal: 10,
          paddingVertical: 6,
          maxWidth: '85%',
          minWidth: 60,
          alignSelf: 'flex-end',
        },
        left: {
          backgroundColor: Colors.darkGray,
          marginVertical: 2,
          marginHorizontal: 8,
          borderRadius: BORDER_RADIUS.LARGE,
          paddingHorizontal: 10,
          paddingVertical: 6,
          maxWidth: '85%',
          minWidth: 60,
          alignSelf: 'flex-start',
        },
      }}
      textStyle={{
        right: {
          color: Colors.black,
          fontFamily: 'Firma-Regular',
          fontSize: 16,
          lineHeight: 22,
        },
        left: {
          color: Colors.white,
          fontFamily: 'Firma-Regular',
          fontSize: 16,
          lineHeight: 22,
        },
      }}
      renderTime={() => null}
    />
  );

  const renderComposer = (props: any) => {
    return (
      <View style={styles.inputWrapper}>
        <TextInput
          {...props.textInputProps}
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.lightGray}
          multiline={true}
          value={props.text || ''}
          onChangeText={props.onTextChanged}
          maxLength={1000}
          returnKeyType="default"
          blurOnSubmit={false}
          autoCorrect={true}
          autoCapitalize="sentences"
          textAlignVertical="top"
        />
      </View>
    );
  };

  const renderSend = (props: any) => {
    const hasText = props.text && props.text.trim().length > 0;
    const isDisabled = !hasText || sendMessageMutation.isPending;
    
    return (
      <TouchableOpacity
        style={[
          styles.sendButton,
          !hasText && styles.sendButtonInactive,
          isDisabled && styles.sendButtonDisabled
        ]}
        onPress={() => {
          console.log('[ChatScreen] Send button pressed, text:', props.text, 'isPending:', sendMessageMutation.isPending);
          if (props.text && props.text.trim() && !sendMessageMutation.isPending) {
            // Create the message object that GiftedChat expects
            const message = {
              _id: Math.random().toString(36).substr(2, 9),
              text: props.text.trim(),
              createdAt: new Date(),
              user: {
                _id: currentUserId,
                name: currentUser?.handle || 'You',
                avatar: currentUser?.avatar,
              },
            };
            console.log('[ChatScreen] Calling onSend with message:', message);
            props.onSend([message]);
          }
        }}
        activeOpacity={0.8}
        disabled={isDisabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {sendMessageMutation.isPending ? (
          <ActivityIndicator size="small" color={Colors.black} />
        ) : (
          <Icon 
            name="send-plane-fill" 
            size={22} 
            color={Colors.black}
          />
        )}
      </TouchableOpacity>
    );
  };

  const renderInputToolbar = (props: any) => {
    return (
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
          <View style={styles.inputWrapper}>
            {props.renderComposer && props.renderComposer(props)}
          </View>
          <View style={styles.sendColumn}>
            {props.renderSend && props.renderSend(props)}
          </View>
        </View>
      </View>
    );
  };

  const renderAvatar = () => null;

  const renderMessage = (props: any) => {
    const isCurrentUser = props.currentMessage?.user?._id === currentUserId;
    const message = props.currentMessage;
    const isSelected = selectedMessageId === String(message._id);
    
    return (
      <View style={[
        styles.messageContainer,
        isCurrentUser ? styles.messageContainerRight : styles.messageContainerLeft
      ]}>
        {/* Inline emoji reaction bar - appears above message when selected */}
        {isSelected && (
          <TouchableOpacity 
            style={[
              styles.inlineEmojiBar,
              isCurrentUser ? styles.inlineEmojiBarRight : styles.inlineEmojiBarLeft
            ]}
            activeOpacity={1}
            onPress={() => {
              // Prevent tap from bubbling up to dismiss the bar
            }}
          >
            {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => {
              // Check if current user has already reacted with this emoji
              const hasCurrentUserReaction = message.reactions?.some(
                reaction => reaction.value === emoji && reaction.sender.did === currentUserId
              );
              
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiButton,
                    hasCurrentUserReaction && styles.emojiButtonSelected
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
          </TouchableOpacity>
        )}
        
        {props.renderBubble(props)}
        
        {/* Display reactions if they exist */}
        {message.reactions && message.reactions.length > 0 && (
          <MessageReactions
            reactions={message.reactions}
            currentUserId={currentUserId}
            onReactionPress={(emoji, isCurrentUserReacted) => 
              handleReactionPress(String(message._id), emoji, isCurrentUserReacted)
            }
            messageId={String(message._id)}
          />
        )}
      </View>
    );
  };

  // Get the other user (not the current user) from the conversation
  const getOtherUser = () => {
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
        displayName: otherUserProfile.displayName,
        avatar: otherUserProfile.avatar,
      };
    }
    
    return null;
  };

  const otherUser = getOtherUser();
  

  const renderDay = (dayProps: any) => {
    const date = dayProps.currentMessage?.createdAt;
    if (!date) return null;
    
    return (
      <View style={styles.daySeparator}>
        <View style={styles.daySeparatorLine} />
        <Text style={styles.daySeparatorText}>{formatDate(date)}</Text>
        <View style={styles.daySeparatorLine} />
      </View>
    );
  };

  if (isLoading || isLoadingConversation || isLoadingOtherUser || !isUserReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.blue} />
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

  return (
    <TouchableOpacity 
      style={styles.container}
      activeOpacity={1}
      onPress={() => {
        // Dismiss emoji bar when tapping outside
        setSelectedMessageId(null);
      }}
    >
      {/* Chat Header */}
      <View style={styles.chatHeader}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
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
                  <View style={styles.headerAvatar}>
                    {otherUser.avatar ? (
                      <Image source={{ uri: otherUser.avatar }} style={styles.headerAvatarImage} />
                    ) : (
                      <View style={styles.headerAvatarPlaceholder}>
                        <Text style={styles.headerAvatarText}>
                          {(otherUser.displayName || otherUser.handle || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.headerDisplayName} numberOfLines={1}>
                    {otherUser.displayName || otherUser.handle || 'User'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity 
                  style={styles.headerActionButton}
                  onPress={() => setShowActionsSheet(true)}
                  activeOpacity={0.7}
                >
                  <Icon name="more-fill" size={20} color={Colors.white} />
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
        user={{
          _id: currentUserId,
          name: currentUser?.handle || 'You',
          avatar: currentUser?.avatar,
        }}
        renderSend={renderSend}
        renderBubble={renderBubble}
        renderMessage={renderMessage}
        renderComposer={renderComposer}
        renderInputToolbar={renderInputToolbar}
        renderAvatar={renderAvatar}
        renderDay={renderDay}
        placeholder=""
        alwaysShowSend={true}
        scrollToBottomComponent={() => (
          <View style={styles.scrollToBottomButton}>
            <Icon name="chevron-down" size={16} color={Colors.white} />
          </View>
        )}
        infiniteScroll={true}
        isLoadingEarlier={false}
        showUserAvatar={false}
        minInputToolbarHeight={50}
        maxComposerHeight={120}
        minComposerHeight={42}
        messagesContainerStyle={styles.messagesContainer}
        scrollToBottomStyle={styles.scrollToBottomContainer}
        bottomOffset={0}
        isKeyboardInternallyHandled={true}
        onLongPress={(context, message) => {
          setSelectedMessageId(String(message._id));
        }}
        onPressAvatar={() => {
          // Dismiss emoji bar when tapping avatar
          setSelectedMessageId(null);
        }}
        onPress={() => {
          // Dismiss emoji bar when tapping elsewhere
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
      
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  chatHeader: {
    backgroundColor: Colors.black,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkGray,
    paddingTop: 4,
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
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    marginRight: 12,
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
    fontFamily: 'Firma-SemiBold',
    color: Colors.white,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionButton: {
    padding: 8,
    marginLeft: 8,
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
    marginTop: 16,
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
    paddingTop: 8,
  },
  messageContainer: {
    marginVertical: 4,
    paddingHorizontal: 8,
  },
  messageContainerLeft: {
    alignItems: 'flex-start',
  },
  messageContainerRight: {
    alignItems: 'flex-end',
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
  inputContainer: {
    backgroundColor: Colors.black,
    borderTopWidth: 1,
    borderTopColor: Colors.darkGray,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
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
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray,
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
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
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
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  emojiButtonSelected: {
    backgroundColor: Colors.green,
    borderWidth: 1,
    borderColor: Colors.green,
    borderRadius: BORDER_RADIUS.FULL,
    padding: 4,
  },
  emojiText: {
    fontSize: 24,
    textAlign: 'center',
  },
  emojiTextSelected: {
    // Keep default text styling for selected state
  },
});