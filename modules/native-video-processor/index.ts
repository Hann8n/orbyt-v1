// Reexport the native module. On web, it will be resolved to NativeVideoProcessorModule.web.ts
// and on native platforms to NativeVideoProcessorModule.ts
export { default } from './src/NativeVideoProcessorModule';
export * from  './src/NativeVideoProcessor.types';
