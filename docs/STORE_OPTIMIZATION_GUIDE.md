# Store Optimization Guide

This guide documents the Zustand store architecture optimizations implemented in Orbyt.

## Overview

The app now uses a centralized, performant store architecture that reduces unnecessary re-renders and simplifies state management across the application.

## Store Structure

### 1. **appStore.ts** - Application State
Manages core app initialization and global app state.

```typescript
import { useAppStore } from '../stores';

// Use individual selectors (good)
const fontsLoaded = useAppStore(state => state.fontsLoaded);
const setFontsLoaded = useAppStore(state => state.setFontsLoaded);

// Avoid subscribing to entire store (bad)
const { fontsLoaded, appState, ...everything } = useAppStore();
```

### 2. **userStore.ts** - User & Authentication
Handles all user-related state, authentication, and account management.

```typescript
import { useAuth, useCurrentUser, useAccountManagement } from '../stores/userStore';

// Optimized hooks with granular selectors
const { isAuthenticated, signIn, signOut } = useAuth();
const { currentUser } = useCurrentUser();
const { savedAccounts, switchAccount } = useAccountManagement();
```

### 3. **postInteractionStore.ts** - Post Interactions (NEW ✨)
Manages like and repost state persistence across navigation.

**Problem Solved:** Previously, when users liked or reposted a video and then navigated away, returning to the video would show the original state from the API response, making it appear as if their action was lost.

**Solution:**
```typescript
import { usePostInteractionStore } from '../stores';

const VideoCard = ({ post }) => {
  const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();
  
  // Initialize from persisted state
  const persistedState = getPostInteraction(post.uri, {
    isLiked: !!post.viewer?.like,
    likeCount: post.likeCount || 0,
    // ... other fields
  });
  
  const handleLike = async () => {
    // Optimistic update
    setLocalState({ isLiked: true, likeCount: likeCount + 1 });
    
    // Make API call
    const likeUri = await AtprotoService.likePost(post.uri, post.cid);
    
    // Persist to store for navigation
    updatePostInteraction(post.uri, {
      isLiked: true,
      likeCount: likeCount + 1,
      likeUri,
    });
  };
};
```

**Benefits:**
- Session-scoped state (clears on logout/account switch)
- Minimal memory footprint (only stores interacted posts)
- Works seamlessly with optimistic updates
- No database or AsyncStorage overhead

### 4. **modalStore.ts** - Modal Management (NEW ✨)
Replaces manual subscription pattern in `useGlobalModals` with Zustand.

**Before (Manual State Management):**
```typescript
// 60+ lines of manual listener management
let currentShareSheetData: ShareSheetData | null = null;
const shareSheetListeners: Array<() => void> = [];

const notifyShareSheetListeners = () => {
  shareSheetListeners.forEach(listener => listener());
};

export const useGlobalShareSheet = () => {
  const [data, setData] = useState(currentShareSheetData);
  
  useEffect(() => {
    const listener = () => setData(currentShareSheetData);
    shareSheetListeners.push(listener);
    return () => {
      const index = shareSheetListeners.indexOf(listener);
      if (index > -1) shareSheetListeners.splice(index, 1);
    };
  }, []);
  // ... more boilerplate
};
```

**After (Zustand Store):**
```typescript
// Clean, 8 lines per modal
import { useModalStore } from '../stores/modalStore';

export const useModalStore = create<ModalState>((set) => ({
  shareSheetData: null,
  
  presentShareSheet: (data: ShareSheetData) => {
    set({ shareSheetData: data });
    requestAnimationFrame(() => TrueSheet.present('share-sheet'));
  },
  
  dismissShareSheet: (skipDismiss = false) => {
    if (!skipDismiss) TrueSheet.dismiss('share-sheet');
    set({ shareSheetData: null });
  },
}));
```

**Usage (Backwards Compatible):**
```typescript
// Existing code continues to work
import { useGlobalShareSheet } from '../hooks/useGlobalModals';
const { presentShareSheet, dismissShareSheet } = useGlobalShareSheet();

// Or use new direct store access
import { useShareSheet } from '../stores/modalStore';
const { presentShareSheet } = useShareSheet();
```

**Benefits:**
- **80% less code** - From 170 lines to 35 lines
- **Better performance** - Zustand's optimized subscription system
- **Type-safe** - Full TypeScript support out of the box
- **DevTools support** - Can use Zustand DevTools for debugging
- **Backwards compatible** - Existing code doesn't need changes

### 6. **followStore.ts** - Follow State Management (NEW ✨)
Manages follow/unfollow state persistence across navigation, working alongside ProfileCache.

**Problem Solved:** Similar to post interactions, when users followed/unfollowed profiles and navigated away, returning would show the original API state, making it appear as if their action was lost.

**Solution:**
```typescript
import { useFollowStore } from '../stores';

// In ProfileCache mutation
const followMutation = useFollowMutation();

followMutation.mutate({
  handle: 'user.bsky.social',
  isFollowing: true,
});

// Behind the scenes, the mutation:
// 1. Makes API call to follow/unfollow
// 2. Updates ProfileCache for immediate UI update
// 3. Persists to followStore for navigation persistence

// When fetching profile later:
const profile = await ProfileCache.getProfile('user.bsky.social');
// Profile.isFollowing will be true (from store), even if API hasn't updated yet
```

**Integration with ProfileCache:**
```typescript
// In fetchAndCacheProfile:
let isFollowing = profile.viewer ? !!profile.viewer.following : undefined;

// Check follow store for persisted state (overrides API if available)
const followState = useFollowStore.getState().getFollowState(profile.did);
if (followState !== undefined) {
  isFollowing = followState.isFollowing; // User action takes precedence
}
```

