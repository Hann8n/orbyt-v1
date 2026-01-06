# Service Naming Conventions

## Overview

This document defines standardized naming conventions for services, utilities, and related code in the codebase based on actual codebase analysis.

## Service Categories

### 1. **API Namespace Services** (`src/services/api/{namespace}/`)

**Purpose**: Direct wrappers for Bluesky API namespace operations
**Naming**: `{Namespace}Service`
**Pattern**: `app.bsky.{namespace}.*` → `{Namespace}Service`

**Examples**:

- `ActorService` - `app.bsky.actor.*` ✅
- `GraphService` - `app.bsky.graph.*` ✅
- `FeedService` - `app.bsky.feed.*` (API operations only) ✅
- `NotificationService` - `app.bsky.notification.*` ✅
- `VideoService` - `app.bsky.video.*` ✅
- `BookmarkService` - `app.bsky.bookmark.*` ✅
- `RepoService` - `com.atproto.repo.*` ✅
- `ModerationService` - `com.atproto.moderation.*` (reportContent only) ✅

**Characteristics**:

- Pure API wrappers
- Static methods only
- No React Query integration
- No business logic
- Located in `src/services/api/{namespace}/`

**Current Issues**:

- ❌ `ContentFilterService.ts` in `api/moderation/` exports `ModerationService` class (domain logic, wrong location)
- ❌ Should be moved to root `src/services/` as domain service

---

### 2. **Domain Services** (`src/services/`)

**Purpose**: Business logic, data processing, React Query integration, state management
**Naming**: `{Domain}Service`
**Pattern**: Domain name + "Service"

**Examples**:

- `FeedService` - Feed processing, React Query, state management ✅
- `ChatService` - Chat data processing, message handling ✅
- `ModerationService` - Content filtering logic, decision making ✅
- `VideoProcessingService` - Video processing operations ✅
- `VideoEditingService` - Video editing operations ✅

**Characteristics**:

- Business logic and data processing
- React Query integration (hooks, mutations)
- State management
- Located in `src/services/` (root level)

**Current Issues**:

- ❌ `FeedService` exists in both `api/feed/` (API) and root (domain) - names conflict but different purposes
- ❌ `ModerationService` exists in both `api/moderation/` (API) and root (domain) - names conflict
- ❌ `ContentFilterService.ts` contains domain logic but is in `api/moderation/` folder

---

### 3. **Data Services** (`src/services/cache/`)

**Purpose**: Data persistence, caching, React Query hooks for cached data
**Naming**: `{Entity}Service` (NOT `{Entity}Cache`)
**Pattern**: Entity name + "Service"

**Current → Proposed**:

- `ProfileCache` → `ProfileService` ✅
- `ChannelCache` → `ChannelService` ✅

**Characteristics**:

- Data caching (MMKV + React Query)
- React Query hooks (`useProfile`, `useChannel`, etc.)
- Data transformation
- Cache management
- Located in `src/services/cache/` (keep existing location)

**Note**: These are full services (not just caches) - they handle fetching, transformation, React Query integration, and caching.

---

### 4. **Core Infrastructure Services** (`src/services/` or `src/services/auth/`)

**Purpose**: Core infrastructure, authentication, discovery
**Naming**: `{Purpose}Service`
**Pattern**: Purpose + "Service"

**Examples**:

- `AtprotoService` - Core API client ✅
- `AtProtoOAuthService` - Authentication ✅
- `PDSDiscoveryService` - PDS discovery ✅
- `APIService` - Base class for static JSON APIs ✅

**Characteristics**:

- Core infrastructure
- Singleton patterns
- Located in `src/services/` or `src/services/auth/`

---

## Utility Functions (`src/utils/`)

**Purpose**: Pure functions, helpers, formatters, parsers
**Naming**: Descriptive names, no "Service" suffix

**Categories**:

- **Formatters**: `{entity}Utils.ts` (e.g., `colorUtils.ts`) ✅
- **Parsers**: `{type}Parser.ts` (e.g., `richTextParser.ts`) ✅
- **Helpers**: `{domain}Helpers.ts` (e.g., `chatHelpers.ts`) ✅
- **Constants**: `constants.ts` ✅
- **Storage**: `storage.ts` ✅
- **Logging**: `logger.ts` ✅

**Characteristics**:

- Pure functions (no side effects where possible)
- No classes
- No React Query
- Located in `src/utils/`

---

## Current Issues & Resolutions

### Issue 1: Duplicate Service Names

**Problem**: Same service name used for different purposes

- `FeedService` - API wrapper (`api/feed/`) vs Domain service (root)
- `ModerationService` - API wrapper (`api/moderation/`) vs Domain service (root)

**Resolution**:

- ✅ Keep names as-is (different locations make them distinct)
- ✅ Import with path: `import { FeedService } from './api/feed/FeedService'` vs `import { feedService } from './FeedService'`
- ✅ Or use namespace imports if needed

### Issue 2: Misplaced Domain Logic

**Problem**: `ContentFilterService.ts` in `api/moderation/` contains domain logic

**Resolution**:

- Move `ContentFilterService.ts` → `src/services/ContentFilterService.ts`
- Or merge into root `ModerationService.ts` (they have similar functionality)

### Issue 3: Cache Naming

**Problem**: `ProfileCache` and `ChannelCache` use "Cache" suffix

**Resolution**:

- Rename to `ProfileService` and `ChannelService`
- They're full services, not just caches

---

## Naming Rules Summary

### ✅ DO:

- Use `{Namespace}Service` for API namespace wrappers
- Use `{Domain}Service` for business logic/processing
- Use `{Entity}Service` for data/cache services (NOT "Cache")
- Use descriptive names for utilities (no "Service" suffix)
- Keep API services in `src/services/api/{namespace}/`
- Keep domain services in `src/services/`
- Keep data services in `src/services/cache/`

### ❌ DON'T:

- Don't use "Cache" suffix for services (use "Service")
- Don't mix API operations with business logic
- Don't put utilities in services directory
- Don't put domain logic in `api/` folders

---

## Recommended File Structure

```
src/services/
├── api/                          # API namespace services (pure wrappers)
│   ├── actor/
│   │   └── ActorService.ts       ✅
│   ├── graph/
│   │   └── GraphService.ts       ✅
│   ├── feed/
│   │   └── FeedService.ts        ✅ (API operations only)
│   ├── moderation/
│   │   └── ModerationService.ts  ✅ (reportContent only)
│   └── ...
├── cache/                         # Data services (caching + React Query)
│   ├── ProfileService.ts         ✅ (renamed from ProfileCache)
│   └── ChannelService.ts         ✅ (renamed from ChannelCache)
├── FeedService.ts                 ✅ (domain service - processing)
├── ChatService.ts                 ✅ (domain service)
├── ModerationService.ts           ✅ (domain service - content filtering)
├── ContentFilterService.ts        ⚠️  (move from api/moderation/)
├── VideoProcessingService.ts      ✅
├── VideoEditingService.ts         ✅
├── AtprotoService.tsx             ✅ (core infrastructure)
└── auth/
    └── OAuthService.ts           ✅
```

---

## Migration Priority

### High Priority (Naming Consistency)

1. ✅ `ProfileCache` → `ProfileService`
2. ✅ `ChannelCache` → `ChannelService`

### Medium Priority (Organization)

3. Move `ContentFilterService.ts` from `api/moderation/` to root `src/services/`
4. Consider merging `ContentFilterService` into `ModerationService` (they overlap)

### Low Priority (Optional)

5. Consider aliasing imports if duplicate names cause confusion
6. Document import patterns for duplicate-named services
