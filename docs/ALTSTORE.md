# Distributing Orbyt via AltStore PAL (EU & Japan)

This guide covers distributing Orbyt through [AltStore PAL](https://altstore.io/) — an alternative app marketplace available in the **European Union** and **Japan**. Users in these regions can install Orbyt from AltStore PAL without sideloading.

**Requirements:** Apple Developer Program membership, Orbyt in App Store Connect, and agreement to the relevant terms (EU DMA / Japan MSCA).

---

## Regions

| Region    | Regulation                             | iOS   | Notes                |
| --------- | -------------------------------------- | ----- | -------------------- |
| **EU**    | Digital Markets Act (DMA)              | 17.4+ | Available since 2024 |
| **Japan** | Mobile Software Competition Act (MSCA) | 26.2+ | Available Dec 2025   |

Users must be physically located in the region and have a local App Store account to install AltStore PAL.

---

## Terminal Script

Most steps can be run from the terminal. Use `scripts/altstore-pal.sh`:

```bash
# Register with AltStore (Step 2) — pass email, then enter Developer ID when prompted
./scripts/altstore-pal.sh register your@email.com

# Or pass both (Developer ID from App Store Connect → your name → Edit Profile → under team name)
./scripts/altstore-pal.sh register YOUR_DEVELOPER_ID your@email.com

# Or run with no args to be prompted for both:
./scripts/altstore-pal.sh register

# After adding AltStore PAL in App Store Connect (Step 3), process your ADP
./scripts/altstore-pal.sh process YOUR_ADP_ID

# Check status
./scripts/altstore-pal.sh status YOUR_ADP_ID

# Download when ready
./scripts/altstore-pal.sh download YOUR_ADP_ID
```

**Developer ID:** Use the one from **Edit Profile** (under your team name). This is _not_ the 10-character Team ID (e.g. `D8VXFBV8SJ`).

**Step 3** (add AltStore PAL in App Store Connect) must be done in the browser — there is no API for this.

---

## Step 1: Agree to Terms ✓ (if done)

- **EU:** [Alternative Terms Addendum](https://developer.apple.com/support/dma-and-apps-in-the-eu/#distribution-eu)
- **Japan:** [Updated License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) (by March 17, 2026)

---

## Step 2: Register Developer ID with AltStore (terminal)

Get your **Developer ID** from App Store Connect: click your **name** (top right) → **Edit Profile** → under your team name, find **Developer ID** and copy it. (This is _not_ the 10-character Team ID.)

```bash
curl --header "Content-Type: application/json" \
  -X POST \
  --data '{
    "developerID": "YOUR_DEVELOPER_ID_FROM_EDIT_PROFILE",
    "email": "YOUR_EMAIL@example.com"
  }' \
  https://api.altstore.io/register
```

**Response:**

```json
{
  "token": "[Your Security Token]",
  "expiration": "2025-02-26T20:30:32Z"
}
```

Save the `token` — you need it for App Store Connect.

---

## Step 3: Add AltStore PAL as Alternative Marketplace

1. Open [App Store Connect](https://appstoreconnect.apple.com/)
2. Go to **Apps** → **Orbyt** → **Distribution**
3. Under **Alternative App Marketplaces**, add AltStore PAL
4. Enter the **token** from Step 2
5. Enable Orbyt for distribution on AltStore PAL
6. Choose eligible regions (EU, Japan, or both)

Apple: [Manage distribution on an alternative app marketplace](https://developer.apple.com/help/app-store-connect/managing-alternative-distribution/manage-distribution-on-an-alternative-app-marketplace/)

---

## Step 4: Get an ADP ID (App Store Connect — one-time)

Get your ADP ID from the web UI:

1. **Apps** → **Orbyt** → **Distribution** → **History**
2. Copy the **Alternative Distribution Package ID** next to an eligible version

An ADP is generated when:

- Your Account Holder has agreed to the EU/Japan terms
- Orbyt is eligible for at least one alternative marketplace in App Store Connect
- The app version has a build supporting iOS (or iPadOS for EU)
- The version was accepted on or after Feb 8, 2024, or is Ready/Pending Release, with build from iOS 16.1 SDK or later

Apple: [Get an alternative distribution package ID](https://developer.apple.com/help/app-store-connect/distributing-apps-in-the-european-union/get-an-alternative-distribution-package-id/)

---

## Step 5: Process and Download ADP via REST API

### Option A: Automatic via App Store Connect

If marketplace notifications are set up, AltStore PAL receives your app when you submit. No manual API call needed.

### Option B: Manual Processing

If you need to trigger processing or didn’t set up notifications:

```bash
curl --header "Content-Type: application/json" \
  -X POST \
  --data '{"adpID": "YOUR_ADP_ID"}' \
  https://api.altstore.io/adps
```

### Check Status & Download

```bash
curl -X GET https://api.altstore.io/adps/YOUR_ADP_ID
```

When processing is done, the response includes `downloadURL` — use it to download the ADP.

---

## Step 6: Notarization (If Not Yet Done)

For alternative distribution, builds must be **notarized** by Apple (security and privacy review).

1. In App Store Connect, choose **Alternative distribution** when submitting
2. The app is evaluated against [Notarization Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (subset of App Review)
3. Notarized builds are required before an ADP is available

Apple: [Submit for notarization](https://developer.apple.com/help/app-store-connect/distributing-apps-in-the-european-union/submit-for-notarization)

---

## Quick Reference

| Task                  | Endpoint                                    |
| --------------------- | ------------------------------------------- |
| Register Developer ID | `POST https://api.altstore.io/register`     |
| Process ADP           | `POST https://api.altstore.io/adps`         |
| Download ADP          | `GET https://api.altstore.io/adps/[ADP_ID]` |

- [AltStore REST API](https://faq.altstore.io/developers/rest-api)
- [AltStore PAL Download](https://altstore.io/download) (EU & Japan users)
- [Apple: Alternative distribution](https://developer.apple.com/help/app-store-connect/managing-alternative-distribution/)
- [Apple: Changes in Japan](https://developer.apple.com/support/app-distribution-in-japan/)

---

## Step 7: Host ADP and Source (after approval)

Once your app is approved and notarized:

1. **Download** the ADP: `./scripts/altstore-pal.sh download YOUR_ADP_ID`
2. **Extract** the ZIP and upload the contents to your server (e.g. `https://getorbyt.com/altstore/adp/`) — preserve the exact directory structure; do not modify `manifest.json`
3. **Host the source** — use `altstore-pal-source.json` as a template; update version, buildVersion, date, size, and `downloadURL` to point at your hosted `manifest.json`
4. **Federate** (optional, for discoverability on explore.altstore.io): `curl -X POST -H "Content-Type: application/json" -d '{"source": "https://YOUR_URL/source.json"}' https://api.altstore.io/federate`

---

## Alternative: AltStore Source (Sideloading)

For worldwide sideloading (7-day signing, AltServer refresh), use `altstore-source.json` and host an IPA. See [Make a Source](https://faq.altstore.io/distribute-your-apps/make-a-source) for details. This is separate from AltStore PAL.
