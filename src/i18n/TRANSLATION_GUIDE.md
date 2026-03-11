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

## Spanish-Specific

- Use **tú** (informal) for social/consumer UI — "tu sesión", "inténtalo de nuevo"
- Prefer broadly understood phrasing across regions (Spain, Latin America)
- Use neutral terminology when possible (e.g. "personas" vs "usuarios")

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

| Key                           | en  | ja  | es     | Notes                                                                   |
| ----------------------------- | --- | --- | ------ | ----------------------------------------------------------------------- |
| `profile.live`                | 4   | 2   | 4      | LIVE badge on avatars; keep ≤4 chars                                    |
| `common.next`                 | 4   | 2   | **9**  | Button; es "SIGUIENTE" may overflow — consider "Siguiente" or shorter   |
| `video.post`                  | 4   | 2   | **8**  | Post button; es "PUBLICAR"                                              |
| `tabs.notifications`          | 13  | 2   | **14** | Tab bar; Spanish/English long                                           |
| `tabs.sortBy`                 | 7   | 4   | **11** | Filter tab                                                              |
| `profile.logOut`              | 7   | 5   | **13** | Profile menu; es "Cerrar sesión"                                        |
| `profile.unmute`              | 6   | 6   | **14** | es "Activar sonido" — consider "Quitar mute" (10)                       |
| `profile.share`               | 5   | 2   | **9**  | Profile action                                                          |
| `activity.subscriptions`      | 13  | 2   | 13     | Filter chip                                                             |
| `profile.handleIsLive`        | 10  | 7   | **18** | Header; es "{{handle}} está EN DIRECTO" — consider "{{handle}} en vivo" |
| `settings.unsubscribeChannel` | 24  | 11  | **29** | Sheet title                                                             |

### Moderate — watch layout

| Key                  | en  | ja  | es  |
| -------------------- | --- | --- | --- |
| `common.decline`     | 7   | 2   | 8   |
| `common.save`        | 4   | 2   | 7   |
| `common.done`        | 4   | 2   | 5   |
| `profile.mute`       | 4   | 4   | 9   |
| `activity.likes`     | 5   | 3   | 8   |
| `activity.replies`   | 7   | 2   | 10  |
| `settings.subscribe` | 9   | 2   | 11  |
| `comments.reply`     | 5   | 2   | 9   |

### Recommendations

- **Buttons**: Aim for ≤8–10 chars when possible; use line break or truncation fallback if longer.
- **Tabs**: Test on small screens; some locales may need `numberOfLines={1}` + ellipsis.
- **Badges** (`profile.live`): Use "LIVE", "VIVO", "ライブ" — keep ≤5 chars.
- When adding new strings to constrained UI, check all locales for length before merging.

## Testing Translations

1. Set device/simulator language to the target locale (e.g. Spanish)
2. Verify: auth flow, feed, profile, settings, video upload, chat, error messages
3. Check: relative dates (e.g. "hace 2 horas") use `getDateFnsLocale()`
4. Confirm: no missing keys — compare locale JSON keys to `en.json`

## File Structure

- **Source of truth**: `src/i18n/locales/en.json`
- **Locales**: `en.json`, `es.json`, `ja.json`
- **Registration**: `src/i18n/index.ts` — import and add to `resources`
- **Date formatting**: `src/i18n/dateFnsLocales.ts` — add date-fns locale for new language
- **Expo**: `app.json` — add language code to `expo-localization` `supportedLocales`
