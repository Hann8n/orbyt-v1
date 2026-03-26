# Orbyt — AI Agent Context

Orbyt is a video-first social app for the Bluesky network, built on the AT Protocol.
React Native + Expo, targeting iOS and Android.

## Tech Stack

- **Runtime**: Expo 55, React Native 0.83
- **Routing**: Expo Router (file-based, `app/` directory)
- **State (client)**: Zustand (`src/stores/`)
- **State (server)**: TanStack React Query (`src/utils/query/`)
- **API**: AT Protocol via `@atproto/api` and `@atproto/oauth-client-expo`
- **Lists**: `@shopify/flash-list`
- **Sheets**: `@lodev09/react-native-true-sheet`
- **Animation**: `react-native-reanimated`, `react-native-gesture-handler`
- **Video**: `expo-video`, `ffmpeg-kit-react-native`
- **Graphics**: `@shopify/react-native-skia`, `react-native-svg`
- **Storage**: `react-native-mmkv` (general), `expo-secure-store` (auth)
- **Dates**: `date-fns`
- **Images**: `expo-image`

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

## Full Documentation

See `.cursor/rules/` for comprehensive architecture, styling, and convention rules enforced during development. Those files contain full service/utility inventories and error handling patterns.

See `CONTRIBUTING.md` for the pull request process.
