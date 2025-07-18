# UI Component System

This directory contains the standardized UI components and design system for the Orbyt app.

## Overview

The UI system provides a comprehensive set of reusable components, standardized colors, and utility functions that ensure consistency across the entire application.

## File Structure

- `UI.tsx` - Main UI system with standardized components and enhanced color palette
- `Icon.tsx` - Icon component using pixelarticons and streamline-pixel
- `PopUpModal.tsx` - Modal component for dialogs and overlays
- `BottomToolBar.tsx` - Bottom toolbar component for video editing
- `ShareSheet.tsx` - Share sheet component for social interactions
- `RelativeDate.tsx` - Relative date formatting component
- `TextWithLinks.tsx` - Text component with clickable links

## Color System

### Enhanced Color Palette

The new color system provides:

- **WCAG AA Compliance**: All color combinations meet accessibility standards
- **Semantic Naming**: Colors are organized by purpose and meaning
- **Consistent Contrast**: Proper contrast ratios for text readability
- **Dark Theme Optimized**: Designed specifically for dark mode

### Color Categories

#### Brand Colors
```typescript
Colors.BRAND.PRIMARY    // #000000 - Primary brand color
Colors.BRAND.SECONDARY  // #FFFFFF - Secondary brand color  
Colors.BRAND.ACCENT     // #3797F0 - Primary accent
```

#### Text Colors
```typescript
Colors.TEXT.PRIMARY     // #FFFFFF - Primary text
Colors.TEXT.SECONDARY   // #D1D1E1 - Secondary text
Colors.TEXT.TERTIARY    // #848895 - Tertiary text
Colors.TEXT.DISABLED    // #666666 - Disabled text
```

#### Background Colors
```typescript
Colors.BACKGROUND.PRIMARY   // #000000 - Main app background
Colors.BACKGROUND.SECONDARY // #1A1A1A - Secondary background
Colors.BACKGROUND.TERTIARY  // #2A2A2A - Tertiary background
Colors.BACKGROUND.ITEM      // #1C1C1E - Form fields, inputs
```

#### Interactive Colors
```typescript
Colors.INTERACTIVE.HEART.ACTIVE    // #FE4359 - Active heart
Colors.INTERACTIVE.REPOST.ACTIVE   // #00D4AA - Active repost
Colors.INTERACTIVE.COMMENT.ACTIVE  // #3797F0 - Active comment
```

#### Status Colors
```typescript
Colors.STATUS.SUCCESS  // #00D4AA - Success states
Colors.STATUS.ERROR    // #FE4359 - Error states
Colors.STATUS.WARNING  // #FFB800 - Warning states
Colors.STATUS.INFO     // #3797F0 - Info states
```

## Standardized Components

### Button Component

A flexible button component with multiple variants and sizes.

```typescript
import { Button } from './UI';

<Button
  title="Click Me"
  onPress={() => {}}
  variant="primary"     // primary | secondary | outline | ghost | danger | success
  size="medium"         // small | medium | large
  disabled={false}
  loading={false}
  icon="heart"
  iconPosition="left"   // left | right
/>
```

### Icon Component

Icon component supporting multiple icon sets.

```typescript
import { Icon } from './UI';

<Icon
  name="heart"
  size={24}
  color={Colors.TEXT.PRIMARY}
  iconSet="pixelarticons"  // pixelarticons | streamline-pixel
/>
```

### Card Component

Standardized card component with consistent styling.

```typescript
import { Card } from './UI';

<Card
  padding={16}
  margin={8}
  backgroundColor={Colors.BACKGROUND.CARD}
>
  <Text>Card content</Text>
</Card>
```

### Modal Component

Enhanced modal component with actions support.

```typescript
import { Modal } from './UI';

<Modal
  visible={true}
  onClose={() => {}}
  title="Modal Title"
  subtitle="Modal subtitle"
  actions={[
    { label: "Cancel", onPress: () => {}, variant: "secondary" },
    { label: "Confirm", onPress: () => {}, variant: "primary" }
  ]}
>
  <Text>Modal content</Text>
</Modal>
```

### Input Component

Standardized input component with validation support.

```typescript
import { Input } from './UI';

<Input
  value={text}
  onChangeText={setText}
  placeholder="Enter text..."
  secureTextEntry={false}
  error="Error message"
  icon="search"
  onIconPress={() => {}}
/>
```

### Loading Component

Loading indicator with optional text.

```typescript
import { Loading } from './UI';

<Loading
  size="large"
  color={Colors.BRAND.ACCENT}
  text="Loading..."
/>
```

### Badge Component

Badge component for status indicators.

```typescript
import { Badge } from './UI';

<Badge
  text="New"
  variant="success"  // primary | secondary | success | error | warning
  size="medium"      // small | medium | large
/>
```

## Utility Functions

### Color Utilities

```typescript
import { hexToRGBA, isColorDark, getContrastRatio, meetsContrastGuidelines } from './UI';

// Convert hex to rgba
const rgba = hexToRGBA('#3797F0', 0.5);

// Check if color is dark
const isDark = isColorDark('#000000');

// Get contrast ratio
const ratio = getContrastRatio('#000000', '#FFFFFF');

// Check WCAG compliance
const isAccessible = meetsContrastGuidelines('#000000', '#FFFFFF');
```

## Migration Guide

### From Old Color System

Replace imports:
```typescript
// Old
import { BRAND, TEXT, UI } from '../../utils/formatting/Colors';

// New
import { Colors } from './UI';
```

Update color references:
```typescript
// Old
backgroundColor: BRAND.PRIMARY
color: TEXT.PRIMARY

// New
backgroundColor: Colors.BRAND.PRIMARY
color: Colors.TEXT.PRIMARY
```

### From Old Components

Replace custom buttons:
```typescript
// Old
<TouchableOpacity style={styles.button}>
  <Text style={styles.buttonText}>Click</Text>
</TouchableOpacity>

// New
<Button title="Click" onPress={() => {}} variant="primary" />
```

Replace custom modals:
```typescript
// Old
<Modal>
  <View style={styles.modalContent}>
    <Text>Content</Text>
  </View>
</Modal>

// New
<Modal visible={true} onClose={() => {}} title="Title">
  <Text>Content</Text>
</Modal>
```

## Best Practices

1. **Use Standardized Components**: Always use the provided UI components instead of creating custom ones
2. **Follow Color System**: Use the defined color palette for consistency
3. **Accessibility First**: All components meet WCAG AA standards
4. **Consistent Spacing**: Use the defined spacing system
5. **Typography**: Use the Firma font family consistently

## Accessibility Features

- All color combinations meet WCAG AA contrast requirements
- Components support screen readers
- Proper focus management in interactive elements
- Semantic color usage for status indicators

## Performance Considerations

- Components are optimized for React Native performance
- Icons are cached and optimized
- Minimal re-renders through proper memoization
- Efficient color calculations

## Contributing

When adding new components:

1. Follow the existing patterns in `UI.tsx`
2. Include proper TypeScript types
3. Add accessibility features
4. Test with different color themes
5. Update this documentation 