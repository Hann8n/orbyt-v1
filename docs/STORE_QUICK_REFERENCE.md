# Store Quick Reference

Quick reference for Orbyt's Zustand store architecture.

## Import Patterns

```typescript
// Core stores
import { useAppStore } from '../stores';
import { useAuth, useCurrentUser, useAccountManagement } from '../stores/userStore';
import { usePostInteractionStore } from '../stores';

// Modal management
import { useAccountSwitcher, useCommentSection, useShareSheet } from '../stores/modalStore';
// Or backwards-compatible:
import { useGlobalAccountSwitcher, useGlobalCommentSection, useGlobalShareSheet } from '../hooks/useGlobalModals';

// UI patterns
import { useLoading, useVisibility } from '../stores/uiStore';
```

## Common Patterns

### Authentication & User State
```typescript
// Check auth status
const { isAuthenticated, isAuthenticating } = useAuth();

// Get current user
const { currentUser } = useCurrentUser();

// Account management
const { savedAccounts, switchAccount, removeAccount } = useAccountManagement();

// Sign in/out
const { signIn, signOut } = useAuth();
await signIn('user@example.com');
await signOut();
```

### Post Interactions (Like/Repost)
```typescript
const { updatePostInteraction, getPostInteraction } = usePostInteractionStore();

// Get persisted state
const persisted = getPostInteraction(postUri, defaultState);

// Update after successful API call
updatePostInteraction(postUri, {
  isLiked: true,
  likeCount: newCount,
  likeUri: likeUri,
});
```

### Modal Management
```typescript
// Account switcher
const { visible, presentAccountSwitcher, dismissAccountSwitcher } = useAccountSwitcher();

// Comment section
const { presentCommentSection, dismissCommentSection } = useCommentSection();
presentCommentSection({ post, totalLikes, isLiked, onToggleLike });

// Share sheet
const { presentShareSheet, dismissShareSheet } = useShareSheet();
presentShareSheet({ postUri, authorDid, feedOption });
```

### UI State Patterns
```typescript
// Loading state (across components)
const [isLoading, setLoading] = useLoading('unique-operation-key');
setLoading(true);
await doWork();
setLoading(false);

// Visibility state (dropdowns, modals)
const { isVisible, setVisible, toggle } = useVisibility('dropdown-menu');
```

## Selector Optimization

### ✅ Good - Granular Selectors
```typescript
const isAuthenticated = useUserStore(state => state.isAuthenticated);
const currentUser = useUserStore(state => state.currentUser);
const signIn = useUserStore(state => state.signIn);
```

### ❌ Bad - Subscribe to Everything
```typescript
const userStore = useUserStore(); // Re-renders on ANY change
const { isAuthenticated, currentUser, ...everything } = useUserStore();
```

### ✅ Better - Use Convenience Hooks
```typescript
const { isAuthenticated, signIn } = useAuth();
const { currentUser } = useCurrentUser();
```

## When to Use Each Store

### useAppStore
- App initialization state
- Global app configuration
- Font loading status

### userStore (via hooks)
- Authentication state
- User profile data
- Account management
- Channel subscriptions
- Feed settings

### postInteractionStore
- Like/repost state persistence
- Any interaction that should survive navigation
- Session-scoped data

### followStore
- Follow/unfollow state persistence
- Works alongside ProfileCache
- DID-based for stability
- Session-scoped data

### modalStore
- Share sheet
- Comment section
- Account switcher
- Any global modal/sheet

### uiStore
- Loading states (multi-component)
- Visibility states (dropdowns, menus)
- Shared UI toggles

## Anti-Patterns to Avoid

### ❌ Don't: Store Local Form State
```typescript
// Bad - form input doesn't need global state
const [email] = useUIStore(state => state.forms.email);

// Good - keep it local
const [email, setEmail] = useState('');
```

### ❌ Don't: Duplicate State
```typescript
// Bad - copying store state to local state
const userFromStore = useUserStore(state => state.currentUser);
const [localUser, setLocalUser] = useState(userFromStore);

// Good - use store directly
const { currentUser } = useCurrentUser();
```

### ❌ Don't: Subscribe to Computed Values
```typescript
// Bad - re-computes on every render
const fullName = useUserStore(state => 
  `${state.currentUser?.firstName} ${state.currentUser?.lastName}`
);

// Good - compute locally with useMemo
const { currentUser } = useCurrentUser();
const fullName = useMemo(() => 
  `${currentUser?.firstName} ${currentUser?.lastName}`,
  [currentUser]
);
```

## Cleanup & Lifecycle

### Automatic Cleanup
```typescript
// PostInteractionStore - cleared on logout/account switch
// Happens automatically via userStore.clearAllCaches()

// UIStore - persists until manually cleared
useUIStore.getState().clearAllLoading();
useUIStore.getState().clearAllVisibility();
```

### Manual Cleanup (if needed)
```typescript
// Clear specific loading state
useUIStore.getState().setLoading('my-key', false);

// Clear specific visibility
useUIStore.getState().setVisibility('my-modal', false);

// Clear all
useUIStore.getState().clearAllLoading();
useUIStore.getState().clearAllVisibility();
```

## Testing

### Accessing Store State in Tests
```typescript
import { useUserStore } from '../stores/userStore';

// Get current state
const state = useUserStore.getState();
expect(state.isAuthenticated).toBe(true);

// Call actions
useUserStore.getState().signOut();

// Reset store
useUserStore.setState({ isAuthenticated: false, currentUser: null });
```

## TypeScript Tips

### Strong Typing
```typescript
// Stores are fully typed - no need for manual types
const { currentUser } = useCurrentUser(); // currentUser is typed automatically

// Actions are typed
const { updatePostInteraction } = usePostInteractionStore();
updatePostInteraction(postUri, {
  isLiked: true, // TypeScript knows these fields
  likeCount: 10,
});
```

### Selector Return Types
```typescript
// TypeScript infers return type
const isAuthenticated = useUserStore(state => state.isAuthenticated); // boolean
const currentUser = useUserStore(state => state.currentUser); // User | null
```

## Performance Tips

1. **Use individual selectors** - Only subscribe to what you need
2. **Use convenience hooks** - Pre-optimized with proper selectors
3. **Keep local state local** - Don't put everything in stores
4. **Use shallow comparison** - For object/array selectors (if needed)
5. **Avoid computed values in selectors** - Compute in component with useMemo

## More Information

See [STORE_OPTIMIZATION_GUIDE.md](./STORE_OPTIMIZATION_GUIDE.md) for detailed explanations and migration guides.
