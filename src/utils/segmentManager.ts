/**
 * Segment Manager - Single source of truth for video segments
 * 
 * Core principles:
 * - All durations in seconds (consistent units throughout)
 * - Simple, predictable API
 * - No side effects or complex state management
 */

import type * as ImagePicker from 'expo-image-picker';

export interface Segment {
  duration: number; // Duration in seconds
  video: { uri: string } | ImagePicker.ImagePickerAsset;
  sourceType?: 'camera' | 'gallery';
}

export class SegmentManager {
  private segments: Segment[] = [];
  private maxDuration: number;

  constructor(maxDuration: number) {
    this.maxDuration = maxDuration;
  }

  setMaxDuration(maxDuration: number): void {
    this.maxDuration = maxDuration;
  }

  getMaxDuration(): number {
    return this.maxDuration;
  }

  getSegments(): Segment[] {
    return [...this.segments];
  }

  getSegmentCount(): number {
    return this.segments.length;
  }

  getTotalDuration(): number {
    return this.segments.reduce((sum, segment) => sum + segment.duration, 0);
  }

  getAvailableTime(): number {
    return Math.max(0, this.maxDuration - this.getTotalDuration());
  }

  canAddSegment(duration: number): boolean {
    return duration > 0 && (this.getTotalDuration() + duration) <= this.maxDuration;
  }

  addSegment(segment: Segment): boolean {
    if (!this.canAddSegment(segment.duration)) {
      return false;
    }
    this.segments.push(segment);
    return true;
  }

  removeLastSegment(): Segment | null {
    return this.segments.pop() || null;
  }

  clear(): void {
    this.segments = [];
  }

  hasSegments(): boolean {
    return this.segments.length > 0;
  }

  toVideoSegments(): Array<{
    startTime: number;
    duration: number;
    video: { uri: string } | ImagePicker.ImagePickerAsset;
    sourceType?: 'camera' | 'gallery';
  }> {
    let cumulativeTime = 0;
    return this.segments.map((segment) => {
      const videoSegment = {
        startTime: cumulativeTime,
        duration: segment.duration,
        video: segment.video,
        sourceType: segment.sourceType,
      };
      cumulativeTime += segment.duration;
      return videoSegment;
    });
  }
}
