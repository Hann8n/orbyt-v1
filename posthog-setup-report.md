<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Orbyt Expo app. Here is a summary of what was done:

- **`src/config/posthog.ts`** — New PostHog client configured with token and host from `expo-constants` extras. Disabled when token is absent. Batching, feature-flag preloading, and debug mode are enabled.
- **`app.config.js`** — New Expo config file that extends `app.json` and injects `POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST` from `.env` into `Constants.expoConfig.extra`.
- **`.env`** — PostHog token and host written (gitignore-covered).
- **`package.json`** — Added `posthog-react-native` dependency (`react-native-svg` was already present). Run `yarn install` after checking out to complete the install.
- **`app/_layout.tsx`** — Wrapped `TabBarProvider` with `PostHogProvider` (autocapture on, manual screen tracking). Added `useEffect` in `RootLayout` to call `posthog.screen()` on every route change via `usePathname` + `useGlobalSearchParams`.
- **`app/login-sign-in.tsx`** — `user_signed_in` event + `posthog.identify()` on successful OAuth sign-in.
- **`app/login-sign-up.tsx`** — `user_signed_up` event on sign-up flow initiation.
- **`app/login.tsx`** — `account_switched` event + `posthog.identify()` when a saved account is selected.
- **`app/settings/SettingsScreen.tsx`** — `user_signed_out` event + `posthog.reset()` before sign-out.
- **`app/post/VideoPostScreen.tsx`** — `video_post_submitted` event (with description length, channel, content-warning flags) just before navigation back home.
- **`app/create.tsx`** — `video_recorded` event (with segment count) in `finishRecording`, and `video_gallery_selected` event (with duration) in `pickFromGallery`.
- **`app/edit-profile.tsx`** — `profile_edited` event (with flags for which fields changed) after a successful profile update.
- **`src/services/api/feed/feedInteractions.ts`** — `video_liked`, `video_unliked`, and `video_reposted` events at the service layer.
- **`src/services/api/graph/GraphService.ts`** — `user_followed` and `user_unfollowed` events at the service layer.

## Events

| Event                    | Description                                             | File                                        |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| `user_signed_in`         | User completes OAuth sign-in with a handle              | `app/login-sign-in.tsx`                     |
| `user_signed_up`         | User initiates sign-up by selecting an account provider | `app/login-sign-up.tsx`                     |
| `user_signed_out`        | User logs out from settings                             | `app/settings/SettingsScreen.tsx`           |
| `account_switched`       | User switches to a saved account                        | `app/login.tsx`                             |
| `video_post_submitted`   | User publishes a video post                             | `app/post/VideoPostScreen.tsx`              |
| `video_recorded`         | User finishes recording video segments                  | `app/create.tsx`                            |
| `video_gallery_selected` | User picks a video from their gallery                   | `app/create.tsx`                            |
| `video_liked`            | User likes a video                                      | `src/services/api/feed/feedInteractions.ts` |
| `video_unliked`          | User removes a like                                     | `src/services/api/feed/feedInteractions.ts` |
| `video_reposted`         | User reposts a video                                    | `src/services/api/feed/feedInteractions.ts` |
| `user_followed`          | User follows another user                               | `src/services/api/graph/GraphService.ts`    |
| `user_unfollowed`        | User unfollows another user                             | `src/services/api/graph/GraphService.ts`    |
| `profile_edited`         | User saves profile changes                              | `app/edit-profile.tsx`                      |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/396846/dashboard/1509404
- **Sign-ins over time** (daily login trend): https://us.posthog.com/project/396846/insights/WEqApDmi
- **Sign-up funnel** (sign-up → sign-in → first video post): https://us.posthog.com/project/396846/insights/JOx2Uyym
- **Video engagement over time** (likes, reposts, posts per day): https://us.posthog.com/project/396846/insights/k9hpMyK7
- **Content creation funnel** (recorded → submitted): https://us.posthog.com/project/396846/insights/HNKoyzMh
- **User churn signals** (sign-outs per day): https://us.posthog.com/project/396846/insights/JEEMNZm5

### One remaining step

Run `yarn install` (or `npx expo install posthog-react-native`) in the project root to install the `posthog-react-native` package. The sandbox prevented the automated install from completing, but the dependency has been added to `package.json`.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
