// Simple performance monitoring utility for VirtualizedList optimization

interface PerformanceMetrics {
  renderTime: number;
  itemCount: number;
  feedType: string;
  timestamp: number;
}

class PerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static isEnabled = __DEV__; // Only enable in development

  static startTimer(): number {
    return Date.now();
  }

  static endTimer(startTime: number, itemCount: number, feedType: string): void {
    if (!this.isEnabled) return;

    const renderTime = Date.now() - startTime;
    const metric: PerformanceMetrics = {
      renderTime,
      itemCount,
      feedType,
      timestamp: Date.now()
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

  static getAverageRenderTime(feedType?: string): number {
    if (this.metrics.length === 0) return 0;

    const filteredMetrics = feedType 
      ? this.metrics.filter(m => m.feedType === feedType)
      : this.metrics;

    if (filteredMetrics.length === 0) return 0;

    const totalTime = filteredMetrics.reduce((sum, m) => sum + m.renderTime, 0);
    return totalTime / filteredMetrics.length;
  }

  static clearMetrics(): void {
    this.metrics = [];
  }

  static getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }
}

export default PerformanceMonitor; 