/**
 * cleaner.js — Pure URL cleaning function.
 * Runs in the ISOLATED world. Assigns window.__urlCleaner for use by content.js.
 * No side effects. No external dependencies.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Universal tracking parameters — stripped on every hostname.
  // These are industry-standard tracking tokens that appear across all sites.
  // ---------------------------------------------------------------------------
  const UNIVERSAL_PARAMS = new Set([
    // Google Analytics UTM (the most common tracking standard on the web)
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',

    // Ad platform click IDs
    'fbclid',    // Facebook / Instagram
    'gclid',     // Google Ads
    'gclsrc',    // Google Ads (DoubleClick source)
    'dclid',     // Google Display & Video
    'gbraid',    // Google Ads (iOS app campaigns)
    'wbraid',    // Google Ads (web-to-app campaigns)
    'igshid',    // Instagram share ID
    'twclid',    // Twitter / X
    'msclkid',   // Microsoft Ads
    'yclid',     // Yandex

    // Email marketing platforms
    'mc_eid', 'mc_cid',    // Mailchimp
    'mkt_tok',              // Marketo
    '_hsenc', '_hsmi',     // HubSpot encoded / message ID
    'hsCtaTracking',        // HubSpot CTA
    'ck_subscriber_id',     // ConvertKit
    'vero_id',              // Vero
    'at_medium', 'at_campaign', // Apple / newsletter trackers

    // Affiliate networks
    'rb_clickid',  // RichBand
    'zanpid',      // Zanox / Awin

    // LinkedIn
    'trk', 'trkCampaign',

    // Misc campaign IDs
    'ncid',  // IBM / newsletter campaign
    'icid',  // generic campaign ID
  ]);

  // ---------------------------------------------------------------------------
  // Amazon product pages (/dp/, /gp/product/) — WHITELIST approach.
  //
  // Amazon invents new tracking params constantly (pd_rd_*, pf_rd_*, sp_csd,
  // aref, content-id…). A blacklist can never keep up. Instead: keep only what
  // is truly functional and strip everything else. A product page renders
  // entirely from the ASIN in the URL path — query params are either variant
  // selectors or tracking noise.
  //
  // Params kept on product pages:
  //   th  — product variant selector (size / colour). Stripping sends the user
  //         to the wrong variant. Everything else is stripped.
  // ---------------------------------------------------------------------------
  const AMAZON_PRODUCT_KEEP = new Set(['th']);

  // ---------------------------------------------------------------------------
  // Amazon non-product pages (search /s, category, etc.) — BLACKLIST approach.
  // On search pages, 'keywords' and 'sr' drive the query — they must be kept.
  // Everything else below is tracking noise safe to remove.
  // ---------------------------------------------------------------------------
  const AMAZON_SEARCH_STRIP = new Set([
    'ref',        // referral tag (query-param form)
    'crid',       // search result context ID
    'dib',        // diversification token
    'dib_tag',    // diversification tag
    'smid',       // seller marketplace ID
    '_encoding',  // legacy encoding hint
    'psc',        // subscription confirmation
    'linkCode',   // affiliate link code
    'ufe',        // UI feature flag
    'tag',        // affiliate tag
    'qid',        // query timestamp — tracking only, never functional
    'sprefix',    // autocomplete prefix tracking — never functional
    'pd_rd_i',    // product detail recommendation ID
    'pd_rd_w',    // product detail recommendation widget
    'pd_rd_wg',   // product detail recommendation widget group
    'pd_rd_r',    // product detail recommendation request
    'pf_rd_p',    // page feature recommendation page
    'pf_rd_r',    // page feature recommendation request
    'aref',       // Amazon referral
    'sp_csd',     // sponsored placement data
    'content-id', // content recommendation ID
  ]);

  // ---------------------------------------------------------------------------
  // Twitter / X — BLACKLIST.
  // Only on twitter.com and x.com — 's' and 't' are functional on other sites
  // (GitHub uses 's', many sites use 't').
  // ---------------------------------------------------------------------------
  const TWITTER_PARAMS = new Set([
    's',  // share tracking token
    't',  // tweet tracking token
  ]);

  // ---------------------------------------------------------------------------
  // YouTube video pages (/watch, /shorts/, and youtu.be) — WHITELIST approach.
  //
  // YouTube appends 'si' (share ID), 'feature', 'pp', 'ab_channel', etc. to
  // nearly every shared link. A whitelist is more robust than tracking them all.
  //
  // Params kept on YouTube video/playlist pages:
  //   v            — video ID (essential)
  //   t            — timestamp (e.g. ?t=120 or ?t=2m0s)
  //   list         — playlist ID
  //   start / end  — clip markers
  //   search_query — YouTube search results page query
  // ---------------------------------------------------------------------------
  const YOUTUBE_KEEP = new Set(['v', 't', 'list', 'start', 'end', 'search_query']);

  // ---------------------------------------------------------------------------
  // Amazon /ref= path segment regex.
  // Matches /ref= followed by any characters up to the next /, ?, #, or end.
  // The 'g' flag is required for .replace(); lastIndex is reset after .test().
  // ---------------------------------------------------------------------------
  const AMAZON_REF_PATH_RE = /\/ref=[^/?#]*/g;

  // ---------------------------------------------------------------------------
  // Host detection helpers.
  // ---------------------------------------------------------------------------

  function isAmazon(hostname) {
    // Matches: amazon.com, www.amazon.com, amazon.co.uk, amazon.de, amazon.ae, etc.
    return /(?:^|\.)amazon\.[a-z.]{2,6}$/.test(hostname);
  }

  function isTwitter(hostname) {
    return (
      hostname === 'twitter.com'     ||
      hostname === 'x.com'           ||
      hostname === 'www.twitter.com' ||
      hostname === 'www.x.com'
    );
  }

  function isYouTube(hostname) {
    // youtube.com, www.youtube.com, m.youtube.com, music.youtube.com
    return hostname === 'youtube.com'       ||
           hostname === 'www.youtube.com'   ||
           hostname === 'm.youtube.com'     ||
           hostname === 'music.youtube.com';
  }

  function isYouTubeBe(hostname) {
    // youtu.be short links — video ID is in the path, only 't' is functional
    return hostname === 'youtu.be';
  }

  // ---------------------------------------------------------------------------
  // Main cleaning function.
  // Returns the cleaned URL string, or the original string if nothing changed
  // or the input is not a cleanable URL.
  // ---------------------------------------------------------------------------
  function cleanUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch (_) {
      // Not a parseable URL: mailto:, javascript:, data:, plain text, etc.
      return rawUrl;
    }

    // Only clean http and https. Leave ftp, blob, etc. untouched.
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
        // WHITELIST: keep only AMAZON_PRODUCT_KEEP; strip everything else.
        // Handles all current and future Amazon tracking params automatically.
        for (const key of [...url.searchParams.keys()]) {
          if (!AMAZON_PRODUCT_KEEP.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        }
      } else {
        // BLACKLIST for search / non-product pages.
        // 'keywords' and 'sr' are intentionally absent — they drive results.
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
        url.pathname = url.pathname.replace(/\/\/+/g, '/'); // collapse double slashes
        changed = true;
      }
      AMAZON_REF_PATH_RE.lastIndex = 0;

    // ── YouTube ───────────────────────────────────────────────────────────────
    } else if (isYouTube(hostname)) {
      // WHITELIST: keep only known functional params; strip si, feature, pp,
      // ab_channel, and anything else YouTube appends to shared links.
      for (const key of [...url.searchParams.keys()]) {
        if (!YOUTUBE_KEEP.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }

    } else if (isYouTubeBe(hostname)) {
      // youtu.be short URLs: video ID is in path, only timestamp is functional.
      for (const key of [...url.searchParams.keys()]) {
        if (key !== 't') {
          url.searchParams.delete(key);
          changed = true;
        }
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

    // ── All other sites ────────────────────────────────────────────────────────
    } else {
      for (const key of [...url.searchParams.keys()]) {
        if (UNIVERSAL_PARAMS.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
    }

    if (!changed) {
      // Return the original string to avoid spurious URL normalization
      // (the URL constructor may add a trailing '?' or alter percent-encoding).
      return rawUrl;
    }

    return url.toString();
  }

  // Expose on window so content.js can call it.
  window.__urlCleaner = cleanUrl;
})();
