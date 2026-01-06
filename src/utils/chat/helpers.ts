import { IMessage } from 'react-native-gifted-chat';
import { Message, ProfileViewBasic, ReactionView, RecordEmbed } from '../../services/ChatService';
import { formatHandle } from '../formatting/handles';

// Extend IMessage to include reactions and embed
export interface ChatMessage extends IMessage {
  reactions?: ReactionView[];
  embed?: RecordEmbed;
}

/**
 * Convert a single API message to GiftedChat format
 */
export function convertMessageToGiftedChat(
  message: Message,
  currentUserId: string,
  currentUserAvatar?: string,
  otherUser?: ProfileViewBasic
): ChatMessage {
  const otherDisplayName = otherUser ? formatHandle(otherUser.handle) : 'Other';
  const isCurrentUser = message.senderDid === currentUserId;

  return {
    _id: message.id,
    text: message.text,
    createdAt: new Date(message.createdAt),
    user: {
      _id: message.senderDid,
      name: isCurrentUser ? 'You' : otherDisplayName,
      avatar: isCurrentUser ? currentUserAvatar : otherUser?.avatar,
    },
    reactions: message.reactions || [],
    embed: message.embed,
  };
}

/**
 * Convert multiple API messages to GiftedChat format
 */
export function convertMessagesToGiftedChat(
  messages: Message[],
  currentUserId: string,
  currentUserAvatar?: string,
  otherUser?: ProfileViewBasic
): ChatMessage[] {
  if (!messages || messages.length === 0) return [];

  const otherDisplayName = otherUser ? formatHandle(otherUser.handle) : 'Other';

  return messages.map(msg => {
    const isCurrentUser = msg.senderDid === currentUserId;
    return {
      _id: msg.id,
      text: msg.text,
      createdAt: new Date(msg.createdAt),
      user: {
        _id: msg.senderDid,
        name: isCurrentUser ? 'You' : otherDisplayName,
        avatar: isCurrentUser ? currentUserAvatar : otherUser?.avatar,
      },
      reactions: msg.reactions || [],
      embed: msg.embed,
    };
  });
}
