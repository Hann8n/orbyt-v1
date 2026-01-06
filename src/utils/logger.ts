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
    // Safely stringify error to prevent "Cannot convert undefined value to object" errors
    let errorDisplay: any = '';
    try {
      if (error == null) {
        errorDisplay = '';
      } else if (error instanceof Error) {
        errorDisplay = error;
      } else if (typeof error === 'object') {
        // Safely get property names - Object.getOwnPropertyNames can throw on some objects
        try {
          const keys = Object.getOwnPropertyNames(error);
          errorDisplay = JSON.stringify(error, keys);
        } catch (_e) {
          // Fallback to simple string conversion if property enumeration fails
          try {
            errorDisplay = JSON.stringify(error);
          } catch (e2) {
            errorDisplay = String(error);
          }
        }
      } else {
        errorDisplay = String(error);
      }
    } catch (_e) {
      // Ultimate fallback
      try {
        errorDisplay = String(error);
      } catch {
        errorDisplay = '[Error object could not be stringified]';
      }
    }
    console.error(`[ERROR]${this.formatContext(context)} ${message}`, errorDisplay);
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
