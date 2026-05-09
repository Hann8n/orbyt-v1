# Sentry Integration Guide

This document outlines the comprehensive Sentry setup for Orbyt mobile app with all advanced features enabled.

## ✅ What's Configured

### Performance & Monitoring

- **Performance Tracing** (`tracesSampleRate: 1.0`) — Captures all transactions
- **User Interaction Tracing** — Automatically tracks touch events and gestures
- **Profiling** (`profilesSampleRate: 1.0`) — Records CPU and function-level performance data
- **UI Hang Detection** — Identifies hangs and slow frames via native iOS profiling

### Session Replay

- **Session Replay** (10% of sessions) — Records user interactions for context
- **Error Replay** (100%) — Always captures replay when errors occur
- **Screenshot Masking** — Redacts text and images for privacy

### User Feedback

- **Feedback Integration** — Built-in feedback form with screenshot capability
- **View Hierarchy Capture** — Captures native component tree at error time
- **User Context Sync** — Automatically tracks user info (DID, handle, email)

### Routing Instrumentation

- **React Navigation Integration** — Auto-traces screen transitions
- **Time to Initial Display** — Measures app startup and screen load times

## 🎯 Using Sentry Features in Your App

### 1. Show Feedback Form (Report a Problem)

Add a "Report a Problem" button anywhere in your UI:

```tsx
import { showSentryFeedback } from '@/utils/sentry/feedbackHelper';

export const ReportButton = () => (
  <Pressable onPress={showSentryFeedback}>
    <Text>Report a Problem</Text>
  </Pressable>
);
```

**Example: Add to Settings Screen**

```tsx
// In app/settings/SettingsScreen.tsx
import { showSentryFeedback } from '@/utils/sentry/feedbackHelper';

// Inside your settings list, add:
<NativePressable onPress={showSentryFeedback} style={styles.row}>
  <Text style={styles.text}>Report a Problem</Text>
  <Icon name="arrow" />
</NativePressable>;
```

### 2. Track User Actions (Breadcrumbs)

Capture important user actions for context in error reports:

```tsx
import { captureUserAction } from '@/utils/sentry/feedbackHelper';

// Track when user creates a post
const handleCreatePost = async (content: string) => {
  captureUserAction('create_post_started', { contentLength: content.length });
  // ... rest of creation logic
  captureUserAction('create_post_completed', { postId: newPostId });
};

// Track navigation
const handleNavigateToProfile = (userId: string) => {
  captureUserAction('navigate_to_profile', { userId });
  router.push(`/profile/${userId}`);
};
```

### 3. User Context (Automatic)

User context is **automatically synced** via `useSentryUserSync` hook:

- When user logs in → Sentry tracks their DID, handle, email
- When user logs out → Context is cleared
- When account switches → Context updates automatically

### 4. Performance Monitoring

Sentry automatically captures:

- Screen transitions and load times
- Native vs JS frame times
- Slow/frozen frames
- Network request timing

**Custom transaction tracking:**

```tsx
import * as Sentry from '@sentry/react-native';

const transaction = Sentry.startTransaction({
  op: 'custom_operation',
  name: 'Fetch Heavy Data',
});

try {
  const data = await fetchData();
  transaction.finish();
} catch (error) {
  transaction.finish();
  throw error;
}
```

### 5. Profiling Data

Sentry captures:

- CPU hotspots and function durations
- Memory allocations
- Thread analysis
- Per-component render costs

View detailed profiling data in Sentry dashboard under "Performance → Profiling"

## 📊 Monitoring Your App

### Sentry Dashboard

1. **Errors** — Browse recent crashes and issues
2. **Performance** — View transaction timeline, slow screens
3. **Replays** — Rewatch sessions that had errors
4. **Profiling** — Analyze CPU hotspots and memory usage
5. **Feedback** — Read user-submitted bug reports

### Setting Sampling Rates for Production

For production, reduce data collection to save quota:

```tsx
// In Sentry.init()
tracesSampleRate: 0.3,              // 30% of transactions
replaysSessionSampleRate: 0.05,     // 5% of normal sessions
replaysOnErrorSampleRate: 1.0,      // 100% on errors (keep this)
profilesSampleRate: 0.1,            // 10% of transactions
```

## 🔍 Debugging Tips

### View Last Event ID

```tsx
import { getLastEventId } from '@/utils/sentry/feedbackHelper';

const eventId = getLastEventId();
console.log('Last error event:', eventId);
```

### Add Custom Context

```tsx
import { setSentryContext } from '@/utils/sentry/feedbackHelper';

setSentryContext('feature_flags', {
  newFeedEnabled: true,
  betaFeatureActive: false,
});
```

### Capture Custom Messages

```tsx
import * as Sentry from '@sentry/react-native';

Sentry.captureMessage('Something important happened', 'warning', {
  contexts: {
    app: { screen: 'FeedScreen', action: 'pull_to_refresh' },
  },
});
```

## 🔐 Privacy & Data

**Masked by Default:**

- ✅ User text input (enabled via `maskAllText: true`)
- ✅ Image contents (enabled via `maskAllImages: true`)
- ✅ Network request bodies (by design)

**Captured in Events:**

- User DID, handle, email (authenticated context)
- Device info (iOS version, app version)
- Screen hierarchy (for UI debugging)
- Breadcrumbs (user action trail)

**Not Captured:**

- ❌ Passwords or tokens
- ❌ Credit card info
- ❌ Raw image/text (masked)

## 📈 What's Being Tracked

| Feature             | Tracking                   | Sample Rate                   |
| ------------------- | -------------------------- | ----------------------------- |
| Errors              | All crashes                | 100%                          |
| Transactions        | Screen loads, API calls    | 100%                          |
| Profiling           | CPU/memory per transaction | 100%                          |
| Session Replay      | User sessions              | 10% (normal), 100% (on error) |
| Performance Metrics | Frame rate, stalls         | 100%                          |
| User Feedback       | Via form button            | On demand                     |

## 🚀 Next Steps

1. **Test error reporting** — Throw a test error to verify Sentry captures it
2. **Add report button** — Integrate into settings or help screen
3. **Monitor dashboard** — Check Sentry for incoming data
4. **Adjust sampling** — Lower rates in production after validating setup

## Troubleshooting

**No events appearing in Sentry?**

- Check DSN is correct in `app/_layout.tsx`
- Verify app can reach `o4510432459096064.ingest.us.sentry.io`
- Check network tab for `https://...ingest.us.sentry.io/4510432460537856`

**Events not being sampled?**

- Check `tracesSampleRate` is > 0
- Check `profilesSampleRate` is > 0
- Refresh app to start new session

**Replay videos not recording?**

- Ensure `replaysSessionSampleRate` or `replaysOnErrorSampleRate` > 0
- Check `maskAllText` and `maskAllImages` privacy settings
- Replays only capture 50 seconds of activity

---

**DSN:** `https://f2e61d33071557e11913fd3407ba7421@o4510432459096064.ingest.us.sentry.io/4510432460537856`

**Config File:** `app/_layout.tsx`

**Utilities:** `src/utils/sentry/feedbackHelper.ts`, `src/hooks/useSentryUserSync.ts`
