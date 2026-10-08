# Orbyt — AI Agent Context

Orbyt is a video-first social app for the Bluesky network, built on the AT Protocol.
React Native + Expo, targeting iOS and Android.

## Tech Stack

- **Runtime**: Expo 55.0.25, React Native 0.83.6, React 19.2.0
- **Routing**: Expo Router ~55.0.15 (file-based, `app/` directory)
- **State (client)**: Zustand ^5.0.10 (`src/stores/`)
- **State (server)**: TanStack React Query @tanstack/react-query ^5.90.21 (`src/utils/query/`)
- **API**: AT Protocol via `@atproto/api` ^0.19.18 and `@atproto/oauth-client-expo` ^0.0.10
- **Lists**: `@shopify/flash-list` 2.3.1
- **Sheets**: `@lodev09/react-native-true-sheet` ^3.8.1
- **Animation**: `react-native-reanimated` 4.3.1, `react-native-gesture-handler` ~2.30.0
- **Video**: `expo-video` ~55.0.17, `ffmpeg-kit-react-native` 6.0.2
- **Graphics**: `@shopify/react-native-skia` 2.4.18, `react-native-svg` 15.15.3
- **Storage**: `react-native-mmkv` 3.3.3 (general), `expo-secure-store` ~55.0.14 (auth)
- **Dates**: `date-fns` ^4.1.0
- **Images**: `expo-image` ~55.0.10

## ⚠️ Required AI Agent Knowledge Update

**IMPORTANT**: Before writing code, AI agents **MUST** familiarize themselves with the exact APIs, supported props, and blessed patterns for **each specific version** listed above. Version-specific behaviors are critical:

- **Expo Router** patterns (guards, linking, deep linking)
- **Reanimated 4.3.1** animations and worklets (not v3 patterns)
- **Flash List 2.3.1** props and rendering patterns
- **React Query 5.x** hooks and cache management (not v4 patterns)
- **@atproto/api 0.19.x** methods and data structures
- **@lodev09/react-native-true-sheet** API and gesture handling
- **React Native Reanimated** with React Native 0.83.6 compatibility
- **React Compiler** (babel-plugin-react-compiler ^19.1.0-rc.2) is active — all components are compiled for auto-memoization. Avoid manual `React.memo`, `useMemo`, and `useCallback` unless necessary for performance-critical list rendering (where they improve stability).

Agents should **verify** supported props and methods in:

1. Official package documentation for the specific version
2. Existing codebase patterns in `src/` (treat as the source of truth for blessed usage)
3. Type definitions in `node_modules/@types/` and package exports

**Do not assume API compatibility** with other versions or frameworks. Always confirm the exact signature and behavior for the specified versions before implementing.

## Key Conventions

- **Colors**: Import `Colors` from `src/theme/colors.ts` — no raw hex or rgba in styles. Use `hexToRGBA()` from `src/utils/formatting/colors` for dynamic opacity.
- **Typography**: Use `Typography` and `FontFamily` from `src/utils/components/typography.tsx` — no raw font sizes or family strings.
- **Constants**: Use `BORDER_RADIUS`, `ANIMATION_CONSTANTS`, `ICON_SIZES` from `src/utils/constants.ts`.
- **Styling**: Always `StyleSheet.create()`. No inline styles. Check existing shared styles in `ItemStyles.ts`, `AuthSheetStyles.ts`, `SettingsStyles.ts`, `trueSheetPresets.ts`.
- **State**: Zustand for client state, React Query for server/API state. Query keys in `src/utils/query/queryKeys.ts`.
- **API**: `AtprotoService` facade pattern. Sub-services for specific domains in `src/services/api/`.
- **Naming**: Components = PascalCase, hooks = `use*`, stores = `*Store`, services = `*Service`, dirs = kebab-case.
- **Logging**: Use `logger` from `src/utils/logger` — never `console.log`.
- **TypeScript**: Avoid `any`; use proper types or `unknown`.
- **Performance**: `React.memo` for list items, `useCallback`/`useMemo` in list contexts, no anonymous functions in `renderItem`.
- **Dependencies first**: Before writing custom utilities, check if an installed dependency or existing `src/utils/` module already provides the functionality.
- **Path aliases**: `@/*` → `src/*`, `@stores/*` → `src/stores/*`.

### Auth session gating

- **Canonical** “signed in with a usable ATProto session” check: `selectIsSessionValid` from [`src/stores/userStore.ts`](src/stores/userStore.ts) (backed by `hasAuthoritativeSdkSession`). Use this for Expo Router guards, `SessionProvider`, and React Query `enabled`.

### Orbyt AppView (`api.getorbyt.com`)

- Orbyt-native reads are `com.getorbyt.*` XRPC methods (lexicons: orbyt-platform `lexicons/com/getorbyt`). Call them through [`src/services/orbyt/orbytApi.ts`](src/services/orbyt/orbytApi.ts): `orbytPublicQuery` for unauthenticated reads, `orbytAuthedCall` for methods that need the viewer (proxied through the PDS with `atproto-proxy: did:web:api.getorbyt.com#orbyt_appview`). `EXPO_PUBLIC_ORBYT_API_URL` overrides the origin.
- **Channels are Communities** ([`src/services/orbyt/communities.ts`](src/services/orbyt/communities.ts)): the directory is `community.listCommunities`, a channel feed is `community.getFeed` hydrated via `app.bsky.feed.getPosts`, and a post's Community is `community.getPostCommunities`. Posting to a Community writes a `com.getorbyt.community.post` link (same record key as the post) in the same `applyWrites`; following one writes a `com.getorbyt.community.membership` record. Never write `orbyt-channel-*` tags.
- **Profile colors**: `actor.getProfile` / `actor.getProfiles` ([`src/services/colors/orbytProfileQueryOptions.ts`](src/services/colors/orbytProfileQueryOptions.ts)).
- **Explore banners** feature popular Communities ([`src/services/OrbytBannerService.ts`](src/services/OrbytBannerService.ts)); the AppView has no banner endpoint.
- Record writes stay PDS-direct.

## Full Documentation

See `.cursor/rules/` for comprehensive architecture, styling, and convention rules enforced during development. Those files contain full service/utility inventories and error handling patterns.

See `CONTRIBUTING.md` for the pull request process.
