# Orbyt black vs neutral black — inventory for follow-up work

**Canonical app black:** `Colors.black` / `neutral[975]` = `**#05070a`\*\* (`src/theme/colors.ts`, `CANONICAL_BLACK`).

**Intent:** Replace _UI_ uses of pure RGB black (`#000`, `rgba(0,0,0,…)`) with this cool-tinted black so scrims, shadows, and fallbacks match “Orbyt black.”

---

## Already migrated (this pass)

| Area                                                              | Notes                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Colors.overlay.black15` … `black95`                              | RGB is `5, 7, 10` (same as `#05070a`).                                                                             |
| `Shadows.small` … `xlarge`                                        | `boxShadow` tint uses `rgba(5,7,10,…)`.                                                                            |
| Ad-hoc `boxShadow`                                                | `PopUpModal`, `usersearch`, `buttonPresets`, `KlipyGifPickerSheet`, `SendToPicker`, `UniversalHeader` — same tint. |
| `src/assets/embed-video-gradient-shim.png`, `corner-gradient.png` | Regenerated via `yarn assets:recolor-gradients` (keeps alpha; RGB = Orbyt black).                                  |
| `OrbytChannelsGrid` bottom gradient                               | Uses `Colors.overlay.black50` (no separate `hexToRGBA` call).                                                      |
| `getBestColor()` fallbacks                                        | `src/utils/formatting/colors.ts` — `#000000` → `Colors.black` for default / contrast text on light backgrounds.    |
| `ChannelService` channel color fallbacks                          | `'#000000'` → `Colors.black` where a default dark is intended.                                                     |

---

## Remaining: pure black outside theme (optional / review)

These are **not** automatically wrong — decide per case (icon masks, docs, third-party SVG, etc.).

### 1. `src/components/ui/Icon.tsx`

- **Line ~18:** `FOLLOW_CHECK_CIRCLE_ICON_SVG` — `stroke="#000"` on SVG template (paired with `fill="currentColor"`).
- **Line ~636:** Large inline SVG path `fill="#000000"` (likely a specific glyph asset).
- **Line ~1091–1098:** `AT_LINE_ICON_SVG` uses `#000000FF` as a replaceable placeholder; runtime `.replace(/#000000FF/g, color)`.

**Follow-up:** If any visible stroke/fill should match Orbyt black when not overridden, consider `currentColor`, `Colors.black`, or a placeholder token aligned with `#05070a`.

### 2. Documentation / skills (non-runtime)

- `.agents/skills/building-native-ui/SKILL.md` — example `rgba(0, 0, 0, 0.05)`.
- `.agents/skills/building-native-ui/references/gradients.md` — `rgba(0, 0, 0, …)` in gradient examples.

**Follow-up:** Refresh examples to `rgba(5, 7, 10, …)` or reference `Colors.overlay.`\* / `Colors.black` so new UI matches the product rule.

### 3. Comment / JSDoc only

- `src/utils/formatting/colors.ts` — JSDoc example still says `'#000000'` for `blendColors`; harmless, update for consistency if desired.

### 4. Raster / design assets (not exhaustive)

Raster PNGs/JPEGs in `src/assets/` (e.g. logos, splash, sprites) may still contain **embedded** pure black pixels. No grep replaces that.

**Follow-up:** Visual QA on dark mode surfaces; re-export from design if banding or mismatch appears.

### 5. Native project files

Search outside TS/TSX if needed:

```bash
rg 'rgba\(0,\s*0,\s*0|#000000|#000\b' ios android --glob '!**/Pods/**'
```

---

## Verification commands (for the next agent)

```bash
# App TS/TSX: should only hit Icon.tsx + JSDoc after migration
rg "rgba\(0,\s*0,\s*0|#000000|'#000'" src app --glob '*.{ts,tsx}'

# Regenerate gradient PNGs if CANONICAL_BLACK ever changes (keep script default in sync)
yarn assets:recolor-gradients
```

---

## Script sync

`scripts/recolor-orbyt-gradient-pngs.ts` defaults to hex `05070a`. If `CANONICAL_BLACK` changes in `colors.ts`, update the script default **or** pass `ORBYT_BLACK=` / CLI arg when running.
