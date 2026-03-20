# Bottom Sheet Style Guide

This guide defines the universal sheet shell for Orbyt and where feature-specific styling is allowed.

## Core Rule

All new sheets must use `AppTrueSheet` (directly or through `VerticalListSheet`) and shared sheet tokens from `src/utils/components/truesheet`.

## Shared Foundation

- **Wrapper**
  - `AppTrueSheet` from `src/utils/components/truesheet/AppTrueSheet.tsx`
- **Presets and tokens**
  - `DEFAULT_SHEET_PROPS`
  - `SHEET_SPACING`
  - `SHEET_TEXT_STYLES`
  - `SHEET_DETENTS`
  - `DEFAULT_GRABBER_OPTIONS`
  - `SHEET_VARIANTS`
- **Shell style primitives**
  - `SHEET_STYLES` from `src/utils/components/truesheet/sheetStyles.ts`
- **Footer behavior**
  - `useMeasuredFooterHeight()`
  - `FOOTER_BOTTOM_PADDING_MIN`
  - `FOOTER_BOTTOM_PADDING_MAX`
  - `FOOTER_TOP_PADDING_DEFAULT`
  - `CONTENT_TO_FOOTER_GAP_REDUCTION`

## Required Visual Standards

- **Header**
  - Use `header` prop on `AppTrueSheet` for top row chrome.
  - Use `SHEET_STYLES.headerContainer` and `SHEET_STYLES.headerTitle`.
  - Keep close/custom action aligned to the right.
- **Content**
  - Use canonical content inset (`DEFAULT_CONTENT_PADDING_HORIZONTAL` or `SHEET_STYLES.contentContainer`).
  - Keep rhythm and spacing token-driven; avoid ad-hoc numbers unless feature-specific and documented.
- **Footer**
  - Use measured footer height (`useMeasuredFooterHeight`) for bottom content padding.
  - Footer background defaults to `Colors.black`.
  - Use `KeyboardAwareFooter` where text input exists in sheet footer.
- **Typography**
  - Use `Typography`/`FontFamily`; do not use raw `'Figtree-*'`.
- **Colors**
  - Use `Colors` tokens only.
  - For alpha, use `hexToRGBA()` (no string alpha concatenation).

## Approved Detent Patterns

- `SHEET_DETENTS.auto` (default)
- `SHEET_DETENTS.full`
- `SHEET_DETENTS.halfAndFull`
- `SHEET_DETENTS.sendToPicker`

Use `AppTrueSheet` variants when possible:

- `variant="full"`
- `variant="halfAndFull"`
- `variant="sendToPicker"`
- `variant="reactionPicker"` (requires `maxContentHeight`)

## Hybrid Customization Model

The shell must stay consistent, but feature accents are allowed:

- Accent button fills, icon colors, and effect styling
- Domain-specific list item visuals and chips
- Custom input rows and media blocks

Do not change shell defaults (header/footer/content primitives) just to add visual flair.

## Migration Checklist

- Replace direct `TrueSheet` usage with `AppTrueSheet` unless required.
- Move header into `header` prop (not inline in content) for standard sheets.
- Replace raw font family/size values with typography tokens.
- Replace raw rgba/hex-alpha hacks with `Colors` + `hexToRGBA()`.
- Remove inline style objects where practical; prefer `StyleSheet.create()`.
- Verify footer overlap handling with `useMeasuredFooterHeight()`.

## Exceptions

Allowed only when functionally required:

- Sheet-specific detents outside standard presets
- Non-standard footer top padding for feature UX
- Explicit per-screen spacing tuned for media-first layouts
- **Media pickers** (e.g. Klipy GIF): use `SHEET_SPACING.mediaPickerHorizontal` (16) for wider insets in full-screen grid layouts

If used, keep exceptions localized and comment why.
