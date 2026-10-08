# Orbyt Translation Guide

Guidelines for translating the Orbyt app so translations match the app's voice, context, and conventions.

## Voice & Tone

- **Friendly, clear, conversational** — avoid stiff or overly formal language
- **Actionable** — error messages should tell the user what to do ("Please try again", "Check your connection")
- **Polite** — confirmations use "Are you sure…?" style phrasing

## Formatting Conventions

| Context                             | Convention                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| Tabs, feed states, placeholder text | Lowercase (e.g. "home", "nothing on the air...")               |
| Modals, buttons, errors             | Title case (e.g. "Sign In", "Cannot Open Post")                |
| Placeholders                        | Informal, encouraging (e.g. "Say something nice...", "search") |

## Brand Names

**Keep untranslated** in all locales:

- orbyt
- Bluesky
- bsky.social
- blacksky.app
- planyt
- atmosphere

## Interpolation Placeholders

Preserve placeholders exactly as in the source. Do not translate or move them:

- `{{handle}}` — user handle (e.g. @user.bsky.social)
- `{{name}}` — display name or channel name
- `{{formattedCount}}` — formatted number (e.g. "1.2K")
- `{{count}}` — numeric count
- `{{postType}}` — "video" or "post" (translated elsewhere)
- `{{date}}`, `{{time}}` — formatted date/time
- `{{author}}`, `{{identifier}}`, `{{email}}`, `{{title}}`, `{{error}}`, `{{emoji}}`, `{{domain}}`
- `{{trimmed}}`, `{{available}}` — video duration values

Example: `"Tu sesión de @{{handle}} ha caducado"` — keep `{{handle}}` as-is.

## Domain Context

Orbyt is a **video-first social app** on the Bluesky network (AT Protocol). Familiar terms:

- **Handle** — user identifier (e.g. you.orbyt.video)
- **Feed** — timeline of posts
- **Repost** — sharing another user's post
- **DM** — direct message
- **Channel** — curated feed/category
- **Starter pack** — collection of accounts to follow
- **Verification** — trusted verifier badge

Use the target language's natural equivalent for these concepts when available.

## API-Driven Text Localization Contract

For user-facing text coming from API payloads (such as header banners and channels), use this pattern:

- Keep a base/default field (`title`, `subtitle`, `displayName`, `description`)
- Add optional translation maps next to that field:
  - `titleTranslations`, `subtitleTranslations`
  - `displayNameTranslations`, `descriptionTranslations`
- Translation map type: `Record<string, string>` using locale tags as keys (`en`, `es`, `es-LA`, `fr`, etc.)

Client-side fallback order:

1. Exact locale (for example `es-LA`)
2. Base language (for example `es`)
3. Base/default field value

This keeps API localization backward compatible and prevents blank UI text when a locale variant is missing.

## Spanish-Specific

- Use **tú** (informal) for social/consumer UI — "tu sesión", "inténtalo de nuevo"

## Spanish (Latin America) Specific

- **es-LA** (`es-LA.json`) — used for es-MX, es-AR, es-CO, es-CL, es-PE, es-419
- Prefer **agregar** over añadir, **verificar** over comprobar, **reportar** over denunciar
- Use **video** (no accent) instead of vídeo
- Use **expirada/expirado** instead of caducada/caducado
- **Configuración** for "Settings" (Ajustes is common in Spain)
- Use **repostear / reposteado / reposteos** (not reenviar) — aligns with social-media language in LATAM
- Use **tu mix** (not tu mezcla) — common digital/media terminology
- Use **ver más contenido** (not explorar más contenido) — lighter, more app-native tone
- Use **post** (not publicación) — younger LATAM users commonly use "post"; "publicación" sounds formal
- **Match English case** — e.g. profile.reposts = lowercase ("reposteos"), activity.reposts = Title case ("Reposteos"); tabs/feed states = lowercase

## French-Specific

- Use **tu** (informal) for social/consumer UI — "ta session", "réessaie"

## German-Specific

- Use **du** (informal) for social/consumer UI — "deine Sitzung", "versuche es erneut"

## Korean-Specific

- Use **해요체** (informal polite / 요-form) for social/consumer UI — "세션이 만료되었어요", "다시 시도해 주세요"

