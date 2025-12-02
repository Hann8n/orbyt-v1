import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { Avatar } from '../../ui/UI';
import { Conversation } from '../../../services/ChatService';
import ChatService from '../../../services/ChatService';
import { formatRelativeDate } from '../../ui/RelativeDate';
import Icon, { Loading3FillIcon } from '../../ui/Icon';

interface ConversationListProps {
  onConversationPress?: (conversation: Conversation) => void;
  bottomNavBarHeight?: number;
}

// Divider component for conversations
const ConversationDivider = () => (
  <View style={styles.divider} />
);

export default function ConversationList({ onConversationPress, bottomNavBarHeight = 0 }: ConversationListProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserDid, setCurrentUserDid] = useState<string>('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const getUserSession = async () => {
      try {
        const { useUserStore } = await import('../../../stores/userStore');
        const userStore = useUserStore.getState();
        const session = userStore.currentUser;
        setCurrentUserDid(session?.did || '');
      } catch (error) {
error('Error getting user session:', error);
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
    const hasEmbed = !!(item.lastMessage && 'embed' in item.lastMessage && (item.lastMessage as any).embed);
    
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => handleConversationPress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.avatarContainer}>
          <Avatar
            uri={otherMember.avatar}
            type="profile"
            size={50}
            showRing={true}
            style={styles.profileImage}
          />
          {item.unreadCount > 0 && (
            <View style={styles.unreadIndicator} />
          )}
        </View>
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={[
              styles.conversationName,
              item.unreadCount > 0 && styles.unreadConversationName
            ]} numberOfLines={1}>
              {otherMember?.displayName || otherMember?.handle}
            </Text>
            {item.lastMessageCreatedAt && (
              <Text style={styles.conversationTime}>
                {formatRelativeDate(item.lastMessageCreatedAt)}
              </Text>
            )}
          </View>
          
          <View style={styles.conversationFooter}>
            <Text 
              style={[
                styles.lastMessage,
                item.unreadCount > 0 && styles.unreadMessage
              ]}
              numberOfLines={1}
            >
              {hasEmbed && !item.lastMessageText ? 'sent a post' : (item.lastMessageText || 'No messages yet')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyContent}>
        <Icon 
          name="inbox" 
          size={48} 
          color={Colors.gray} 
        />
        <Text style={styles.emptyText}>no conversations yet</Text>
      </View>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyContent}>
        <Icon 
          name="alert-circle" 
          size={48} 
          color={Colors.lightRed} 
        />
        <Text style={styles.emptyText}>unable to load conversations</Text>
      </View>
    </View>
  );

  if (isLoading && conversations.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Loading3FillIcon size={48} color={Colors.white} />
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
        ItemSeparatorComponent={ConversationDivider}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.white}
            titleColor={Colors.white}
          />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : {
          paddingHorizontal: 15,
          paddingBottom: bottomNavBarHeight + 5,
        }}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.darkGray,
    marginLeft: 62, // Align with content (50px avatar + 12px margin)
    marginRight: -15, // Extend to right edge, ignoring 15px padding
  },
  avatarContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.FULL,
    marginRight: 12,
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
    justifyContent: 'flex-start',
    marginRight: 10,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  conversationName: {
    color: Colors.white,
    fontSize: 18,
    marginBottom: 2,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
    marginRight: 4,
  },
  unreadConversationName: {
    color: Colors.white,
  },
  conversationTime: {
    color: Colors.gray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    marginLeft: 4,
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  lastMessage: {
    color: Colors.mutedGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  unreadMessage: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 60,
  },
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.lightGray,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 100,
  },
});
