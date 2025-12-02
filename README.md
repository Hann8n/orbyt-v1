![Orbyt Banner](src/assets/orbyt-banner.png)

# **orbyt**

A new video app built for bluesky

## Tech Stack

- **Framework**: [React Native](https://github.com/facebook/react-native)
- **Navigation**: [React Navigation](https://github.com/react-navigation/react-navigation)
- **State Management**: [TanStack Query](https://github.com/TanStack/query) (React Query)
- **Video**: [React Native Video](https://github.com/TheWidlarzGroup/react-native-video)
- **Camera**: [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- **Storage**: AsyncStorage and SecureStore
- **API**: [Atproto](https://github.com/bluesky-social/atproto/tree/main/packages/api)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Yarn package manager
- Expo CLI

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Hann8n/orbyt
```

2. Install dependencies:
```bash
yarn install
```

3. Start the development server:
```bash
yarn start
```

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
└── utils/             # Utility functions
```

## Building

The project uses EAS Build for creating production builds:

```bash
# Development build
yarn build:dev

# Preview build
yarn build:preview

# Production build
yarn build:prod
```

## License

MIT 
