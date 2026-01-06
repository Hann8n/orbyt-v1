# Service Naming Analysis & Recommendations

## Analysis Summary

Analysis of root-level service files in `src/services/` compared against naming conventions and industry standards.

---

## Current Files Analysis

### 1. **FeedService.ts** ✅

**Current Purpose:**

- Domain service for feed processing
- React Query integration (useInfiniteQuery)
- Feed aggregation (mixing multiple feeds, hashtag feeds, etc.)
- Feed normalization and deduplication
- State management for search results
- Moderation integration

**Assessment:** ✅ Correctly named and positioned

- Matches domain service pattern
- Correct location (root level)
- Name accurately reflects functionality

**Recommendation:** Keep as-is

---

### 2. **ChatService.ts** ✅

**Current Purpose:**

- Domain service for chat/messaging operations
- Conversation management (create, get, list, mute, leave)
- Message operations (send, delete, get, reactions)
- Data mapping from API to app models
- Uses `chat.bsky.convo.*` APIs

**Assessment:** ✅ Correctly named and positioned

- Standard name for messaging services
- Domain service pattern
- Correct location

**Standard Names Research:**

- "ChatService" is standard (e.g., Firebase Chat, Discord API)
- Alternatives like "ConversationService" or "MessagingService" are also common
- "ChatService" is preferred for real-time messaging

**Recommendation:** Keep as-is (ChatService is standard)

---

### 3. **ModerationService.ts** ✅

**Current Purpose:**

- Domain service for content moderation
- Decision-making logic (filter, blur, inform)
- Settings management (fetch, save, sync)
- Post moderation (single and batch)
- Profile/notification moderation (stubbed)
- Preference conversion (API ↔ app models)

**Assessment:** ✅ Correctly named and positioned

- Standard name for moderation services
- Domain service pattern
- Correct location

**Recommendation:** Keep as-is

---

### 4. **ContentFilterService.ts** ❌ DUPLICATE

**Current Purpose:**

- **DUPLICATE of ModerationService**
- Exports `ModerationService` class
- Contains identical functionality to `ModerationService.ts`

**Assessment:** ❌ Should be removed

- Duplicate code
- Confusing naming (ContentFilter vs Moderation)
- Naming conventions doc notes this issue

**Standard Names Research:**

- "ContentFilter" typically refers to URL/content blocking (ad blockers, parental controls)
- "Moderation" refers to policy-based content decisions (hide, blur, warn)
- ModerationService is the correct name for this functionality

**Recommendation:** **DELETE** this file

- All imports should use `ModerationService` directly
- Update `src/services/index.ts` to remove the export

---

### 5. **VideoProcessingService.ts** ✅

**Current Purpose:**

- Video compression (automatic and manual)
- Format normalization (HDR → SDR, codec conversion)
- Video merging (multiple segments)
- Metadata extraction (duration, resolution, codec)
- Path standardization (iCloud, Photos library)
- Thumbnail extraction
- File size validation and compression

**Assessment:** ✅ Correctly named and positioned

- Domain service pattern
- "Processing" = encoding, compression, format conversion (backend operations)

**Standard Names Research:**

- "VideoProcessing" = encoding, compression, format conversion
- Industry standard (FFmpeg, video processing pipelines)
- Distinction from "VideoEditing" (user-facing editing operations)

**Recommendation:** Keep as-is

---

### 6. **VideoEditingService.ts** ✅

**Current Purpose:**

- User-facing video editing operations
- Text overlays
- Video trimming
- Video cropping (9:16 aspect ratio)
- Audio mixing (background music)
- Volume adjustment

**Assessment:** ✅ Correctly named and positioned

- Domain service pattern
- "Editing" = user-facing editing operations
- Correctly separated from "Processing" (encoding/compression)

**Standard Names Research:**

- "VideoEditing" = user-facing editing (overlays, trimming, cropping)
- Industry standard (Adobe Premiere, Final Cut Pro use "editing")
- Distinction from "processing" (backend encoding operations)

**Recommendation:** Keep as-is

---

### 7. **PDSDiscoveryService.ts** ✅

**Current Purpose:**

- Minimal service for PDS discovery
- Identifier preparation (handle format normalization)
- Delegates actual discovery to @atproto/oauth-client-expo

**Assessment:** ✅ Correctly named

- Core infrastructure service
- "PDS" prefix is appropriate (specific to ATProto)

**Standard Names Research:**

- "DiscoveryService" is generic (could be anything)
- "PDSDiscoveryService" is specific and clear
- Similar to "ServiceDiscovery" patterns in microservices

**Recommendation:** Keep as-is

---

### 8. **APIService.ts** ✅

**Current Purpose:**