## Do's and Don'ts

**Do:**

- Match the length and tone of the source string
- Use the target language's conventions for numbers, dates, and punctuation
- Test with real interpolation values to ensure strings fit in the UI

**Don't:**

- Translate brand names
- Remove or rename interpolation keys
- Use overly formal or archaic language
- Add or remove sentence structure that changes meaning

## Length-Sensitive Strings (May Cause UI Breaks)

These keys have **varying character lengths** across locales. Keep translations **short** where noted to avoid overflow in constrained UI (tabs, buttons, badges, chips).

### Critical — must stay compact

| Key                           | en  | de  | ja  | ko  | es     | fr  | Notes                                     |
| ----------------------------- | --- | --- | --- | --- | ------ | --- | ----------------------------------------- |
| `profile.live`                | 4   | 4   | 2   | 4   | 4      | 6   | LIVE badge on avatars; keep ≤6 chars      |
| `common.next`                 | 4   | 6   | 2   | 2   | **9**  | 8   | Button; ko "다음"                         |
| `video.post`                  | 4   | 6   | 2   | 2   | **8**  | 8   | Post button                               |
| `tabs.notifications`          | 13  | 16  | 2   | 2   | **14** | 13  | Tab bar; de "Benachrichtigungen"          |
| `tabs.sortBy`                 | 7   | 8   | 4   | 2   | **11** | 5   | Filter tab                                |
| `profile.logOut`              | 7   | 8   | 5   | 6   | **13** | 11  | Profile menu                              |
| `profile.unmute`              | 6   | 20  | 6   | 4   | **14** | 9   | de "Stummschaltung aufheben" — keep short |
| `profile.share`               | 5   | 6   | 2   | 2   | **9**  | 8   | Profile action                            |
| `activity.subscriptions`      | 13  | 5   | 2   | 2   | 13     | 11  | Filter chip; de "Abos"                    |
| `profile.handleIsLive`        | 10  | 14  | 7   | 14  | **18** | 18  | de "{{handle}} ist LIVE"                  |
| `settings.unsubscribeChannel` | 24  | 19  | 11  | 8   | **29** | 15  | Sheet title; ko "채널 구독 취소"          |

### Moderate — watch layout

| Key                  | en  | de  | ja  | ko  | es  | fr  |
| -------------------- | --- | --- | --- | --- | --- | --- |
| `common.decline`     | 7   | 7   | 2   | 2   | 8   | 6   |
| `common.save`        | 4   | 8   | 2   | 2   | 7   | 10  |
| `common.done`        | 4   | 6   | 2   | 2   | 5   | 8   |
| `profile.mute`       | 4   | 15  | 4   | 4   | 9   | 8   |
| `activity.likes`     | 5   | 5   | 3   | 3   | 8   | 6   |
| `activity.replies`   | 7   | 9   | 2   | 2   | 10  | 8   |
| `settings.subscribe` | 9   | 10  | 2   | 2   | 11  | 9   |
| `comments.reply`     | 5   | 9   | 2   | 2   | 9   | 8   |

### Recommendations

- **Buttons**: Aim for ≤8–10 chars when possible; use line break or truncation fallback if longer.
- **Tabs**: Test on small screens; some locales may need `numberOfLines={1}` + ellipsis.
- **Badges** (`profile.live`): Use "LIVE", "VIVO", "ライブ" — keep ≤5 chars.
- When adding new strings to constrained UI, check all locales for length before merging.

## Testing Translations

1. Set device/simulator language to the target locale (e.g. Spanish)
2. Verify: auth flow, feed, profile, settings, video upload, error messages
3. Check: relative dates (e.g. "hace 2 horas") use `getDateFnsLocale()`
4. Confirm: no missing keys — compare locale JSON keys to `en.json`

## File Structure

- **Source of truth**: `src/i18n/locales/en.json`
- **Locales**: `de.json`, `en.json`, `es.json`, `es-LA.json`, `fr.json`, `ja.json`, `ko.json`, `pt-BR.json`
- **Registration**: `src/i18n/index.ts` — import and add to `resources`
- **Date formatting**: `src/i18n/dateFnsLocales.ts` — add date-fns locale for new language
- **Expo**: `app.json` — add language code to `expo-localization` `supportedLocales`
