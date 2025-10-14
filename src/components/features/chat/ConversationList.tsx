import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { Avatar } from '../../ui/UI';
import { Conversation } from '../../../services/ChatService';
import ChatService from '../../../services/ChatService';
import AuthorItem from '../../ui/AuthorItem';
import RelativeDate from '../../ui/RelativeDate';
import Icon from '../../ui/Icon';
import { AtProtoOAuthService } from '../../../services/auth/OAuthService';

interface ConversationListProps {
  onConversationPress?: (conversation: Conversation) => void;
}

export default function ConversationList({ onConversationPress }: ConversationListProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const getUserSession = async () => {
      try {
        const oauthService = AtProtoOAuthService.getInstance();
        const session = await oauthService.getCurrentOAuthSession();
        setCurrentUserDid(session?.did || '');
      } catch (error) {
        console.error('Error getting user session:', error);
      }
    };
    getUserSession();
  }, []);

  const {
    data: conversationsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => ChatService.getConversations(),
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds for faster updates
  });

  const conversations = conversationsData?.conversations || [];

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    // Also invalidate the conversations-count cache to update bottom bar indicator
    queryClient.invalidateQueries({ queryKey: ['conversations-count'] });
    setRefreshing(false);
  };

  const handleConversationPress = (conversation: Conversation) => {
    if (onConversationPress) {
      onConversationPress(conversation);
    } else {
      router.push(`/chat/${conversation.id}`);
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherMember = item.members.find(member => member.did !== currentUserDid) || item.members[0];
    
    return (
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
        <TouchableOpacity
          style={styles.conversationItem}
          onPress={() => handleConversationPress(item)}
          activeOpacity={0.8}
        >
          <View style={styles.conversationContent}>
            <View style={styles.avatarContainer}>
              <Avatar
                uri={otherMember.avatar}
                type="profile"
                size={52}
                noRing={false}
              />
              {item.unreadCount > 0 && (
                <View style={styles.unreadIndicator} />
              )}
            </View>
            
            <View style={styles.conversationInfo}>
              <View style={styles.conversationHeader}>
                <View style={styles.nameAndTime}>
                  <Text style={[
                    styles.conversationName,
                    item.unreadCount > 0 && styles.unreadConversationName
                  ]} numberOfLines={1}>
                    {otherMember.displayName || otherMember.handle}
                  </Text>
                  {item.lastMessageCreatedAt && (
                    <RelativeDate
                      dateString={item.lastMessageCreatedAt}
                      style={styles.conversationTime}
                    />
                  )}
                </View>
              </View>
              
              <View style={styles.conversationFooter}>
                <Text 
                  style={[
                    styles.lastMessage,
                    item.unreadCount > 0 && styles.unreadMessage
                  ]}
                  numberOfLines={1}
                >
                  {item.lastMessage?.embed && !item.lastMessageText ? 'sent a post' : (item.lastMessageText || 'No messages yet')}
                </Text>
              </View>
            </View>
            
            <View style={styles.chevronContainer}>
              <Icon 
                name="chevron-right" 
                size={20} 
                color={Colors.gray} 
              />
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Icon 
          name="inbox" 
          size={48} 
          color={Colors.gray} 
        />
      </View>
      <Text style={styles.emptyStateTitle}>No conversations yet</Text>
      <Text style={styles.emptyStateSubtitle}>
        Start a conversation by messaging someone from their profile
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Icon 
          name="alert-circle" 
          size={48} 
          color={Colors.lightRed} 
        />
      </View>
      <Text style={styles.emptyStateTitle}>Unable to load conversations</Text>
      <Text style={styles.emptyStateSubtitle}>
        Please check your connection and try again
      </Text>
    </View>
  );

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.blue} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return renderErrorState();
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.white}
            titleColor={Colors.white}
          />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  conversationItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkGray,
  },
  conversationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  unreadIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.green,
    borderWidth: 3,
    borderColor: Colors.black,
  },
  conversationInfo: {
    flex: 1,
    minWidth: 0,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  nameAndTime: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  conversationName: {
    fontSize: 17,
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    marginRight: 8,
  },
  unreadConversationName: {
    color: Colors.white,
    fontWeight: '700',
  },
  conversationTime: {
    fontSize: 13,
    fontFamily: 'Firma-Medium',
    color: Colors.gray,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 15,
    fontFamily: 'Firma-Regular',
    color: Colors.lightGray,
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
  },
  chevronContainer: {
    marginLeft: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 400,
  },
  emptyIconContainer: {
    marginBottom: 24,
    opacity: 0.6,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontFamily: 'Firma-Bold',
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    color: Colors.lightGray,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyContainer: {
    flex: 1,
  },
  listContainer: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    color: Colors.lightGray,
    marginTop: 16,
  },
});