- Abstract base class for static JSON API services
- Used by HeaderService and StaticChannelsService
- Handles URL candidate building (env vars, localhost, remote)
- React Query integration
- Base class pattern (not instantiated directly)

**Assessment:** ✅ Correctly named

- Core infrastructure service
- Base class pattern (abstract)
- Generic name is appropriate for base class

**Standard Names Research:**

- "APIService" is standard for base API client classes
- Common pattern (AbstractAPIClient, BaseAPIService, etc.)
- Generic name is appropriate for a base class

**Recommendation:** Keep as-is

---

### 9. **ModerationTypes.ts** ✅

**Current Purpose:**

- TypeScript type definitions
- Interfaces: ModerationSettings, ModerationDecision, ModerationOpts, LabelDefinition
- Type exports: LabelPreference

**Assessment:** ✅ Correctly named

- Types file (not a service)
- Standard naming: `{Domain}Types.ts`
- Should remain in root (shared types)

**Recommendation:** Keep as-is (not a service, just types)

---

## Issues Found

### Issue 1: Duplicate Service ❌

**Problem:** `ContentFilterService.ts` is a duplicate of `ModerationService.ts`

- Both files contain identical `ModerationService` class
- `index.ts` exports `ModerationService` from `ContentFilterService`
- Confusing and violates DRY principle

**Resolution:**

1. Delete `ContentFilterService.ts`
2. Update `src/services/index.ts`:
   ```typescript
   // Remove: export { ModerationService } from './ContentFilterService';
   // Add: export { ModerationService } from './ModerationService';
   ```
3. Search codebase for imports from `ContentFilterService` and update to `ModerationService`

**Priority:** High (code duplication, naming confusion)

---

## Naming Standards Comparison

### Industry Standard Naming Patterns

| Service Type       | Standard Names                                     | Our Names              | Match |
| ------------------ | -------------------------------------------------- | ---------------------- | ----- |
| Feed Processing    | FeedService, FeedAggregator                        | FeedService            | ✅    |
| Chat/Messaging     | ChatService, ConversationService, MessagingService | ChatService            | ✅    |
| Content Moderation | ModerationService, ContentModerationService        | ModerationService      | ✅    |
| Content Filtering  | ContentFilterService (for URL blocking)            | N/A (duplicate)        | N/A   |
| Video Processing   | VideoProcessingService, VideoEncoder               | VideoProcessingService | ✅    |
| Video Editing      | VideoEditingService, VideoEditor                   | VideoEditingService    | ✅    |
| Discovery          | DiscoveryService, ServiceDiscovery                 | PDSDiscoveryService    | ✅    |
| Base API Client    | APIService, BaseAPIService, AbstractAPIClient      | APIService             | ✅    |

---

## Final Recommendations

### ✅ Keep As-Is (7 files)

1. `FeedService.ts` - Correct name and location
2. `ChatService.ts` - Standard name, correct location
3. `ModerationService.ts` - Standard name, correct location
4. `VideoProcessingService.ts` - Correct distinction from editing
5. `VideoEditingService.ts` - Correct distinction from processing
6. `PDSDiscoveryService.ts` - Specific and clear naming
7. `APIService.ts` - Appropriate base class name
8. `ModerationTypes.ts` - Types file (not a service)

### ❌ Delete (1 file)

1. `ContentFilterService.ts` - Duplicate of ModerationService

### 🔧 Required Changes

1. **Delete `ContentFilterService.ts`**
   - File contains duplicate/older version of ModerationService
   - All functionality is available in ModerationService.ts

2. **Update `src/services/index.ts`:**

   ```typescript
   // Change from:
   export { ModerationService } from './ContentFilterService';

   // To:
   export { ModerationService } from './ModerationService';
   ```

3. **Update imports in 4 files:**
   - `src/hooks/useModerationSettings.ts`
   - `src/stores/userStore.ts`
   - `src/services/FeedService.ts`
   - `src/services/index.ts` (already covered above)

   Change all imports from:

   ```typescript
   import { ModerationService } from '../services/ContentFilterService';
   // or
   import { ModerationService } from './ContentFilterService';
   ```

   To:

   ```typescript
   import { ModerationService } from '../services/ModerationService';
   // or
   import { ModerationService } from './ModerationService';
   ```

---

## Summary

The service naming is **mostly correct** and follows industry standards. The only issue is the duplicate `ContentFilterService.ts` file, which should be removed. All other services have appropriate names that clearly indicate their purpose and follow standard naming conventions.

**Key Insights:**

- "Processing" vs "Editing" distinction is standard and correct
- "Moderation" is more accurate than "ContentFilter" for policy-based decisions
- Service names accurately reflect their domain responsibilities
- No renaming needed (except removing the duplicate)
