# React Query + Zustand Strategy Guide

This document outlines the improved caching and fetching strategy using React Query for all API operations and Zustand for UI state management.

## Core Principles

### 1. **React Query for All API Data**
- All data fetching goes through React Query hooks
- React Query handles all caching, invalidation, and refetching
- Always fetch directly from API - no manual caching in stores

### 2. **Zustand for UI State Only**
- Zustand stores manage UI state (modals, loading indicators, visibility)
- Zustand stores handle optimistic updates for better UX
- Zustand stores provide helper functions for data transformation

### 3. **Separation of Concerns**
- **React Query**: Server state (API data, caching, synchronization)
- **Zustand**: Client state (UI state, optimistic updates, computed values)

## Architecture

### Query Key Factory

All query keys are centralized in `src/utils/queryKeys.ts`:

```typescript
import { queryKeys } from '../utils/queryKeys';

// Use consistent query keys
queryKeys.chat.conversations.list()
queryKeys.chat.messages.infinite(conversationId)
queryKeys.profiles.detail(handle)
```

### React Query Hooks

All API operations use React Query hooks in `src/hooks/`:

```typescript
// Fetching data
import { useConversations, useMessages } from '../hooks/useChat';
import { useProfileByDid } from '../services/cache/ProfileCache';

// Mutations
import { useSendMessage, useMarkConversationAsRead } from '../hooks/useChat';
```

### Zustand Stores

Stores only manage UI state and helpers:

```typescript
// ✅ Good - UI state only
const { selectedMessageId, setSelectedMessageId } = useChatStore();
const { convertToGiftedChat } = useChatStore(); // Helper function

// ❌ Bad - Don't cache API data
const { messagesCache } = useChatStore(); // Use React Query instead
```

## Migration Pattern

### Before (Manual Caching in Store)

```typescript
// ❌ Old pattern - manual caching
const { messagesCache, setMessages } = useChatStore();

useEffect(() => {
  ChatService.getMessages(id).then(result => {
    setMessages(id, result.messages);
  });
}, [id]);

const messages = messagesCache[id] || [];
```

### After (React Query)

```typescript
// ✅ New pattern - React Query handles caching
import { useMessages } from '../hooks/useChat';

const { data: messagesData } = useMessages(conversationId);
const messages = messagesData?.pages?.flatMap(page => page.messages) || [];
```

## Best Practices

### 1. Always Use Query Keys from Factory

```typescript
// ✅ Good
import { queryKeys } from '../utils/queryKeys';
queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.list() });

// ❌ Bad
queryClient.invalidateQueries({ queryKey: ['conversations'] });
```

### 2. Use Mutations for Write Operations

```typescript
// ✅ Good - use mutation hook
const sendMessage = useSendMessage();
sendMessage.mutate({ conversationId, text });

// ❌ Bad - direct API call
ChatService.sendMessage({ conversationId, text });
```

### 3. Invalidate Related Queries After Mutations

```typescript
// ✅ Good - invalidate related queries
const sendMessage = useSendMessage(); // Already handles invalidation

// Or manually:
queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages.infinite(conversationId) });
queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations.list() });
```

### 4. Use Optimistic Updates for Better UX

```typescript
// ✅ Good - optimistic update in component
const [messages, setMessages] = useState([]);

const sendMessage = useSendMessage();
sendMessage.mutate({ conversationId, text }, {
  onSuccess: () => {
    // React Query will refetch and update automatically
  },
  onError: () => {
    // Rollback optimistic update
    setMessages(prev => prev.filter(m => m.id !== optimisticId));
  },
});
```

## Query Configuration

### Default Settings (queryClient.ts)

- `staleTime`: 5 minutes (data considered fresh)
- `gcTime`: 30 minutes (cache garbage collection)
- `retry`: 1 attempt
- `refetchOnWindowFocus`: false
- `refetchOnMount`: false
- `refetchOnReconnect`: false

### Per-Query Overrides

```typescript
// Real-time data (messages)
useMessages(conversationId, { 
  refetchInterval: 10000, // Poll every 10 seconds
  staleTime: 10 * 1000,  // 10 seconds
});

// Static data (profiles)
useProfileByDid(did, {
  staleTime: 24 * 60 * 60 * 1000, // 24 hours
});
```

## Store Refactoring Checklist

When refactoring a store to use React Query:

1. ✅ Remove all API data caching from store
2. ✅ Create React Query hooks for all API operations
3. ✅ Update components to use React Query hooks
4. ✅ Keep only UI state and helper functions in store
5. ✅ Use query key factory for consistency
6. ✅ Add mutation hooks for write operations
7. ✅ Configure proper invalidation strategies

## Examples

### Chat Store (Refactored)

**Before**: Cached messages and conversations in Zustand
**After**: Only UI state and helper functions

```typescript
// chatStore.ts - UI state only
interface ChatState {
  selectedMessageId: string | null;
  setSelectedMessageId: (id: string | null) => void;
  convertToGiftedChat: (messages, userId, avatar, otherUser) => ChatMessage[];
}
```

### Chat Hooks (New)

```typescript
// useChat.ts - All API operations
export function useConversations() { /* ... */ }
export function useMessages(conversationId) { /* ... */ }
export function useSendMessage() { /* ... */ }
```

## Benefits

1. **Single Source of Truth**: React Query is the only cache
2. **Automatic Synchronization**: React Query handles refetching and invalidation
3. **Better Performance**: Deduplication, background updates, smart caching
4. **Simpler Code**: No manual cache management
5. **Better UX**: Optimistic updates, loading states, error handling
6. **Type Safety**: Centralized query keys prevent typos

## Migration Status

- ✅ Chat operations (conversations, messages)
- ✅ Query key factory
- ✅ Query client configuration
- ⏳ AtprotoService operations (in progress)
- ⏳ Mutation hooks for all write operations (in progress)
