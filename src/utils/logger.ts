/**
 * Centralized logging utility
 * Provides consistent logging across the application with environment-aware logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = __DEV__;

  /**
   * Debug level logging - only shown in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.log(`[DEBUG]${this.formatContext(context)} ${message}`);
    }
  }

  /**
   * Info level logging - shown in development
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.log(`[INFO]${this.formatContext(context)} ${message}`);
    }
  }

  /**
   * Warning level logging - always shown
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN]${this.formatContext(context)} ${message}`);
  }

  /**
   * Error level logging - always shown
   */
  error(message: string, error?: any, context?: LogContext): void {
    console.error(`[ERROR]${this.formatContext(context)} ${message}`, error || '');
  }

  /**
   * Format context object into a readable string
   */
  private formatContext(context?: LogContext): string {
    if (!context) return '';
    
    const parts: string[] = [];
    if (context.component) parts.push(`[${context.component}]`);
    if (context.action) parts.push(`[${context.action}]`);
    
    return parts.length > 0 ? ` ${parts.join('')}` : '';
  }
}

// Export singleton instance
export const logger = new Logger();

// Export default for convenience
export default logger;
