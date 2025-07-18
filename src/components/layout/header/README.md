# Universal Header System

A highly efficient and reusable header component system designed for different feed types in the Orbyt app.

## Overview

The Universal Header System provides a consistent, performant, and flexible way to display headers across different feed types (profiles, channels, etc.) while maintaining the same UI and functionality. Safe area handling is managed by the parent components (like ListFeedView) rather than the header itself.

## Components

### Core Components

- **`UniversalHeader`** - The base header component that handles layout, actions, and content
- **`HeaderSkeleton`** - Loading skeleton component for headers
- **`TabNavigation`** - Reusable tab navigation component

### Specialized Headers

- **`ProfileHeader`** - Profile-specific header with follow/unfollow, verification, and logout actions
- **`ChannelHeader`** - Channel-specific header with subscribe/unsubscribe, edit, and delete actions

## Features

### Performance Optimizations

- **Memoized Components**: All components use React.memo for optimal re-rendering
- **Efficient Re-renders**: Only re-renders when necessary props change
- **Optimized Layout**: Uses native components and efficient styling
- **Lazy Loading**: Skeleton components for smooth loading states

### Flexibility

- **Customizable Actions**: Dynamic action buttons based on context
- **Flexible Content**: Support for custom description components (like TextWithLinks)
- **Theme Support**: Dynamic colors based on profile/channel themes
- **Navigation Integration**: Built-in back button and navigation handling

### Reusability

- **Universal Base**: Single base component for all header types
- **Composable**: Easy to create new header types by extending the base
- **Consistent API**: Same interface across all header components
- **Safe Area Management**: Headers rely on parent components for safe area handling

### Shared Elements

The Universal Header system now includes shared elements to ensure UI consistency:

- **Custom Action Layouts**: Standardized positioning and styling for action buttons
- **Menu Icons**: Consistent menu icon placement and interaction
- **Button Groups**: Support for primary/secondary button combinations
- **Loading States**: Unified loading indicators across all headers
- **Button Sizes**: Standardized small/medium/large button sizes

## Important Notes

### Safe Area Handling

The Universal Header system **does not** handle safe areas internally. Safe area management is handled by parent components such as:
- `ListFeedView` for feed screens
- `SafeAreaView` wrappers in screen components
- Other container components that manage layout

This design decision allows for:
- More flexible layout control
- Better integration with scrollable content
- Consistent safe area behavior across the app
- Reduced complexity in header components

## Usage

### Basic Profile Header

```tsx
import { ProfileHeader, TabNavigation } from '../components/UniversalHeader';

const ProfileScreen = () => {
  const [activeTab, setActiveTab] = useState('posts');
  
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ProfileHeader
        handle="user.handle"
        showBackButton={true}
        isOwnProfile={false}
      >
        <TabNavigation
          tabs={[
            { id: 'posts', label: 'posts' },
            { id: 'reposts', label: 'reposts' },
            { id: 'likes', label: 'likes' }
          ]}
          activeTab={activeTab}
          onTabPress={setActiveTab}
          textColor={profileColors.textColor}
        />
      </ProfileHeader>
    </SafeAreaView>
  );
};
```

### Custom Header with Custom Actions

```tsx
import { UniversalHeader, HeaderAction, HeaderContent, CustomActionLayout } from '../components/UniversalHeader';

const CustomHeader = () => {
  const content: HeaderContent = {
    avatar: 'https://example.com/avatar.jpg',
    title: 'Custom Title',
    subtitle: 'Custom Subtitle',
    description: 'Custom description with links',
  };

  const customActions: CustomActionLayout[] = [
    {
      type: 'button',
      menuIcon: {
        name: 'more-horizontal',
        onPress: () => console.log('Menu pressed'),
      },
      buttons: [
        {
          id: 'action1',
          label: 'Action',
          icon: 'plus',
          onPress: () => console.log('Action pressed'),
        },
      ],
    },
  ];

  return (
    <UniversalHeader
      content={content}
      customActions={customActions}
      showBackButton={true}
      backgroundColor="#000"
      textColor="#fff"
    >
      <CustomDescriptionComponent />
    </UniversalHeader>
  );
};
```

### Channel Header

