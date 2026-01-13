# Copilot Instructions for Orbyt

## Project Overview

Orbyt is a video app built for Bluesky using React Native and Expo. This is a mobile-first application with support for iOS and Android platforms.

## Tech Stack

- **Framework**: React Native (v0.81.5) with Expo (~54.0.30)
- **Language**: TypeScript (v5.9.2) - strictly typed
- **Navigation**: React Navigation (native stack)
- **State Management**: TanStack Query (React Query) for server state, Zustand for local state
- **Video**: React Native Video, Expo Video, FFmpeg Kit
- **Camera**: Expo Camera
- **Storage**: AsyncStorage, SecureStore, MMKV
- **API**: Atproto (Bluesky API)
- **UI**: React Native Reanimated, Gesture Handler, FlashList

## Code Style and Conventions

### General Guidelines

- Always use TypeScript for all code
- Follow functional programming patterns with React hooks
- Keep components focused and modular
- Use descriptive variable and function names
- Follow the existing code patterns and conventions in the repository

### TypeScript Standards

- **Avoid `any` types** - use proper types or `unknown` when necessary
- Define interfaces for complex objects
- Use type inference where appropriate
- Enable strict mode is enabled in tsconfig.json
- Use proper return types for functions

### React and React Native

- Use functional components with hooks (never class components)
- Follow React hooks best practices (proper dependency arrays, etc.)
- Use `react-jsx` transform (no need to import React in every file)
- Avoid inline styles (use StyleSheet or appropriate styling solutions)
- Split platform-specific components when needed
- Handle both iOS and Android platform differences

### Logging

**Important**: Always use the centralized `logger` utility instead of `console.log`:

```typescript
import { logger } from '@/utils/logger';

// Use appropriate log levels
logger.debug('Debug message', { component: 'MyComponent' });
logger.info('Info message', { component: 'MyComponent', action: 'fetchData' });
logger.warn('Warning message', { component: 'MyComponent' });
logger.error('Error occurred', error, { component: 'MyComponent', action: 'submitForm' });
```

- Use `debug` for development debugging
- Use `info` for general information
- Use `warn` for warnings
- Use `error` for errors with proper error objects and context
- Always include context (component, action) in logs

### Code Quality

- Run linting: `yarn lint` (fix with `yarn lint:fix`)
- Run type checking: `yarn type-check`
- Check formatting: `yarn format:check` (fix with `yarn format`)
- Run all checks: `yarn check`

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── features/       # Feature-specific components
│   ├── layout/         # Layout components
│   └── ui/            # Basic UI components
├── screens/            # Screen components
├── navigation/         # Navigation configuration
├── services/          # API and business logic
├── hooks/             # Custom React hooks
├── stores/            # State management (Zustand stores)
├── utils/             # Utility functions (including logger)
├── types/             # TypeScript type definitions
├── context/           # React contexts
├── core/              # Core functionality
└── assets/            # Images, fonts, and other assets
```

### Path Aliases

The project uses TypeScript path aliases:
- `@/*` maps to `src/*`
- `@stores/*` maps to `src/stores/*`

Always use these aliases for imports within the project.

## Development Commands

- `yarn start` - Start Expo development server
- `yarn android` - Run on Android
- `yarn ios` - Run on iOS
- `yarn type-check` - Run TypeScript type checking
- `yarn lint` - Lint the codebase
- `yarn lint:fix` - Auto-fix linting issues
- `yarn format` - Format code with Prettier
- `yarn format:check` - Check code formatting
- `yarn check` - Run all quality checks (type-check, lint, format:check)

## Build Commands

- `yarn build:dev` - EAS development build
- `yarn build:preview` - EAS preview build
- `yarn build:prod` - EAS production build

## Testing Guidance

- Test changes thoroughly on both iOS and Android when possible
- Test edge cases and error scenarios
- Ensure the app builds and runs correctly
- Verify no regressions in existing functionality

## Dependency Management

- Use `yarn` as the package manager (not npm)
- Follow `yarn.lock` for consistent dependencies
- Be cautious when adding new dependencies
- Prefer using existing libraries in the project

## Common Patterns

### API Calls with TanStack Query

- Use TanStack Query for all server state management
- Define query keys consistently
- Handle loading, error, and success states properly
- Use proper TypeScript types for query results

### State Management

- Use TanStack Query for server/API state
- Use Zustand for global client state
- Use React hooks (useState, useReducer) for local component state
- Keep state as close to where it's used as possible

### Error Handling

- Always handle errors gracefully
- Use try-catch blocks for async operations
- Log errors with the logger utility including context
- Provide user-friendly error messages

## Security and Privacy

- Never commit secrets or API keys to the repository
- Use SecureStore for sensitive data
- Validate and sanitize user inputs
- Follow security best practices for mobile apps

## Git and Commits

- Write clear, descriptive commit messages
- Keep commits focused and atomic
- Follow the existing commit message style
- Ensure code passes all quality checks before committing

## License

This project is licensed under GPL-3.0.
