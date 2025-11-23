import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './NativeVideoProcessor.types';

type NativeVideoProcessorModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class NativeVideoProcessorModule extends NativeModule<NativeVideoProcessorModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(NativeVideoProcessorModule, 'NativeVideoProcessorModule');