```tsx
import { ChannelHeader } from '../components/UniversalHeader';

const ChannelScreen = () => {
  const channel = {
    id: 'channel1',
    name: 'My Channel',
    description: 'Channel description',
    memberCount: 1234,
    isSubscribed: false,
    isOwner: false,
  };

  return (
    <ChannelHeader
      channel={channel}
      showBackButton={true}
      onSubscribe={handleSubscribe}
    />
  );
};
```

## API Reference

### UniversalHeader Props

```tsx
interface UniversalHeaderProps {
  content: HeaderContent;
  actions?: HeaderAction[];
  customActions?: CustomActionLayout[];
  showBackButton?: boolean;
  onBackPress?: () => void;
  backgroundColor?: string;
  textColor?: string;
  isLoading?: boolean;
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
  style?: any;
}
```

### HeaderContent

```tsx
interface HeaderContent {
  avatar?: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: React.ReactNode;
  onAvatarPress?: () => void;
  onTitlePress?: () => void;
  isEditMode?: boolean;
  avatarStyle?: 'circle' | 'rounded-square';
}
```

### HeaderAction

```tsx
interface HeaderAction {
  id: string;
  label: string;
  icon?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}
```

### CustomActionLayout

```tsx
interface CustomActionLayout {
  type: 'menu' | 'button' | 'button-group';
  position?: 'top-right' | 'top-left';
  menuIcon?: {
    name: string;
    size?: number;
    onPress: () => void;
  };
  buttons?: HeaderAction[];
  buttonGroup?: {
    primary: HeaderAction;
    secondary?: HeaderAction;
  };
}
```

### TabNavigation Props

```tsx
interface TabNavigationProps {
  tabs: TabOption[];
  activeTab: string;
  onTabPress: (tabId: string) => void;
  textColor?: string;
  backgroundColor?: string;
  style?: any;
  viewMode?: 'list' | 'grid';
  onViewModeChange?: (mode: 'list' | 'grid') => void;
  showViewToggle?: boolean;
}
```

## Creating New Header Types

To create a new header type (e.g., for groups, events, etc.):

1. Create a new component that uses `UniversalHeader`
2. Define the specific data interface
3. Create action handlers for the specific use case
4. Pass the appropriate content and custom actions to `UniversalHeader`

Example:

```tsx
const GroupHeader: React.FC<GroupHeaderProps> = ({ group, ...props }) => {
  const content: HeaderContent = {
    avatar: group.avatar,
    title: group.name,
    subtitle: `${group.memberCount} members`,
    description: group.description,
  };

  const customActions: CustomActionLayout[] = [
    {
      type: 'button',
      buttons: [
        {
          id: 'join',
          label: group.isMember ? 'Leave' : 'Join',
          icon: group.isMember ? 'exit' : 'plus',
          onPress: () => handleJoinLeave(group.id),
        },
      ],
    },
  ];

  return (
    <UniversalHeader
      content={content}
      customActions={customActions}
      {...props}
    />
  );
};
```

## Performance Benefits

1. **Reduced Bundle Size**: Single base component instead of multiple similar components
2. **Better Caching**: React Query integration for efficient data management
3. **Optimized Re-renders**: Memoization prevents unnecessary re-renders
4. **Efficient Layout**: Native components and optimized styling
5. **Lazy Loading**: Skeleton components for smooth loading states
6. **Simplified Safe Area**: Delegating safe area management to parent components
7. **Shared Elements**: Consistent UI patterns across all headers

## Migration from Old System

The new system is a drop-in replacement for the old profile header system. The main changes are:

1. **Simplified API**: Cleaner, more intuitive props
2. **Better Performance**: Memoized components and optimized rendering
3. **More Flexible**: Easy to extend for new feed types
4. **Consistent Design**: Unified design language across all headers
5. **Delegated Safe Areas**: Safe area handling moved to parent components
6. **Shared Elements**: All headers now use the same UI patterns

## Future Enhancements

- **Animation Support**: Smooth transitions between states
- **Theme System**: Dynamic theming based on content
- **Accessibility**: Enhanced accessibility features
- **Internationalization**: Multi-language support
- **Custom Layouts**: More layout options for different use cases 