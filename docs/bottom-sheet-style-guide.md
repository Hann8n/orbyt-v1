# Bottom Sheet Style Guide

This guide defines the universal sheet shell for Orbyt and where feature-specific styling is allowed.

## Core Rule

All new sheets must use `AppTrueSheet` (directly or through `VerticalListSheet`) and shared sheet tokens from the barrel at `src/utils/components/truesheet` (import as `@/utils/components/truesheet`).

## Shared foundation (public barrel)

These are re-exported from `src/utils/components/truesheet/index.ts`:

- **Wrapper**
  - `AppTrueSheet` (and types `AppTrueSheetProps`, `AppTrueSheetVariant`)
- **Presets and tokens** (`trueSheetPresets.ts`)
  - `DEFAULT_SHEET_PROPS`
  - `DEFAULT_CONTENT_PADDING_HORIZONTAL`
  - `SHEET_SPACING`
  - `SHEET_TEXT_STYLES`
  - `DEFAULT_GRABBER_OPTIONS`
  - `SHEET_VARIANTS`
  - `SheetDetent` (type)
- **Shell style primitives** (`sheetStyles.ts`)
  - `SHEET_STYLES`
  - `COMPOSER_STYLES`
- **Footer / keyboard**
  - `KeyboardAwareFooter`
  - `useMeasuredFooterHeight()`
  - `getFooterBottomPadding()` — clamps safe-area bottom inset for compact footers
  - `FOOTER_TOP_PADDING_DEFAULT`
  - `CONTENT_TO_FOOTER_GAP_REDUCTION`
  - `COMPOSER_INPUT_PADDING`, `COMPOSER_INPUT_DIMENSIONS`
- **Other**
  - `SheetActionFooter`

Internal-only helpers (e.g. header padding baked into `SHEET_STYLES`, detent arrays used by `SHEET_VARIANTS`) live in `trueSheetPresets.ts` / `sheetStyles.ts`. Extend those modules if you add a new **global** variant; do not duplicate magic numbers in feature code.

## Required visual standards

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
  - Prefer `getFooterBottomPadding(safeAreaBottom)` instead of hardcoding footer bottom insets.
- **Typography**
  - Use `Typography`/`FontFamily`; do not use raw `'Figtree-*'`.
- **Colors**
  - Use `Colors` tokens only.
  - For alpha, use `hexToRGBA()` (no string alpha concatenation).

## Approved detent patterns

Prefer `AppTrueSheet` **`variant`** (backed by `SHEET_VARIANTS`) instead of passing raw `detents` arrays:

- Default — auto height (`DEFAULT_SHEET_PROPS`)
- `variant="full"`
- `variant="halfAndFull"`
- `variant="sendToPicker"`
- `variant="reactionPicker"` (requires `maxContentHeight`)

For one-off detents, pass `detents` on `AppTrueSheet` only when necessary (see Exceptions). If a pattern becomes standard, add it to `SHEET_VARIANTS` in `trueSheetPresets.ts`.

## Hybrid customization model

The shell must stay consistent, but feature accents are allowed:

- Accent button fills, icon colors, and effect styling
- Domain-specific list item visuals and chips
- Custom input rows and media blocks

Do not change shell defaults (header/footer/content primitives) just to add visual flair.

## Migration checklist

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
