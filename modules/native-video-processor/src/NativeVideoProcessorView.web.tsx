import * as React from 'react';

import { NativeVideoProcessorViewProps } from './NativeVideoProcessor.types';

export default function NativeVideoProcessorView(props: NativeVideoProcessorViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
