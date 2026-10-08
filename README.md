# Orbyt

A video-first social app for the [Bluesky](https://bsky.social) network, built on the [AT Protocol](https://atproto.com). Watch, create, and share short-form video content with the decentralized social graph.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Expo](https://img.shields.io/badge/Expo-55-black.svg)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.83-61DAFB.svg)](https://reactnative.dev)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Building](#building)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

---

## Features

- **Video Feed** — Infinite scroll feeds with channels, bookmarks, and personalized content
- **Video Creation** — Record, trim, and post videos with FFmpeg-powered processing
- **Chat** — Direct messaging with streak tracking and conversation threads
- **Activity** — Notifications, likes, reposts, and replies
- **Profiles** — User profiles with Orbyt color themes, follows, and content
- **Moderation** — Built-in moderation tools and hidden post management
- **OAuth Auth** — Secure sign-in via AT Protocol OAuth
- **Offline-Ready** — MMKV storage and React Query caching for responsive UX

---

## Tech Stack

| Layer              | Technology                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime**        | Expo 55, React Native 0.83                                                                                                                         |
| **Routing**        | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based)                                                                             |
| **State (client)** | [Zustand](https://github.com/pmndrs/zustand)                                                                                                       |
| **State (server)** | [TanStack React Query](https://github.com/TanStack/query)                                                                                          |
| **API**            | [AT Protocol](https://github.com/bluesky-social/atproto) + [OAuth](https://github.com/bluesky-social/atproto/tree/main/packages/oauth-client-expo) |
| **Video**          | expo-video, ffmpeg-kit-react-native                                                                                                                |
| **Lists**          | [@shopify/flash-list](https://github.com/Shopify/flash-list)                                                                                       |
| **Sheets**         | [react-native-true-sheet](https://github.com/lodev09/react-native-true-sheet)                                                                      |
| **Animation**      | react-native-reanimated, react-native-gesture-handler                                                                                              |
| **Storage**        | react-native-mmkv, expo-secure-store                                                                                                               |
| **Graphics**       | @shopify/react-native-skia, react-native-svg                                                                                                       |

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **Yarn** package manager
- **Expo development client** (required; the app uses `--dev-client`)
- **iOS**: Xcode and CocoaPods
- **Android**: Android Studio and configured SDK

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Hann8n/orbyt-app.git
   cd orbyt-app
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

3. **Start the development server**

   ```bash
   yarn start
   ```

4. **Run on a device or simulator**

   ```bash
   yarn ios
   # or
   yarn android
   ```

### Usage

- Sign in with a Bluesky account via OAuth when prompted.
- Browse feeds, channels, and profiles; tap a video to watch.
- Use the create flow to record or pick a video, trim it, and post.

---

## Project Structure

```
orbyt-app/
├── app/                          # Expo Router file-based routes
│   ├── (tabs)/                   # Tab group: Home, Explore, Activity, Profile
│   ├── (modals)/                 # Modal routes
│   ├── settings/                 # Settings flow
│   ├── profile/[did].tsx         # Dynamic profile by DID
│   ├── channel/[id].tsx          # Dynamic channel feed
│   ├── post/[id].tsx             # Post detail
│   ├── chat/[id].tsx             # Chat screen
│   ├── create.tsx                # Video creation
│   └── login.tsx                 # Auth entry
│
└── src/
    ├── components/
    │   ├── ui/                   # Reusable primitives (Icon, Button, Card, Modal, Input)
    │   ├── features/             # Domain modules (feed, video, comments, activity, profile, moderation)
    │   └── layout/               # Headers and navigation
    ├── services/                 # API layer and business logic
    │   ├── api/                  # AtprotoService, FeedService, GraphService, ChatService, etc.
    │   ├── auth/                 # Gateway sign-in
    │   ├── video/                # FFmpeg processing and editing
    │   └── ...
    ├── stores/                   # Zustand stores (client state)
    ├── hooks/                    # Custom React hooks
    ├── theme/                    # Design tokens (Colors palette)
    ├── utils/                    # Constants, typography, query config, formatters
    ├── context/                  # React Context providers
    └── core/                     # Visibility system for feed/video playback
```

---

## Building

The project uses [EAS Build](https://docs.expo.dev/build/introduction/) for production builds:

```bash
# Development build
yarn build:dev

# Preview build
yarn build:preview

# Production build
yarn build:prod
```

Additional scripts:

```bash
yarn type-check        # TypeScript check
yarn lint              # ESLint
yarn format:check      # Prettier check
yarn check             # Run all checks
```

---

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development guidelines and code style
- Pull request process
- Testing expectations

---

## Documentation

| Resource                           | Description                                 |
| ---------------------------------- | ------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development guidelines and PR process       |
| [AGENTS.md](AGENTS.md)             | Conventions for AI coding assistants        |
| `.cursor/rules/`                   | Architecture, styling, and convention rules |

---

## License

This project is licensed under the **GPL-3.0** License.
