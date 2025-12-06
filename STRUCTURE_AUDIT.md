# React Native App Structure Audit

## Current Structure Analysis

### ✅ What's Working Well

1. **Feature-based component organization** - `src/components/features/` is well organized by domain
2. **Clear separation of concerns** - Services, stores, hooks, and components are separated
3. **Type definitions** - Centralized in `src/types/`
4. **Expo Router structure** - `app/` directory follows Expo Router conventions
5. **Store organization** - Zustand stores are well organized in `src/stores/`

### ❌ Issues Identified

#### 1. **File Naming Inconsistencies**
- `usersearch.tsx` should be `UserSearch.tsx` (PascalCase for components)
- Mixed `.ts` and `.tsx` extensions in services (e.g., `AtprotoService.tsx` should be `.ts`)

#### 2. **Screen Components in Wrong Location**
- `app/settings/SettingsScreen.tsx` - Screen component in route directory
- `app/post/VideoPostScreen.tsx` - Screen component in route directory
- `app/settings/SettingsStyles.ts` - Styles file in route directory
- These should be in `src/screens/` or `src/components/screens/`

#### 3. **Import Path Issues**
- Using relative paths (`../../src/`) instead of configured `@/` alias
- Inconsistent import patterns across the codebase

#### 4. **Examples Folder Location**
- `src/examples/` should be at root level or in `docs/` for documentation

#### 5. **Core vs Stores Organization**
- `src/core/visibility/` could be better organized as part of stores or hooks
- Unclear distinction between "core" and "stores"

#### 6. **Utils Organization**
- Some utils in subdirectories (`formatting/`, `helpers/`), some at root
- Inconsistent organization pattern

#### 7. **Service File Extensions**
- `AtprotoService.tsx` should be `.ts` (no JSX)

#### 8. **Missing Standard Directories**
- No `src/screens/` directory for screen components
- No `src/config/` for configuration files
- No `src/constants/` (constants are in utils)

## Recommended Structure

```
/workspace
├── app/                          # Expo Router routes (file-based routing)
│   ├── (tabs)/                   # Tab routes
│   ├── (modals)/                 # Modal routes
│   ├── [dynamic-routes]/         # Dynamic routes only
│   └── _layout.tsx               # Root layout
│
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Base UI components (buttons, inputs, etc.)
│   │   ├── layout/               # Layout components (headers, navigation)
│   │   ├── features/             # Feature-specific components
│   │   │   ├── feed/
│   │   │   ├── video/
│   │   │   ├── chat/
│   │   │   ├── profile/
│   │   │   └── ...
│   │   └── screens/              # Full screen components (NEW)
│   │       ├── SettingsScreen.tsx
│   │       ├── VideoPostScreen.tsx
│   │       └── ...
│   │
│   ├── screens/                  # Screen components (alternative to components/screens)
│   │   ├── settings/
│   │   │   ├── SettingsScreen.tsx
│   │   │   └── SettingsStyles.ts
│   │   └── post/
│   │       └── VideoPostScreen.tsx
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useFeed.ts
│   │   ├── useOAuth.ts
│   │   └── ...
│   │
│   ├── stores/                    # Zustand stores
│   │   ├── userStore.ts
│   │   ├── uiStore.ts
│   │   └── ...
│   │
│   ├── services/                 # Business logic & API services
│   │   ├── api/                  # API clients
│   │   │   └── AtprotoService.ts  # Fix: .ts not .tsx
│   │   ├── auth/                 # Authentication services
│   │   ├── cache/                # Caching services
│   │   └── ...                   # Other services
│   │
│   ├── utils/                    # Utility functions
│   │   ├── constants.ts          # App constants
│   │   ├── helpers.ts            # General helpers
│   │   ├── formatting/           # Formatting utilities
│   │   │   └── colorUtils.ts
│   │   └── helpers/              # Specific helper categories
│   │       ├── video.ts
│   │       └── typography.tsx
│   │
│   ├── types/                    # TypeScript type definitions
│   │   ├── index.ts
│   │   ├── profile.ts
│   │   └── ...
│   │
│   ├── config/                   # Configuration files (NEW)
│   │   ├── app.config.ts
│   │   └── ...
│   │
│   └── core/                     # Core functionality (if needed)
│       └── visibility/           # Or move to stores/hooks
│
├── assets/                       # Static assets (images, fonts, etc.)
│   └── ...                       # Move from src/assets/
│
├── docs/                         # Documentation
│   └── examples/                 # Move from src/examples/
│
└── [config files]                # package.json, tsconfig.json, etc.
```

## Action Plan

### ✅ Phase 1: File Naming & Extensions (COMPLETED)
1. ✅ Renamed `usersearch.tsx` → `UserSearch.tsx`
2. ✅ Renamed `AtprotoService.tsx` → `AtprotoService.ts`
3. ✅ Updated all imports

### ✅ Phase 2: Move Screen Components (COMPLETED)
1. ✅ Created `src/screens/` directory
2. ✅ Moved `app/settings/SettingsScreen.tsx` → `src/screens/settings/SettingsScreen.tsx`
3. ✅ Moved `app/settings/SettingsStyles.ts` → `src/screens/settings/SettingsStyles.ts`
4. ✅ Moved `app/post/VideoPostScreen.tsx` → `src/screens/post/VideoPostScreen.tsx`
5. ✅ Updated route files to import from new locations

### ✅ Phase 3: Reorganize Assets (COMPLETED)
1. ✅ Moved `src/assets/` → `assets/` (root level)
2. ✅ Updated all asset imports

### ✅ Phase 4: Move Examples (COMPLETED)
1. ✅ Moved `src/examples/` → `docs/examples/`
2. ✅ No code references found

### ⏳ Phase 5: Standardize Imports (OPTIONAL - Recommended for future)
1. Replace relative imports (`../../src/`) with `@/` alias
2. Update `tsconfig.json` paths if needed
3. **Note**: This is a larger refactoring that can be done gradually

### ⏳ Phase 6: Organize Utils (OPTIONAL - Future improvement)
1. Review utils structure
2. Consider moving constants to `src/config/`
3. Consolidate or better organize utility functions

## Best Practices Applied

1. **Separation of Routes and Components**: Routes in `app/`, components in `src/`
2. **Feature-based Organization**: Components organized by feature domain
3. **Consistent Naming**: PascalCase for components, camelCase for utilities
4. **Clear File Extensions**: `.tsx` for components, `.ts` for logic
5. **Path Aliases**: Use `@/` for cleaner imports
6. **Assets at Root**: Static assets in root `assets/` directory
7. **Documentation**: Examples and docs in dedicated `docs/` folder
