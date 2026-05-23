/**
 * cleaner.js — Pure URL cleaning function.
 * Runs in the ISOLATED world. Assigns window.__urlCleaner for use by content.js.
 * No side effects. No external dependencies.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Universal tracking parameters — stripped on every hostname.
  // ---------------------------------------------------------------------------
  const UNIVERSAL_PARAMS = new Set([

    // ── Google Analytics UTM (original + extended set Google added later) ──────
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'utm_source_platform',    // extended UTM: platform (e.g. "Search Ads 360")
    'utm_creative_format',    // extended UTM: ad creative format
    'utm_marketing_tactic',   // extended UTM: marketing tactic

    // ── Google Ads & Shopping click / source IDs ──────────────────────────────
    'gclid',          // Google Ads Click ID
    'gclsrc',         // Google Ads DoubleClick source
    'dclid',          // Google Display & Video 360
    'gbraid',         // Google Ads — iOS app campaigns (SKAdNetwork)
    'wbraid',         // Google Ads — web-to-app campaigns
    'gad_source',     // Google Ads source tag (introduced 2023, replaces 'gad')
    'gad_campaignid', // Google Ads campaign ID tag
    'srsltid',        // Google Shopping / Merchant Center referral tracking

    // ── Google Analytics cross-domain linker ─────────────────────────────────
    '_ga',   // GA session linker (privacy risk when shared: passes your session)
    '_gl',   // GA4 cross-domain linker (newer form of _ga)

    // ── Meta (Facebook / Instagram) ──────────────────────────────────────────
    'fbclid',          // Facebook Click ID
    'igshid',          // Instagram Share ID (older)
    'igsh',            // Instagram Share (newer, shorter form)
    'mibextid',        // Meta mobile sharing / browser extension ID

    // ── TikTok ────────────────────────────────────────────────────────────────
    'ttclid',   // TikTok Click ID (ad attribution)
    'ttadid',   // TikTok Ad ID

    // ── Twitter / X ───────────────────────────────────────────────────────────
    'twclid',   // Twitter/X Click ID (universal — s/t are Twitter-only, handled below)

    // ── Microsoft Ads ─────────────────────────────────────────────────────────
    'msclkid',  // Microsoft Ads Click ID

    // ── Snapchat ──────────────────────────────────────────────────────────────
    'ScCid',   // Snapchat Click ID
    'scadid',  // Snapchat Ad ID

    // ── Pinterest ─────────────────────────────────────────────────────────────
    'epik',    // Pinterest Click ID

    // ── Nextdoor ──────────────────────────────────────────────────────────────
    'ndclid',  // Nextdoor Click ID

    // ── Yandex ────────────────────────────────────────────────────────────────
    'yclid',   // Yandex Click ID

    // ── Email marketing platforms ─────────────────────────────────────────────
    'mc_eid', 'mc_cid',                              // Mailchimp
    'mkt_tok',                                        // Marketo
    '_hsenc', '_hsmi', 'hsCtaTracking',              // HubSpot (email tracking)
    'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src',      // HubSpot (paid ads)
    'hsa_ad',  'hsa_acc', 'hsa_net', 'hsa_kw',
    'hsa_tgt', 'hsa_ver',
    '_ke', '_kx',                                    // Klaviyo
    'ck_subscriber_id',                              // ConvertKit
    'vero_id',                                       // Vero
    'dm_i',                                          // dotdigital
    'at_medium', 'at_campaign',                      // Apple/newsletter trackers

    // ── Analytics platforms ───────────────────────────────────────────────────
    'mtm_campaign', 'mtm_source', 'mtm_medium',      // Matomo
    'mtm_content',  'mtm_cid',   'mtm_group',
    'pk_campaign',  'pk_source',  'pk_medium',       // Piwik (Matomo's old name)
    'pk_content',   'pk_kwd',     'pk_cid',

    // ── Advertising & attribution ─────────────────────────────────────────────
    'ef_id',             // Adobe Advertising Cloud / Everflow
    's_kwcid',           // Adobe Analytics keyword cost ID (AMO)
    'irclickid',         // Impact Radius (Airbnb, Uber, etc.)
    '_branch_match_id',  // Branch (mobile deep linking, very widely used)

    // ── Affiliate networks ────────────────────────────────────────────────────
    'rb_clickid',  // RichBand
    'zanpid',      // Zanox / Awin

    // ── LinkedIn ──────────────────────────────────────────────────────────────
    'trk', 'trkCampaign',

    // ── Generic campaign IDs ──────────────────────────────────────────────────
    'ncid',  // IBM / newsletter campaign
    'icid',  // generic campaign ID
  ]);

  // ---------------------------------------------------------------------------
  // Amazon product pages (/dp/, /gp/product/) — WHITELIST approach.
  //
  // Amazon invents new tracking params constantly. A blacklist can never keep
  // up. Keep only what is truly functional; strip everything else.
  //
  //   th  — product variant selector (size / colour). Stripping sends the user
  //         to the wrong variant. Everything else is stripped.
  // ---------------------------------------------------------------------------
  const AMAZON_PRODUCT_KEEP = new Set(['th']);

  // ---------------------------------------------------------------------------
  // Amazon non-product pages (search /s, category, etc.) — BLACKLIST approach.
  // 'keywords' and 'sr' drive the search query — must be kept.
  // ---------------------------------------------------------------------------
  const AMAZON_SEARCH_STRIP = new Set([
    'ref', 'crid', 'dib', 'dib_tag', 'smid', '_encoding', 'psc', 'linkCode',
    'ufe', 'tag', 'qid', 'sprefix',
    'pd_rd_i', 'pd_rd_w', 'pd_rd_wg', 'pd_rd_r',
    'pf_rd_p', 'pf_rd_r',
    'aref', 'sp_csd', 'content-id',
  ]);

  // ---------------------------------------------------------------------------
  // Twitter / X — extra params beyond what's in UNIVERSAL_PARAMS.
  // 's' and 't' are functional on GitHub and many other sites, so they are
  // NOT in the universal list — only stripped on Twitter/X domains.
  // ---------------------------------------------------------------------------
  const TWITTER_PARAMS = new Set(['s', 't']);

  // ---------------------------------------------------------------------------
  // YouTube video / playlist pages — WHITELIST approach.
  //
  // Keep only known functional params; strip si, feature, pp, ab_channel,
  // and anything else YouTube appends to shared links.
  // ---------------------------------------------------------------------------
  const YOUTUBE_KEEP = new Set(['v', 't', 'list', 'start', 'end', 'search_query']);

  // ---------------------------------------------------------------------------
  // Amazon /ref= path segment regex.
  // ---------------------------------------------------------------------------
  const AMAZON_REF_PATH_RE = /\/ref=[^/?#]*/g;

  // ---------------------------------------------------------------------------
  // Host detection helpers.
  // ---------------------------------------------------------------------------

  function isAmazon(hostname) {
    return /(?:^|\.)amazon\.[a-z.]{2,6}$/.test(hostname);
  }

  function isTwitter(hostname) {
    return hostname === 'twitter.com'     ||
           hostname === 'x.com'           ||
           hostname === 'www.twitter.com' ||
           hostname === 'www.x.com';
  }

  function isYouTube(hostname) {
    return hostname === 'youtube.com'     ||
           hostname === 'www.youtube.com' ||
           hostname === 'm.youtube.com'   ||
           hostname === 'music.youtube.com';
  }

  function isYouTubeBe(hostname) {
    return hostname === 'youtu.be';
  }

  function isTikTok(hostname) {
    // TikTok video IDs are always in the path — no query params are functional.
    return hostname === 'tiktok.com'   ||
           hostname === 'www.tiktok.com' ||
           hostname === 'm.tiktok.com';
  }

  // ---------------------------------------------------------------------------
  // Main cleaning function.
  // Returns the cleaned URL string, or the original string if nothing changed.
  // ---------------------------------------------------------------------------
  function cleanUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch (_) {
      return rawUrl; // not a parseable URL
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return rawUrl;
    }

    const hostname = url.hostname.toLowerCase();
    let changed = false;

    // ── Amazon ────────────────────────────────────────────────────────────────
    if (isAmazon(hostname)) {
      const isProductPage =
        url.pathname.includes('/dp/') || url.pathname.includes('/gp/product/');

      if (isProductPage) {
        for (const key of [...url.searchParams.keys()]) {
          if (!AMAZON_PRODUCT_KEEP.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        }
      } else {
        const toRemove = new Set(UNIVERSAL_PARAMS);
        for (const p of AMAZON_SEARCH_STRIP) toRemove.add(p);
        for (const key of [...url.searchParams.keys()]) {
          if (toRemove.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        }
      }

      // Strip /ref= path segments (e.g. /dp/ASIN/ref=sr_1_1 → /dp/ASIN).
      AMAZON_REF_PATH_RE.lastIndex = 0;
      if (AMAZON_REF_PATH_RE.test(url.pathname)) {
        AMAZON_REF_PATH_RE.lastIndex = 0;
        url.pathname = url.pathname.replace(AMAZON_REF_PATH_RE, '');
        url.pathname = url.pathname.replace(/\/\/+/g, '/');
        changed = true;
      }
      AMAZON_REF_PATH_RE.lastIndex = 0;

    // ── YouTube ───────────────────────────────────────────────────────────────
    } else if (isYouTube(hostname)) {
      for (const key of [...url.searchParams.keys()]) {
        if (!YOUTUBE_KEEP.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }

    // ── youtu.be ──────────────────────────────────────────────────────────────
    } else if (isYouTubeBe(hostname)) {
      for (const key of [...url.searchParams.keys()]) {
        if (key !== 't') {
          url.searchParams.delete(key);
          changed = true;
        }
      }

    // ── TikTok ────────────────────────────────────────────────────────────────
    } else if (isTikTok(hostname)) {
      // Video IDs are always in the path. Every query param is tracking noise.
      for (const key of [...url.searchParams.keys()]) {
        url.searchParams.delete(key);
        changed = true;
      }

    // ── Twitter / X ───────────────────────────────────────────────────────────
    } else if (isTwitter(hostname)) {
      const toRemove = new Set(UNIVERSAL_PARAMS);
      for (const p of TWITTER_PARAMS) toRemove.add(p);
      for (const key of [...url.searchParams.keys()]) {
        if (toRemove.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }

    // ── All other sites ───────────────────────────────────────────────────────
    } else {
      for (const key of [...url.searchParams.keys()]) {
        if (UNIVERSAL_PARAMS.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
    }

    if (!changed) {
      // Return the original string — avoids spurious URL normalization
      // (the URL constructor may add a trailing '?' or alter percent-encoding).
      return rawUrl;
    }

    return url.toString();
  }

  // Expose on window so content.js can call it.
  window.__urlCleaner = cleanUrl;
})();
