import { requireNativeView } from 'expo';
import * as React from 'react';

import { NativeVideoProcessorViewProps } from './NativeVideoProcessor.types';

const NativeView: React.ComponentType<NativeVideoProcessorViewProps> =
  requireNativeView('NativeVideoProcessor');

export default function NativeVideoProcessorView(props: NativeVideoProcessorViewProps) {
  return <NativeView {...props} />;
}
