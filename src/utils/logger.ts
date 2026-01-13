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

  // Internal helper to exercise LogLevel type and centralize formatting
  private log(level: LogLevel, message: string, context?: LogContext, errorDisplay?: any): void {
    const prefix = level.toUpperCase();
    const formatted = `[${prefix}]${this.formatContext(context)} ${message}`;

    // Extract all context data (excluding component and action which are already formatted)
    const contextData = context ? { ...context } : {};
    if (context?.component) delete contextData.component;
    if (context?.action) delete contextData.action;

    // Format context data for output
    const hasContextData = Object.keys(contextData).length > 0;

    if (level === 'debug' || level === 'info') {
      if (this.isDevelopment) {
        if (hasContextData) {
          // Output formatted message and context data separately for better readability
          console.log(formatted);
          console.log(JSON.stringify(contextData, null, 2));
        } else {
          console.log(formatted, errorDisplay ?? '');
        }
      }
      return;
    }

    if (level === 'warn') {
      if (hasContextData) {
        console.warn(formatted);
        console.warn(JSON.stringify(contextData, null, 2), errorDisplay ?? '');
      } else {
        console.warn(formatted, errorDisplay ?? '');
      }
      return;
    }

    if (hasContextData) {
      console.error(formatted);
      console.error(JSON.stringify(contextData, null, 2), errorDisplay ?? '');
    } else {
      console.error(formatted, errorDisplay ?? '');
    }
  }

  /**
   * Debug level logging - only shown in development
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Info level logging - shown in development
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Warning level logging - always shown
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
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
          } catch (_e2) {
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
    this.log('error', message, context, errorDisplay);
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
