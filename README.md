# Chrome URL Cleaner

A Chrome extension that silently strips tracking parameters from URLs. No UI, no popups, no notifications, no hotkeys. Completely invisible — it just works.

---

## What it does

**When you navigate to a page**, the extension rewrites the address bar URL in place (via `history.replaceState`) to remove tracking parameters. By the time you look at the address bar, the URL is already clean.

**When you select a URL on a page and copy it** (Cmd+C), the cleaned version goes to your clipboard instead of the original.

**When you paste a URL** into any web page element (a text field, Gmail compose, Notion, Slack web, etc.), it's cleaned before it lands. This covers the case where a website's "Copy link" button wrote a dirty URL to your clipboard.

**On single-page apps** (Twitter/X, YouTube, Amazon), the extension cleans the URL on every navigation, not just on initial page load.

### Examples

| Before | After |
|---|---|
| `amazon.ae/dp/B0DSFRF34L?pd_rd_i=B0DS…&pf_rd_p=715b…&aref=FW6z…&th=1` | `amazon.ae/dp/B0DSFRF34L?th=1` |
| `amazon.ae/dp/B077T5RQF7/ref=sr_1_4?crid=1VW…&dib=eyJ…&keywords=…&th=1` | `amazon.ae/dp/B077T5RQF7?th=1` |
| `youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&feature=share` | `youtube.com/watch?v=dQw4w9WgXcQ` |
| `youtu.be/dQw4w9WgXcQ?si=abc123` | `youtu.be/dQw4w9WgXcQ` |
| `x.com/user/status/123?s=09&t=abcXYZ` | `x.com/user/status/123` |
| `example.com/page?utm_source=newsletter&utm_medium=email&id=42` | `example.com/page?id=42` |

---

## What it strips

### On all sites

| Parameter | Source |
|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id` | Google Analytics UTM |
| `fbclid`, `igshid` | Facebook / Instagram |
| `gclid`, `gclsrc`, `dclid`, `gbraid`, `wbraid` | Google Ads |
| `twclid` | Twitter / X |
| `msclkid` | Microsoft Ads |
| `yclid` | Yandex |
| `mc_eid`, `mc_cid` | Mailchimp |
| `mkt_tok` | Marketo |
| `_hsenc`, `_hsmi`, `hsCtaTracking` | HubSpot |
| `ck_subscriber_id` | ConvertKit |
| `vero_id` | Vero |
| `at_medium`, `at_campaign` | Apple / newsletter trackers |
| `rb_clickid` | RichBand affiliate |
| `zanpid` | Zanox / Awin affiliate |
| `trk`, `trkCampaign` | LinkedIn |
| `ncid`, `icid` | IBM / generic campaign IDs |

### On Amazon only (`*.amazon.*`)

**Product pages (`/dp/`, `/gp/product/`):** uses a whitelist — keeps `th` (variant selector) and strips literally everything else, including all `pd_rd_*`, `pf_rd_*`, `ref`, `crid`, `dib`, `aref`, `sp_csd`, and any future params Amazon adds.

**Search pages (`/s`):** strips known tracking params (`ref`, `crid`, `dib`, `qid`, `sprefix`, `tag`, etc.) while keeping `keywords` and `sr` which drive the search results.

Also strips `/ref=xxx` path segments from all Amazon URLs.

### On YouTube (`youtube.com`, `youtu.be`)

Uses a whitelist — keeps `v` (video ID), `t` (timestamp), `list` (playlist), `start`/`end` (clip markers), `search_query`. Strips everything else, including `si`, `feature`, `pp`, `ab_channel`, and any future tracking params YouTube adds.

### On Twitter / X only

`s`, `t` (share tracking tokens — not stripped universally as they're functional on other sites like GitHub).

---

## What it does NOT touch

- **`th` on Amazon** — product variant selector (size/colour). Stripping it sends you to the wrong variant.
- **`keywords`, `sr` on Amazon search pages** — they drive the search results.
- **`v`, `t`, `list` on YouTube** — video ID, timestamp, playlist.
- **Any parameter not in the lists above** — the extension only removes what it knows is tracking noise.
- **Right-click → "Copy link address"** — Chrome native UI, content scripts cannot intercept it. See [Known Limitations](#known-limitations).
- **Pasting into Chrome's address bar or native Mac apps** — content scripts only run inside web pages.

---

## Installation

This extension is not on the Chrome Web Store. Install it in Developer Mode:

1. [Download or clone this repository](https://github.com/filip-pilar/chrome-url-cleaner) to your Mac.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked**.
5. Select the `Chrome-URL-Cleaner` folder.
6. Done. No restart needed.

To update after pulling new changes, go back to `chrome://extensions` and click the reload icon (↻) on the extension card.

