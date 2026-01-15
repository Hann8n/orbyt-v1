/**
 * Email Verification Service
 * Handles email verification checks and confirmation requests
 * Uses proper types from @atproto/api for type safety
 */
import { Agent } from '@atproto/api';
import { logger } from '../../utils/logger';

export class EmailVerificationService {
  /**
   * Check if the current user's email is verified
   * @param agent - Authenticated Agent instance
   * @returns true if email is verified, false if not verified or no email, null if error
   */
  static async checkEmailVerificationStatus(
    agent: Agent
  ): Promise<{ verified: boolean; hasEmail: boolean }> {
    try {
      const sessionResponse = await agent.api.com.atproto.server.getSession();

      // emailConfirmed is optional, default to false if not present
      // sessionResponse.data is already typed from the API
      const hasEmail =
        sessionResponse.data.email !== undefined && sessionResponse.data.email !== null;
      const isVerified = hasEmail ? (sessionResponse.data.emailConfirmed ?? false) : false;

      logger.debug('Email verification status checked', {
        component: 'EmailVerificationService',
        emailConfirmed: isVerified,
        hasEmail,
      });

      return { verified: isVerified, hasEmail };
    } catch (error) {
      logger.error('Failed to check email verification status', error, {
        component: 'EmailVerificationService',
      });
      // On error, return unverified state
      return { verified: false, hasEmail: false };
    }
  }

  /**
   * Request email confirmation - sends verification email to user
   * @param agent - Authenticated Agent instance
   * @throws Error if request fails
   */
  static async requestEmailConfirmation(agent: Agent): Promise<void> {
    try {
      await agent.api.com.atproto.server.requestEmailConfirmation();

      logger.info('Email confirmation requested successfully', {
        component: 'EmailVerificationService',
      });
    } catch (error) {
      logger.error('Failed to request email confirmation', error, {
        component: 'EmailVerificationService',
      });
      throw error;
    }
  }

  /**
   * Confirm email with token from verification email
   * @param agent - Authenticated Agent instance
   * @param email - User's email address
   * @param token - Verification token from email
   * @throws ExpiredTokenError if token has expired
   * @throws InvalidTokenError if token is invalid
   * @throws InvalidEmailError if email doesn't match
   * @throws AccountNotFoundError if account not found
   * @throws Error for other failures
   */
  static async confirmEmail(agent: Agent, email: string, token: string): Promise<void> {
    try {
      await agent.api.com.atproto.server.confirmEmail({
        email,
        token,
      });

      logger.info('Email confirmed successfully', {
        component: 'EmailVerificationService',
        email,
      });
    } catch (error) {
      // Re-throw specific error types from the API (they'll be properly typed)
      // The API client automatically maps these to the error classes
      if (
        error instanceof Error &&
        (error.message.includes('ExpiredToken') ||
          error.message.includes('InvalidToken') ||
          error.message.includes('InvalidEmail') ||
          error.message.includes('AccountNotFound'))
      ) {
        // Let specific errors bubble up with their original messages
        throw error;
      }

      logger.error('Failed to confirm email', error, {
        component: 'EmailVerificationService',
        email,
      });
      throw error;
    }
  }

  /**
   * Get user's email from session
   * @param agent - Authenticated Agent instance
   * @returns User's email address or null if not available or error
   */
  static async getUserEmail(agent: Agent): Promise<string | null> {
    try {
      const sessionResponse = await agent.api.com.atproto.server.getSession();
      // sessionResponse.data is already typed from the API
      return sessionResponse.data.email ?? null;
    } catch (error) {
      logger.error('Failed to get user email', error, {
        component: 'EmailVerificationService',
      });
      return null;
    }
  }
}
