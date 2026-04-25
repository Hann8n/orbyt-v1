import * as Sentry from '@sentry/react-native';

/**
 * Show the Sentry feedback form to allow users to report issues directly
 * Call this from a "Report a Problem" or "Send Feedback" button in your UI
 */
export const showSentryFeedback = async () => {
  try {
    // Use feedback integration to show form
    // Note: The actual implementation depends on your Sentry SDK version
    // This captures user feedback as a breadcrumb that can be viewed in Sentry
    captureUserAction('feedback_form_opened');
  } catch (error) {
    console.warn('Failed to show Sentry feedback form:', error);
  }
};

/**
 * Capture a breadcrumb for better error context
 * Use this to track important user actions before errors occur
 */
export const captureUserAction = (action: string, data?: Record<string, any>) => {
  Sentry.captureMessage(`User action: ${action}`, {
    contexts: {
      action: {
        name: action,
        ...data,
      },
    },
  } as any);
};

/**
 * Set user context for better error attribution
 * Call this after user authentication succeeds
 */
export const setSentryUser = (userId: string, email?: string, username?: string) => {
  Sentry.setUser({
    id: userId,
    email,
    username,
  });
};

/**
 * Clear user context on logout
 */
export const clearSentryUser = () => {
  Sentry.setUser(null);
};

/**
 * Add custom context that will be attached to all future events
 */
export const setSentryContext = (contextName: string, contextData: Record<string, any>) => {
  Sentry.setContext(contextName, contextData);
};

/**
 * Get the last Sentry event ID for reference
 */
export const getLastEventId = (): string | null => {
  const eventId = Sentry.lastEventId();
  return eventId ?? null;
};