---

## Permissions

**Zero.** This extension declares no permissions. It uses only:
- The `copy` and `paste` DOM events (no permission required)
- `history.replaceState` (no permission required)

When you install it, Chrome shows no permission warnings. You can verify by reading `manifest.json`.

---

## How to verify it works

1. **Address bar — UTM params**: Go to `https://example.com/?utm_source=test&utm_medium=foo&keep=yes` — address bar should immediately show `https://example.com/?keep=yes`.
2. **Amazon product page**: Navigate to any Amazon product URL with `/ref=` and tracking params — address bar should show just `…/dp/ASIN?th=1`.
3. **YouTube**: Go to any YouTube video URL with `?si=...` — it should be stripped from the address bar.
4. **Copy interception**: Select the text `https://example.com/?fbclid=abc123` on any page, press Cmd+C, paste — you should get `https://example.com/`.
5. **Paste interception**: Copy a dirty URL from anywhere (even a website's "Copy link" button), paste it into a web text field — you should get the clean version.
6. **Non-URL copy is untouched**: Select `"Hello, world!"`, Cmd+C, paste — unchanged.
7. **GitHub search not broken**: Go to `https://github.com/search?q=react&s=stars` — URL unchanged.

---

## Known Limitations

**Right-click → "Copy link address"** uses Chrome's native copy mechanism and does not fire a DOM `copy` event. This cannot be intercepted by a content script. The URL in your clipboard will still have tracking params if copied this way.

**Paste into Chrome's address bar or native Mac apps** (Notes, Messages, etc.) — content scripts only run inside web page contexts. Paste interception only works within browser tabs.

**Programmatic clipboard writes that are never pasted through a page** — if something writes a dirty URL to your clipboard and you paste it directly into a native app, we have no opportunity to intercept.

---

## Contributing

**To add a universal tracking parameter** (appears on all sites): add it to `UNIVERSAL_PARAMS` in `cleaner.js`.

**To add a site-specific parameter**: add a host-check function (following `isYouTube` / `isTwitter`) and handle it in `cleanUrl`. Use a whitelist if the site has unpredictable tracking params; use a blacklist if the set is stable and small.

**To add a site to the whitelist approach** (recommended for any site that invents new tracking params regularly): follow the YouTube or Amazon product page pattern — define a `SITE_KEEP` set with only what's functional, strip everything else.

Update the "What it strips" table in this README alongside any code change, and open a pull request.

---

## How it works (technical)

Three JavaScript files, zero external dependencies, zero declared permissions:

- **`cleaner.js`** — Pure URL cleaning function (`window.__urlCleaner`). Contains all stripping logic: universal blacklist, site-specific whitelists (Amazon product pages, YouTube), and site-specific blacklists (Amazon search, Twitter/X).
- **`inject.js`** — Runs in Chrome's MAIN world to patch `history.pushState` / `history.replaceState`, catching SPA navigations (Twitter/X, YouTube, Amazon) and signalling `content.js` via a custom DOM event.
- **`content.js`** — Runs in Chrome's ISOLATED world. Three mechanisms: (1) cleans the address bar on page load and SPA navigation, (2) intercepts `copy` events to clean selected URLs, (3) intercepts `paste` events to clean URLs before they land.
