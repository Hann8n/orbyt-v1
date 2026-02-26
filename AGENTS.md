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
- **Video**: `expo-video`, `react-native-video`, `ffmpeg-kit-react-native`
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

## Cursor Cloud specific instructions

### Environment

- **Node.js 18+** and **Yarn** (Classic v1) are required. The VM has both pre-installed.
- `yarn install` runs a `postinstall` script that includes `pod-install` (CocoaPods). This step is skipped automatically on Linux with a warning — this is expected and harmless.
- The `postinstall` also runs `patch-package` (5 patches in `patches/`) and downloads Skia binaries. Both succeed on Linux.

### Available checks (no automated test suite exists)

- `yarn type-check` — TypeScript compilation (`tsc --noEmit`)
- `yarn lint` — ESLint (0 errors expected; ~46 pre-existing warnings)
- `yarn format:check` — Prettier (1 pre-existing warning in `.cursor/plans/`)
- `yarn check` — runs all three sequentially

### Running the app

- This is a **mobile-only** React Native app requiring an Expo dev client on a physical device or simulator. The Expo dev server (`yarn start` / `expo start --dev-client`) boots on port 8081 but cannot render UI on a headless Linux VM.
- **Web export is not supported** — `expo export --platform web` fails due to missing `@gorhom/bottom-sheet` (a web-only transitive dependency of `react-native-true-sheet`). This is a known limitation, not a bug.
- For Cloud Agent work, focus on `yarn check` for code quality validation. UI changes must be verified via screenshots or described to the user for manual testing on a device.

### Pre-commit hook

- Husky runs `lint-staged` on commit, which auto-fixes ESLint and Prettier on staged `.js/.jsx/.ts/.tsx/.json/.md` files. Commits will succeed as long as files are lint-clean after auto-fix.