**Benefits:**
- Works seamlessly with existing ProfileCache and React Query
- Session-scoped (clears on logout/account switch)
- Minimal memory footprint (only stores followed/unfollowed profiles)
- Handles optimistic updates with proper rollback
- DID-based for stability (handles don't change, DIDs are permanent)

### 5. **uiStore.ts** - UI State Patterns (NEW ✨)
Generic store for common UI patterns like loading and visibility states.

**Use Cases:**
```typescript
import { useLoading, useVisibility } from '../stores/uiStore';

// Loading states (e.g., form submissions, data fetching)
const MyComponent = () => {
  const [isSubmitting, setIsSubmitting] = useLoading('profile-form');
  
  const handleSubmit = async () => {
    setIsSubmitting(true);
    await saveProfile();
    setIsSubmitting(false);
  };
};

// Visibility states (e.g., dropdowns, modals)
const Dropdown = () => {
  const { isVisible, toggle } = useVisibility('dropdown-menu');
  
  return (
    <>
      <button onClick={toggle}>Toggle Menu</button>
      {isVisible && <Menu />}
    </>
  );
};
```

**When to Use:**
- ✅ Loading states that multiple components need to react to
- ✅ Modal/dropdown visibility that's accessed from multiple places
- ✅ Shared UI state across component boundaries
- ❌ Local component-only state (use `useState` instead)
- ❌ Form input state (keep local unless needed globally)

## Best Practices

### ✅ DO: Use Individual Selectors

```typescript
// Good - only re-renders when isAuthenticated changes
const isAuthenticated = useUserStore(state => state.isAuthenticated);
const signIn = useUserStore(state => state.signIn);
```

### ❌ DON'T: Subscribe to Entire Store

```typescript
// Bad - re-renders on ANY store change
const userStore = useUserStore();
const { isAuthenticated, currentUser, savedAccounts, ... } = useUserStore();
```

### ✅ DO: Use Convenience Hooks When Available

```typescript
// Good - pre-optimized with selectors
const { isAuthenticated, signIn, signOut } = useAuth();
const { currentUser } = useCurrentUser();
```

### ✅ DO: Clear State Appropriately

```typescript
// PostInteractionStore automatically clears on logout/account switch
// via userStore.clearAllCaches()

// UIStore can be cleared manually if needed
import { useUIStore } from '../stores/uiStore';
useUIStore.getState().clearAllLoading();
useUIStore.getState().clearAllVisibility();
```

### ✅ DO: Use Stores for Cross-Component State

```typescript
// When multiple components need the same state
const Component1 = () => {
  const [isLoading, setLoading] = useLoading('shared-operation');
  // Component 1 logic
};

const Component2 = () => {
  const [isLoading] = useLoading('shared-operation');
  // Component 2 reacts to same loading state
};
```

### ❌ DON'T: Over-use Stores

```typescript
// Bad - local form state doesn't need a store
const [email, setEmail] = useState(''); // Keep this as useState

// Good - authentication state is shared
const { isAuthenticated } = useAuth(); // Use store
```

## Migration Guide

### Migrating Manual State Management to Stores

**Before:**
```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [data, setData] = useState<Data | null>(null);

// Scattered across multiple components
```

**After:**
```typescript
// If the state is truly shared across components:
const [isLoading, setLoading] = useLoading('my-feature');

// Or for completely local state, keep useState
const [localState, setLocalState] = useState(initialValue);
```

### Migrating Prop Drilling to Stores

**Before:**
```typescript
// Parent
const [isModalVisible, setIsModalVisible] = useState(false);
<ChildComponent isVisible={isModalVisible} onClose={() => setIsModalVisible(false)} />

// Child
<GrandchildComponent isVisible={isVisible} onClose={onClose} />

// Grandchild
<GreatGrandchildComponent isVisible={isVisible} onClose={onClose} />
```

**After:**
```typescript
// Any component at any level
const { isVisible, setVisible } = useVisibility('my-modal');
<Modal isVisible={isVisible} onClose={() => setVisible(false)} />
```

## Performance Impact

### Before Optimizations
- Manual subscription system with array-based listeners
- 170 lines of boilerplate for modal management
- No selector optimization (components re-render on any change)
- Local state scattered across many components

### After Optimizations
- Zustand's optimized subscription system
- 35 lines of clean store code
- Individual selectors prevent unnecessary re-renders
- Centralized state with clear patterns

### Measured Improvements
- **Code reduction**: 80% less modal management code
- **Re-render reduction**: Individual selectors prevent unnecessary updates
- **Memory efficiency**: Post interactions only cached for interacted posts
- **Developer experience**: Type-safe, discoverable APIs with better DevTools

## Debugging

### Using Zustand DevTools (Optional)

```typescript
import { devtools } from 'zustand/middleware';

export const useMyStore = create<MyState>()(
  devtools(
    (set) => ({
      // your store
    }),
    { name: 'MyStore' }
  )
);
```

### Logging Store State

```typescript
// In development, log state changes
console.log('Current user:', useUserStore.getState().currentUser);
console.log('Post interactions:', usePostInteractionStore.getState().interactions);
```

## Summary

The store architecture now provides:
1. **Better performance** through optimized selectors
2. **Less code** through centralized state management
3. **Type safety** with full TypeScript support
4. **Maintainability** with clear patterns and conventions
5. **Developer experience** with convenience hooks and clear APIs

For questions or improvements, refer to the individual store files or open an issue.
