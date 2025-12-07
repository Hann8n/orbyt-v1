import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import VerticalListSheet, { VerticalListButton } from '../../ui/VerticalListSheet';
import { Colors } from '../../ui/UI';
import { Loading3FillIcon } from '../../ui/Icon';
import { BORDER_RADIUS } from '../../../utils/constants';
import { formatHandle } from '../../../utils/helpers';
import ChatService from '../../../services/ChatService';

interface ChatActionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  conversationId: string;
  otherUserDid?: string;
}

interface ChatAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: () => void;
  destructive?: boolean;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

export default function ChatActionsSheet({ 
  visible, 
  onDismiss, 
  conversationId,
  otherUserDid 
}: ChatActionsSheetProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const queryClient = useQueryClient();


  // Accept conversation mutation
  const acceptConversationMutation = useMutation({
    mutationFn: () => ChatService.acceptConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setIsLoading(null);
      Alert.alert('Success', 'Conversation accepted');
    },
    onError: (error: any) => {
      setIsLoading(null);
      Alert.alert('Error', 'Failed to accept conversation');
    },
  });

  // Leave conversation mutation
  const leaveConversationMutation = useMutation({
    mutationFn: () => ChatService.leaveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setIsLoading(null);
      onDismiss();
      Alert.alert('Success', 'You have left the conversation');
    },
    onError: (error: any) => {
      setIsLoading(null);
      Alert.alert('Error', 'Failed to leave conversation');
    },
  });

  // Mute conversation mutation
  const muteConversationMutation = useMutation({
    mutationFn: (muted: boolean) => ChatService.muteConversation({
      conversationId,
      muted,
    }),
    onSuccess: (_, muted) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setIsLoading(null);
      Alert.alert('Success', `Conversation ${muted ? 'muted' : 'unmuted'}`);
    },
    onError: (error: any) => {
      setIsLoading(null);
      Alert.alert('Error', 'Failed to update conversation settings');
    },
  });

  // Get conversation details for mute status
  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => ChatService.getConversation(conversationId),
    enabled: visible,
  });

  // Get the recipient's name for the title
  const getRecipientName = () => {
    if (!conversation?.members?.length) return 'User';
    
    // Find the recipient using the otherUserDid prop (which should be the recipient's DID)
    const recipient = conversation.members.find(member => 
      member.did === otherUserDid
    );
    
    // Use handle, fallback to 'User'
    return formatHandle(recipient?.handle) || 'User';
  };

  const handleAction = (action: ChatAction) => {
    if (action.requiresConfirmation) {
      Alert.alert(
        'Confirm Action',
        action.confirmationMessage || `Are you sure you want to ${action.title.toLowerCase()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: action.destructive ? 'destructive' : 'default', onPress: action.action }
        ]
      );
    } else {
      action.action();
    }
  };

  // Get all possible actions
  const allActions: ChatAction[] = [
    {
      id: 'accept-conversation',
      title: 'Accept Conversation',
      description: 'Accept this conversation request',
      icon: 'check-circle',
      action: () => {
        setIsLoading('accept-conversation');
        acceptConversationMutation.mutate();
      },
    },
    {
      id: 'mute-conversation',
      title: conversation?.muted ? 'Unmute Conversation' : 'Mute Conversation',
      description: conversation?.muted ? 'Receive notifications again' : 'Stop receiving notifications',
      icon: conversation?.muted ? 'volume-high' : 'volume-off',
      action: () => {
        setIsLoading('mute-conversation');
        muteConversationMutation.mutate(!conversation?.muted);
      },
    },
    {
      id: 'leave-conversation',
      title: 'Leave Conversation',
      description: 'Leave this conversation',
      icon: 'sign-out',
      destructive: true,
      requiresConfirmation: true,
      confirmationMessage: 'Are you sure you want to leave this conversation? You will no longer receive messages.',
      action: () => {
        setIsLoading('leave-conversation');
        leaveConversationMutation.mutate();
      },
    },
  ];

  // Filter actions based on conversation status
  const chatActions = allActions.filter(action => {
    // Only show accept conversation if the conversation status indicates it needs acceptance
    if (action.id === 'accept-conversation') {
      return conversation?.status === 'pending' || conversation?.status === 'request';
    }
    return true;
  });

  const renderActionItem = (action: ChatAction) => {
    const isActionLoading = isLoading === action.id;
    
    // Use custom rendering to match settings destructive styling
    if (action.destructive) {
      return (
        <View key={action.id} style={styles.destructiveActionContainer}>
          <TouchableOpacity
            style={styles.destructiveActionButton}
            onPress={() => handleAction(action)}
            disabled={isActionLoading}
            activeOpacity={0.7}
          >
            <View style={styles.destructiveActionContent} pointerEvents="none">
              <Text style={styles.destructiveActionText}>
                {action.title}
              </Text>
              {isActionLoading && (
                <Loading3FillIcon size={24} color={Colors.darkGray} style={styles.loadingIndicator} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <VerticalListButton
        key={action.id}
        label={action.title}
        onPress={() => handleAction(action)}
        disabled={isActionLoading}
        icon={isActionLoading ? undefined : action.icon}
      />
    );
  };

  return (
    <VerticalListSheet
      visible={visible}
      onDismiss={onDismiss}
      title={`Chat with ${getRecipientName()}`}
      snapPoints={['auto']}
      showCancelButton={true}
    >
      <View style={styles.content}>
        {chatActions.map(renderActionItem)}
      </View>
    </VerticalListSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 0,
  },
  destructiveActionContainer: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  destructiveActionButton: {
    backgroundColor: Colors.red,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  destructiveActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  destructiveActionText: {
    color: Colors.darkGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  loadingIndicator: {
    marginLeft: 8,
  },
});
