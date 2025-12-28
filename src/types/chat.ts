/**
 * Chat Types - Shared types for chat functionality
 * Extracted from ChatService for direct API usage
 */

export interface ProfileViewBasic {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  chatDisabled?: boolean;
}

export interface MessageViewSender {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface ReactionViewSender {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface ReactionView {
  value: string;
  sender: ReactionViewSender;
  createdAt: string;
}

export interface MessageView {
  id: string;
  rev: string;
  text: string;
  facets?: Facet[];
  embed?: RecordEmbed;
  reactions?: ReactionView[];
  sender: MessageViewSender;
  sentAt: string;
}

export interface DeletedMessageView {
  id: string;
  rev: string;
  deleted: true;
  sender: MessageViewSender;
  sentAt: string;
}

export interface MessageAndReactionView {
  message: MessageView | DeletedMessageView;
  reaction: ReactionView;
}

export interface Facet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: (Mention | Link | Tag)[];
}

export interface Mention {
  $type: 'app.bsky.richtext.facet#mention';
  did: string;
}

export interface Link {
  $type: 'app.bsky.richtext.facet#link';
  uri: string;
}

export interface Tag {
  $type: 'app.bsky.richtext.facet#tag';
  tag: string;
}

export interface RecordEmbed {
  $type: 'app.bsky.embed.record';
  record: {
    uri: string;
    cid: string;
  };
}
