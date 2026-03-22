# Orbyt-Mix Cold Start Implementation

Documentation for the implementation that improves feed load times when orbyt-mix runs on Google Cloud Run with scale-to-zero. When the server has been idle, the first request hits a cold start (~2–5 seconds), which previously resulted in a blank feed for users.

---

## Overview

**Problem:** Cloud Run scales to zero when unused. When a user opens the app, the orbyt-mix server wakes from sleep, but the first feed request often times out or returns 503, and the user sees a blank feed.

**Solution:** A multi-layered approach across the app and optional server-side tooling:

1. **App: Pre-warm** — Fire a lightweight request to wake Cloud Run before (or in parallel with) the actual feed fetch.
2. **App: Rethrow transient errors** — So React Query can retry instead of swallowing errors and returning empty.
3. **App: Stronger retries for your-mix** — More attempts with exponential backoff to survive cold starts.
4. **Server (optional): Cloud Scheduler** — Ping the service periodically to reduce how often instances go cold.

---

## Architecture

### Request Flow

```
User opens app
    │
    ├─► FeedPager mounts (home screen)
    │       └─► warmupOrbytMix() fires (describeFeedGenerator, no auth)
    │
    ├─► AppState becomes 'active' (foreground)
    │       └─► warmupOnActive() may fire warmupOrbytMix() (if user has your-mix/following)
    │
    └─► useFeed fetches your-mix
            └─► AtprotoService.getFeed → orbyt-mix getFeedSkeleton
                    │
                    ├─► Success → feed displayed
                    ├─► 503/timeout/network → ErrorHandler.isTransientError() → rethrow
                    │       └─► React Query retries (4x for your-mix, exponential backoff)
                    └─► Non-transient error → return { feed: [], cursor: null } (unchanged)
```

### Key Files

| File                                         | Purpose                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/services/OrbytMixWarmupService.ts`      | Lightweight ping to orbyt-mix `describeFeedGenerator` endpoint. Fire-and-forget, cooldown 60s.  |
| `src/utils/query/lifecycle.ts`               | Calls `warmupOnActive()` when app comes to foreground (if user uses your-mix/following).        |
| `src/components/features/feed/FeedPager.tsx` | Calls `warmupOrbytMix()` on mount when feed options include your-mix.                           |
| `src/services/api/feed/FeedService.ts`       | Rethrows transient errors (503, 504, timeout, network) for custom feeds so React Query retries. |
| `src/utils/errors/errorHandler.ts`           | New `isTransientError()` to detect retryable errors.                                            |
| `src/hooks/useFeed.ts`                       | your-mix: 4 retries, exponential backoff (1.5s base, capped at 6s).                             |
| `src/utils/constants.ts`                     | `ORBYT_MIX_FEED_BASE_URL` for warmup URL construction.                                          |
| `orbyt-mix/docs/GOOGLE-CLOUD-RUN-SETUP.md`   | Section 8: optional Cloud Scheduler warm-up.                                                    |

---

## Implementation Details

### 1. OrbytMixWarmupService

**Location:** `src/services/OrbytMixWarmupService.ts`

**Endpoint:** `https://feed.getorbyt.com/xrpc/app.bsky.feed.describeFeedGenerator`

- No auth required (static JSON response)
- Minimal server work; ideal for waking Cloud Run

**Behavior:**

- Fire-and-forget; does not block UI or feed fetch
- Cooldown: max once per 60 seconds (avoids spam when rapidly switching tabs)
- Timeout: 8 seconds (enough for cold start)
- Failures logged but not surfaced to user
- Uses plain `fetch`; no atproto client

### 2. When Warmup Runs

**FeedPager mount:**

- When `FeedPager` mounts and `feedOptions` includes `'your-mix'` and `serverYourMixEnabled` is true
- Runs immediately in `useEffect` so it can overlap with the first feed fetch

**App foreground:**

- In `src/utils/query/lifecycle.ts`, `warmupOnActive()` is called when `AppState` becomes `'active'`
- Only runs if `serverYourMixEnabled` and `lastHomeFeed` is `'your-mix'` or `'following'`
- Uses `require()` for lazy loading to avoid circular deps; paths are `../../stores/*` and `../../services/OrbytMixWarmupService`

### 3. Transient Error Rethrowing

**Location:** `src/services/api/feed/FeedService.ts` (custom feed branch)

**Previous behavior:** All errors in the catch block returned `{ feed: [], cursor: null }`. React Query treated that as success, so no retries occurred.

**New behavior:** If `ErrorHandler.isTransientError(error)` is true, the error is rethrown. React Query then retries.

**Transient errors** (in `ErrorHandler.isTransientError`):

- Message contains: `503`, `504`, `timeout`, `network`, `connection`, `econnrefused`
- Or `error.status === 503 || 504`

**Non-transient** (still return empty, no retry):

- "feed must be a valid at-uri"
- Blocked actor, auth errors, etc.

### 4. Retry Configuration for your-mix

**Location:** `src/hooks/useFeed.ts`

**Constants:**

- `YOUR_MIX_MAX_RETRIES: 4` (vs 2 for other feeds)
- `YOUR_MIX_RETRY_BASE_MS: 1500`

**Retry delay:** `Math.min(1500 * 2^attempt, 6000)`

- Attempt 0: immediate
- Attempt 1: 1.5s
- Attempt 2: 3s
- Attempt 3: 4.5s
- Attempt 4: 6s (capped)

Total worst-case wait before final failure: ~15s, which typically covers Cloud Run cold start.

### 5. Constants

**`src/utils/constants.ts`:**

```ts
export const ORBYT_MIX_FEED_BASE_URL = 'https://feed.getorbyt.com';
```

Used by `OrbytMixWarmupService` to build the warmup URL. Change this if the feed generator host changes.

---

## Optional: Server-Side Warm-Up

To keep orbyt-mix warm more often, use Google Cloud Scheduler:

```bash
gcloud scheduler jobs create http orbyt-mix-warmup \
  --schedule="*/15 * * * *" \
  --uri="https://feed.getorbyt.com/xrpc/app.bsky.feed.describeFeedGenerator" \
  --http-method=GET \
  --location=us-central1
```

This hits the same describe endpoint every 15 minutes. See `orbyt-mix/docs/GOOGLE-CLOUD-RUN-SETUP.md` section 8.

---

## Alternative: min-instances 1

For lowest latency, keep one instance always running:

```bash
gcloud run services update orbyt-mix --region us-central1 --min-instances 1
```

Adds cost (~$15–30/month) but removes cold starts.

---

## Testing

1. **Cold start behavior:** Scale orbyt-mix to zero, wait a few minutes, then open the app. The first load may still show a brief spinner, but retries should eventually succeed.
2. **Warmup cooldown:** Rapid tab switches or foreground/background cycles should not spam the warmup endpoint (max once per 60s).
3. **Transient errors:** Simulate 503 (e.g. with a proxy) and confirm React Query retries instead of showing empty feed.

---

## Possible Follow-Ups

- **Client-side fallback:** If your-mix fails after all retries, fall back to client-side mixing (the old path when `serverYourMixEnabled` is false) so the user always sees content.
- **Stale-while-revalidate:** Show cached feed from a previous session while refetching (React Query’s `placeholderData: keepPreviousData`).
- **Metric/analytics:** Track cold-start-related failures and retry success rates.

---

## Path Notes

The lifecycle module lives at `src/utils/query/lifecycle.ts`. Imports must use `../../` to reach `src/`:

- `../../stores/appStore`
- `../../stores/userStore`
- `../../services/OrbytMixWarmupService`

Using `../` would incorrectly resolve under `src/utils/`.
