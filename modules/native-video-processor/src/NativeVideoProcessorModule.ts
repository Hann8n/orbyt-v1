import { NativeModule, requireNativeModule } from 'expo';

import { VideoMetadata, MergeResult, TrimResult, CompressResult } from './NativeVideoProcessor.types';

declare class NativeVideoProcessorModule extends NativeModule {
  mergeVideos(videoPaths: string[], outputPath: string): Promise<MergeResult>;
  trimVideo(videoPath: string, startTime: number, endTime: number, outputPath: string): Promise<TrimResult>;
  getVideoMetadata(videoPath: string): Promise<VideoMetadata>;
  compressVideo(videoPath: string, outputPath: string, quality: string): Promise<CompressResult>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NativeVideoProcessorModule>('NativeVideoProcessor');
