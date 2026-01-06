declare module 'react-native-gifted-chat' {
  import type { ComponentType } from 'react';

  export interface GiftedChatUser {
    _id: string | number;
    name?: string;
    avatar?: string;
    [key: string]: any;
  }

  export interface IMessage {
    _id: string | number;
    text?: string;
    createdAt: Date | string | number;
    user: GiftedChatUser;
    [key: string]: any;
  }

  export interface GiftedChatProps {
    messages?: IMessage[];
    onSend?: (messages: IMessage[]) => void;
    user?: GiftedChatUser;
    [key: string]: any;
  }

  export const GiftedChat: ComponentType<GiftedChatProps>;

  // Minimal type placeholders used by the app
  export type ComposerProps = any;
  export type SendProps = any;
  export type InputToolbarProps = any;
  export type MessageProps<_TMessage = IMessage> = any;
  export type DayProps<_TMessage = IMessage> = any;
}
