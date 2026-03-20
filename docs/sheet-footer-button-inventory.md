# Sheet Footer Cancel/Done Button Inventory

All bottom sheet Cancel/Done buttons are rendered through shared infrastructure. This document inventories every usage and the layout chain.

## Layout Chain

All footer buttons flow through this structure:

```
TrueSheet footer slot
└── wrapFooter View (useMeasuredFooterHeight) — width: 100%, alignSelf: stretch
    └── SheetActionFooter
        ├── footerContainer — width: 100%, alignSelf: stretch, paddingHorizontal: 24
        └── actionsContainer (footerCenteredActions) — width: 100%, alignItems: center
            └── CancelButton (or custom footer content)
```

**Shared components:**

- `useMeasuredFooterHeight` — wraps footer in full-width View, measures height for content padding
- `SheetActionFooter` — applies `SHEET_STYLES.footerContainer` + `footerCenteredActions`
- `CancelButton` — pill-shaped button, `minHeight: 44`, centered via parent

## Pattern A: AppTrueSheet + wrapFooter + SheetActionFooter + CancelButton

Sheets that use AppTrueSheet directly and pass their own footer:

| Sheet                 | Button text      | File                                                        |
| --------------------- | ---------------- | ----------------------------------------------------------- |
| GermDisconnectSheet   | Done             | `src/components/features/profile/GermDisconnectSheet.tsx`   |
| VerificationInfoSheet | Done             | `src/components/features/badging/VerificationInfoSheet.tsx` |
| BetaInfoSheet         | Done             | `src/components/features/badging/BetaInfoSheet.tsx`         |
| LiveStreamInfoSheet   | Close            | `src/components/features/profile/LiveStreamInfoSheet.tsx`   |
| ShareSheet            | Cancel (default) | `src/components/ui/share-sheet/ShareSheet.tsx`              |

All use: `wrapFooter(<SheetActionFooter ...><CancelButton ... /></SheetActionFooter>)`

**Note:** ShareSheet passes `topPadding={footerTop}`; others use default `FOOTER_TOP_PADDING_DEFAULT` (12).

## Pattern B: VerticalListSheet (built-in footer)

VerticalListSheet uses `showCancelButton` and `cancelButtonText`:

| Consuming component      | Button text     | Via                                       |
| ------------------------ | --------------- | ----------------------------------------- |
| ChatSettingsSheet        | Done            | `cancelButtonText={t('common.done')}`     |
| SubscriptionOptionsSheet | Done            | `cancelButtonText={t('common.done')}`     |
| ProfileMenu              | Close (default) | `showCancelButton={true}`                 |
| TabNavigation            | Cancel          | `cancelButtonText={t('common.cancel')}`   |
| EmailVerificationModal   | Skip for now    | `cancelButtonText={t('auth.skipForNow')}` |
| SessionDiagnosticsTool   | Close (default) | `showCancelButton={true}`                 |

Uses: `wrapFooter(<SheetActionFooter topPadding={footerTop} ...><CancelButton ... /></SheetActionFooter>)`

## Pattern C: VerticalListSheet + customFooter

Sheets that pass a custom footer instead of the default Cancel button:

| Consuming component     | Custom footer                                              | File                                                           |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| NotificationFilterSheet | `<View style={footer}><CancelButton text="Done" /></View>` | `src/components/features/activity/NotificationFilterSheet.tsx` |

Custom footer is passed as `customFooter` and wrapped: `wrapFooter(<SheetActionFooter>{customFooter}</SheetActionFooter>)`. The custom content becomes the child of `actionsContainer`, so it is centered by `alignItems: 'center'`.

## Pattern D: ProfileMenu submenu

The Report/Block submenu uses its own AppTrueSheet with wrapFooter:

| Sheet                 | Button text | File                                              |
| --------------------- | ----------- | ------------------------------------------------- |
| ProfileMenu (submenu) | Cancel      | `src/components/features/profile/ProfileMenu.tsx` |

Uses: `wrapSubmenuFooter(<SheetActionFooter ...><CancelButton /></SheetActionFooter>)`

## Pattern E: Other footers (no Cancel/Done)

- **CommentSection** — `wrapFooter(ComposerFooter)` (comment input, not Cancel button)
- **SendToPicker** — Custom footer with send button
- **SignUpSheet, LoginSheet** — `showCancelButton={false}` (no footer)

## Centering Fix

To ensure buttons center correctly:

1. `useMeasuredFooterHeight` wrapper: `width: '100%'`, `alignSelf: 'stretch'`
2. `footerContainer`: `width: '100%'`, `alignSelf: 'stretch'`
3. `footerCenteredActions`: `width: '100%'`, `alignItems: 'center'`

Matches `KeyboardAwareFooter` which uses `width: '100%'` and `alignSelf: 'stretch'` for reliable layout.
