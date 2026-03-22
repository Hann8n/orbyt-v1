import type { AppError } from '../../types';
import { logger } from '../logger';
import i18n from '../../i18n';

/**
 * Centralized error handling utility
 */
export class ErrorHandler {
  /**
   * Handle and log errors consistently
   */
  static handleError(error: unknown, context: string): AppError {
    const errorMessage = this.getErrorMessage(error);
    const appError: AppError = {
      message: errorMessage,
      code: this.getErrorCode(error),
      details: error,
    };

    logger.error(`[ErrorHandler] ${context}`, error, {
      component: 'ErrorHandler',
      action: context,
      message: appError.message,
    });
    return appError;
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }

    return i18n.t('errors.unexpected');
  }

  /**
   * Extract error code if available
   */
  static getErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(error.code);
    }
    return undefined;
  }

  /**
   * Check if error is a network error
   */
  static isNetworkError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    );
  }

  /**
   * Check if error is an authentication error
   */
  static isAuthError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication') ||
      message.includes('login')
    );
  }

  /**
   * Check if error is transient (503, 504, timeout, network) and worth retrying.
   * Used for feed fetches when Cloud Run or upstream may be cold-starting.
   */
  static isTransientError(error: unknown): boolean {
    const msg = this.getErrorMessage(error).toLowerCase();
    if (
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('econnrefused')
    ) {
      return true;
    }
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status?: number }).status;
      if (status === 503 || status === 504) return true;
    }
    return false;
  }

  /**
   * Check if error is a user cancellation
   */
  static isUserCancellation(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('cancelled') ||
      message.includes('user_cancelled') ||
      message.includes('status: cancel')
    );
  }

  /**
   * Get appropriate error message based on error type
   */
  static getAppropriateMessage(error: unknown): string {
    if (this.isNetworkError(error)) {
      return i18n.t('errors.networkConnection');
    }

    if (this.isAuthError(error)) {
      return i18n.t('errors.authentication');
    }

    return this.getErrorMessage(error);
  }

  /**
   * Safe async operation wrapper
   */
  static async safeAsync<T>(
    operation: () => Promise<T>,
    context: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error, context);
      return fallback;
    }
  }

  /**
   * Safe sync operation wrapper
   */
  static safeSync<T>(operation: () => T, context: string, fallback?: T): T | undefined {
    try {
      return operation();
    } catch (error) {
      this.handleError(error, context);
      return fallback;
    }
  }
}

/**
 * Predefined error handlers for common operations
 */
// Utility functions for compatibility with existing code
export function isUserCancellation(error: unknown): boolean {
  return ErrorHandler.isUserCancellation(error);
}

export function getErrorMessage(error: unknown): string {
  return ErrorHandler.getErrorMessage(error);
}

export function shouldShowError(error: unknown): boolean {
  return !ErrorHandler.isUserCancellation(error);
}

export const CommonErrorHandlers = {
  login: (error: unknown) => {
    // Don't show errors for user cancellation
    if (!ErrorHandler.isUserCancellation(error)) {
      ErrorHandler.handleError(error, 'Login');
    }
  },
  logout: (error: unknown) => ErrorHandler.handleError(error, 'Logout'),
  feedLoad: (error: unknown) => ErrorHandler.handleError(error, 'Feed Load'),
  videoPlayback: (error: unknown) => ErrorHandler.handleError(error, 'Video Playback'),
  navigation: (error: unknown) => ErrorHandler.handleError(error, 'Navigation'),
  cache: (error: unknown) => ErrorHandler.handleError(error, 'Cache'),
  api: (error: unknown) => ErrorHandler.handleError(error, 'API'),
};
