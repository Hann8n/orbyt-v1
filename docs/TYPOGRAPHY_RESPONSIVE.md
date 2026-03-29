# Responsive Typography System

## Overview

The Orbyt typography system now properly scales fonts based on:

1. **User's system font size preference** (accessibility settings)
2. **Device type** (modest tablet adjustment only)

This ensures text remains readable on all devices while respecting user accessibility preferences.

## What Changed

### Before

- ❌ Scaled fonts based on screen dimensions (smaller screens = smaller fonts)
- ❌ Ignored user's accessibility font size settings
- ❌ Static scaling at module load time
- ❌ Small phones got 0.94x penalty, making text harder to read

### After

- ✅ Uses `PixelRatio.getFontScale()` to respect system font size preferences
- ✅ Balances user preference (primary) with device size (secondary)
- ✅ Larger devices get proportional scaling (up to 1.15x cap)
- ✅ Small phones have no penalty (1.0x baseline)
- ✅ Tablets get 1.12x adjustment for reading distance
- ✅ Dynamic scaling responds to font size and orientation changes
- ✅ Accessibility compliant (WCAG)

## How to Use

### Static StyleSheets (Most Components)

For components with `StyleSheet.create`, the typography system automatically updates:

```tsx
import { Typography, FontFamily } from '@/utils/components/typography';

const styles = StyleSheet.create({
  text: {
    fontSize: Typography.sizes.body, // Auto-scales with user preference
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.medium,
  },
});
```

**Note**: These styles will reflect the current font scale. Components don't auto-update when users change font size (requires app restart or hot reload).

### Dynamic Components (Recommended for Critical Text)

Use the `useResponsiveTypography()` hook for components that should update immediately when font size changes:

```tsx
import { useResponsiveTypography } from '@/utils/components/typography';

const MyComponent = () => {
  const typo = useResponsiveTypography();

  return (
    <Text
      style={{
        fontSize: typo.sizes.title,
        lineHeight: typo.lineHeights.title,
      }}
    >
      Responsive Text
    </Text>
  );
};
```

### Using TypographyText Component

The `TypographyText` component automatically uses responsive typography:

```tsx
import { TypographyText } from '@/utils/components/typography';

<TypographyText variant="h1" weight="bold" color={Colors.purple[500]}>
  This text auto-updates with font scale changes
</TypographyText>;
```

## Font Scale Behavior

### iPhone SE (375px width, fontScale = 1.0) - Small Phone

- **No dimension penalty applied!**
- Scale: 1.0x
- Body (16pt): 16pt
- Caption (12pt): 12pt

### iPhone 14 (390px width, fontScale = 1.0) - Baseline

- Dimension scale: 1.02x (tall screen adjustment)
- Body (16pt): 16pt
- Caption (12pt): 12pt

### iPhone 14 Pro Max (430px width, fontScale = 1.0)

- Dimension scale: 1.125x (430/390 × tall screen)
- Body (16pt): 18pt
- Caption (12pt): 13pt

### iPad Pro (fontScale = 1.0) - Tablet

- Tablet adjustment: 1.25x (capped)
- Body (16pt): 20pt
- Caption (12pt): 15pt

### Any Small Phone with Large Text (fontScale = 1.3)

- User preference only: 1.3x
- Body (16pt): 21pt
- Caption (12pt): 16pt

### Larger Phones with Large Text (fontScale = 1.3)

- User preference × dimension scale (capped at 1.25x)
- iPhone 14: 1.25x → Body: 20pt
- iPhone 14 Pro Max: 1.25x → Body: 20pt

## Testing

### Test on Device

1. **iOS**: Settings → Display & Brightness → Text Size
2. **Android**: Settings → Display → Font size

Change the font size and observe:

- Components using `useResponsiveTypography()` update immediately
- Components with static styles update after hot reload
- All text remains readable at all sizes

### Test on Different Devices

- ✅ iPhone SE (small phone): Normal font sizes
- ✅ iPhone 14 Pro (standard): Normal font sizes
- ✅ iPad (tablet): 1.08x font sizes
- ✅ All devices respect user font scale

## Migration Guide

### Don't Need Changes

Most components using `Typography.sizes.X` don't need changes - they'll automatically use the new system.

### Recommended Updates

For components where immediate font scale updates are important (e.g., settings screens, accessibility-critical UI), migrate to:

```tsx
// Before
const styles = StyleSheet.create({
  text: {
    fontSize: Typography.sizes.body,
  },
});

// After (for dynamic updates)
const MyComponent = () => {
  const typo = useResponsiveTypography();

  return <Text style={{ fontSize: typo.sizes.body }}>Text</Text>;
};
```

## Technical Details

### Font Scale Range

- **Minimum**: 0.95x for standard phones, 1.0x for small phones
- **Maximum**: 1.25x (prevents layout breaking on larger devices)
- **User range**: Typically 0.8 - 1.3 (iOS/Android defaults)

### Device Adjustments

- **Small Phones** (≤375px): **1.0x minimum** - No dimension penalty, respects user fontScale only
- **Standard Phones** (390px): 1.02x (tall screen adjustment)
- **Large Phones** (430px+): Up to 1.125x (dimension-based)
- **Tablets**: 1.12-1.25x (optimal reading distance)

### Scaling Formula

```
if (isSmallPhone):
  finalScale = clamp(fontScale, min: 1.0, max: 1.3)
else:
  dimensionScale = (width / 390 or height / 844) × deviceAdjustment
  finalScale = clamp(fontScale × dimensionScale, min: 0.95, max: 1.25)

where deviceAdjustment = {
  tablet: 1.12
  tallScreen (ratio > 2.1): 1.02
  other: 1.0
}
```

### Update Mechanism

`useResponsiveTypography()` subscribes to `Dimensions.addEventListener('change')`, which fires when:

- Screen rotates
- User changes system font size
- Device is folded/unfolded (foldables)

## Alternatives Considered

### react-native-full-responsive

❌ Not chosen because:

- Adds external dependency
- Primarily for dimension-based scaling
- Overkill for font scaling needs
- Doesn't prioritize user accessibility preferences

### Native PixelRatio.getFontScale()

✅ Chosen because:

- Built into React Native
- Respects system accessibility settings
- Zero dependencies
- Standard React Native approach
- Future-proof

## References

- [React Native PixelRatio](https://reactnative.dev/docs/pixelratio)
- [iOS Dynamic Type](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Android Font Size](https://support.google.com/accessibility/android/answer/11183305)
- [WCAG Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html)
