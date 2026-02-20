# **orbyt**

A video app built for [Bluesky](https://bsky.social), powered by the [AT Protocol](https://atproto.com).

## Tech Stack

- **Framework**: [React Native](https://github.com/facebook/react-native) with [Expo](https://expo.dev)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (file-based navigation)
- **State (client)**: [Zustand](https://github.com/pmndrs/zustand)
- **State (server)**: [TanStack Query](https://github.com/TanStack/query) (React Query)
- **Lists**: [@shopify/flash-list](https://github.com/Shopify/flash-list)
- **Video**: [React Native Video](https://github.com/TheWidlarzGroup/react-native-video)
- **Camera**: [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- **Storage**: [MMKV](https://github.com/mrousavy/react-native-mmkv) and [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- **API**: [AT Protocol](https://github.com/bluesky-social/atproto/tree/main/packages/api) with OAuth

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
app/                        # Expo Router file-based routes
├── (tabs)/                 # Tab group: Home, Explore, Activity, Profile
├── (modals)/               # Modal routes
├── settings/               # Settings flow
├── profile/[did].tsx       # Dynamic profile
├── channel/[id].tsx        # Dynamic channel
├── post/[id].tsx           # Post detail
├── chat/[id].tsx           # Chat screen
├── create.tsx              # Video creation
└── login.tsx               # Auth entry

src/
├── components/
│   ├── ui/                 # Reusable primitives
│   ├── features/           # Domain modules (feed, video, comments, activity, profile, etc.)
│   └── layout/             # Headers and navigation
├── services/               # API layer and business logic
├── stores/                 # Zustand stores (client state)
├── hooks/                  # Custom React hooks
├── theme/                  # Design tokens (color palette)
├── utils/                  # Constants, typography, query config, helpers
├── context/                # React Context providers
└── core/                   # Core modules (feed visibility)
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and the pull request process.

## AI Context

See [AGENTS.md](AGENTS.md) for project conventions used by AI coding assistants.

## License

GPL-3.0
