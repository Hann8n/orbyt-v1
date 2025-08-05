// Simple performance monitoring utility for VirtualizedList optimization

interface PerformanceMetrics {
  renderTime: number;
  itemCount: number;
  feedType: string;
  timestamp: number;
  isVideoVisible?: boolean;
  scrollPerformance?: number;
  videoLoadTime?: number;
}

class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static isEnabled = __DEV__; // Only enable in development
  private static scrollStartTime: number = 0;
  private static videoLoadTimes: Map<string, number> = new Map();

  static startTimer(): number {
    return Date.now();
  }

  static endTimer(startTime: number, itemCount: number, feedType: string, isVideoVisible?: boolean): void {
    if (!this.isEnabled) return;

    const renderTime = Date.now() - startTime;
    const metric: PerformanceMetrics = {
      renderTime,
      itemCount,
      feedType,
      timestamp: Date.now(),
      isVideoVisible
    };

    this.metrics.push(metric);

    // Keep only last 50 metrics to prevent memory leaks
    if (this.metrics.length > 50) {
      this.metrics = this.metrics.slice(-50);
    }

    // Log slow renders
    if (renderTime > 100) {
      console.warn(`Slow VirtualizedList render: ${renderTime}ms for ${itemCount} items in ${feedType}`);
    }
  }

  static startScrollTimer(): void {
    if (!this.isEnabled) return;
    this.scrollStartTime = Date.now();
  }

  static endScrollTimer(): number {
    if (!this.isEnabled) return 0;
    const scrollTime = Date.now() - this.scrollStartTime;
    
    // Log slow scroll events
    if (scrollTime > 16) { // 60fps = 16ms per frame
      console.warn(`Slow scroll event: ${scrollTime}ms`);
    }
    
    return scrollTime;
  }

  static startVideoLoadTimer(videoUri: string): void {
    if (!this.isEnabled) return;
    this.videoLoadTimes.set(videoUri, Date.now());
  }

  static endVideoLoadTimer(videoUri: string): number {
    if (!this.isEnabled) return 0;
    const startTime = this.videoLoadTimes.get(videoUri);
    if (!startTime) return 0;
    
    const loadTime = Date.now() - startTime;
    this.videoLoadTimes.delete(videoUri);
    
    // Log slow video loads
    if (loadTime > 2000) {
      console.warn(`Slow video load: ${loadTime}ms for ${videoUri}`);
    }
    
    return loadTime;
  }

  static getAverageRenderTime(feedType?: string): number {
    if (this.metrics.length === 0) return 0;

    const filteredMetrics = feedType 
      ? this.metrics.filter(m => m.feedType === feedType)
      : this.metrics;

    if (filteredMetrics.length === 0) return 0;

    const totalTime = filteredMetrics.reduce((sum, m) => sum + m.renderTime, 0);
    return totalTime / filteredMetrics.length;
  }

  static getAverageScrollPerformance(): number {
    if (this.metrics.length === 0) return 0;

    const scrollMetrics = this.metrics.filter(m => m.scrollPerformance !== undefined);
    if (scrollMetrics.length === 0) return 0;

    const totalTime = scrollMetrics.reduce((sum, m) => sum + (m.scrollPerformance || 0), 0);
    return totalTime / scrollMetrics.length;
  }

  static getAverageVideoLoadTime(): number {
    if (this.metrics.length === 0) return 0;

    const videoMetrics = this.metrics.filter(m => m.videoLoadTime !== undefined);
    if (videoMetrics.length === 0) return 0;

    const totalTime = videoMetrics.reduce((sum, m) => sum + (m.videoLoadTime || 0), 0);
    return totalTime / videoMetrics.length;
  }

  static clearMetrics(): void {
    this.metrics = [];
    this.videoLoadTimes.clear();
  }

  static getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  static logPerformanceSummary(): void {
    if (!this.isEnabled) return;
    
    const avgRenderTime = this.getAverageRenderTime();
    const avgScrollPerformance = this.getAverageScrollPerformance();
    const avgVideoLoadTime = this.getAverageVideoLoadTime();
    

  }
}

/**
 * Performance monitoring for feed loading
 */
class FeedPerformanceMonitor {
  private static instance: FeedPerformanceMonitor;
  private metrics: Map<string, { startTime: number; endTime?: number; duration?: number }> = new Map();

  static getInstance(): FeedPerformanceMonitor {
    if (!FeedPerformanceMonitor.instance) {
      FeedPerformanceMonitor.instance = new FeedPerformanceMonitor();
    }
    return FeedPerformanceMonitor.instance;
  }

  startTimer(operation: string): void {
    this.metrics.set(operation, { startTime: Date.now() });
  }

  endTimer(operation: string): number {
    const metric = this.metrics.get(operation);
    if (!metric) {
      console.warn(`[FeedPerformance] No start time found for operation: ${operation}`);
      return 0;
    }

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    
    console.log(`[FeedPerformance] ${operation}: ${metric.duration}ms`);
    return metric.duration;
  }

  getMetrics(): Map<string, { startTime: number; endTime?: number; duration?: number }> {
    return new Map(this.metrics);
  }

  clearMetrics(): void {
    this.metrics.clear();
  }
}

export const feedPerformanceMonitor = FeedPerformanceMonitor.getInstance();

export default PerformanceMonitor; 