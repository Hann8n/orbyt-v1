import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type NativeVideoProcessorModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type NativeVideoProcessorViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

export interface VideoMetadata {
  path: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  frameRate?: number;
  bitrate?: number;
}

export interface MergeResult extends VideoMetadata {}
export interface TrimResult extends VideoMetadata {}
export interface CompressResult extends VideoMetadata {}
