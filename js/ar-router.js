import { supportsQuickLook, activateQuickLook } from './ar-ios.js';

// ============================================================================
// Unified "View in Your Room" AR entry point (Task 5).
//
// Single place that decides which of the three AR buttons in index.html is
// shown, so the shopper always sees exactly one "View in Your Room" control
// and never has to know or choose which AR technology their device uses:
//
//   1. WebXR feature detection first (navigator.xr.isSessionSupported) —
//      real capability check, not a user-agent guess. If supported, this is
//      Android/Chrome; js/ar.js's own click handler (already attached to
//      #arButton at module load, untouched here) takes it from there.
//   2. Quick Look detection second, via js/ar-ios.js's supportsQuickLook()
//      (the WebKit-documented a.relList.supports('ar') check) — this is the
//      iOS/Safari path.
//   3. Otherwise, a graceful fallback button — still visible and clickable,
//      not a silent disappearance. As of this file's most recent change,
//      that fallback branches into two different messages (see "In-app
//      browser detection" below) instead of always showing the same
//      generic text.
//
// This file only toggles the "hidden" class on the pre-existing buttons/
// anchor/panel and does not duplicate any AR logic that already lives in
// js/ar.js or js/ar-ios.js — those two files (the actual WebXR and Quick
// Look implementations) are untouched by this change.
// ============================================================================

const arButton = document.getElementById('arButton');               // Android/WebXR (js/ar.js)
const arButtonIOS = document.getElementById('arButtonIOS');         // iOS/Quick Look (js/ar-ios.js)
const arButtonUnsupported = document.getElementById('arButtonUnsupported');
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

const inAppPanel = document.getElementById('inAppPanel');
const inAppPanelText = document.getElementById('inAppPanelText');
const inAppPanelClose = document.getElementById('inAppPanelClose');
const inAppOpenBrowserBtn = document.getElementById('inAppOpenBrowserBtn');
const inAppCopyLinkBtn = document.getElementById('inAppCopyLinkBtn');

function showToast(msg, ms = 4200) {
  toastText.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

async function detectWebXR() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

// ============================================================================
// In-app browser detection.
//
// Apps like Instagram, Facebook, WhatsApp, LinkedIn etc. open links inside
// their own embedded WebView rather than real Safari/Chrome. That WebView
// can share the same rendering engine as the real browser (WebKit on iOS,
// Chromium on Android) but deliberately does NOT expose the same camera/AR
// APIs — navigator.xr and Quick Look's rel="ar" both come back unsupported
// there even on a phone that would otherwise handle AR fine. That's a
// restriction of the host app's WebView configuration, not something
// fixable from our own AR code (confirmed against the actual WebXR/Quick
// Look feature-detection above — both already correctly report false
// inside these WebViews, they just weren't being distinguished from a
// genuinely unsupported browser).
//
// Detection is user-agent substring matching, since these apps identify
// themselves in the UA string. This is the standard approach for this
// specific problem — there isn't a reliable capability-based test for "am I
// in a restricted embedded WebView" the way there is for e.g. WebXR itself,
// because these WebViews often still pass ordinary capability checks; they
// just silently withhold specific sensitive APIs like camera/AR. The list
// below is necessarily non-exhaustive (new in-app browsers appear, UA
// strings change) but covers the apps named in this task plus a few other
// very common ones.
// ============================================================================
const IN_APP_BROWSER_PATTERNS = [
  { id: 'instagram', label: 'Instagram', re: /Instagram/i },
  { id: 'facebook', label: 'Facebook', re: /FBAN|FBAV|FB_IAB/i },
  { id: 'messenger', label: 'Messenger', re: /MessengerLiteForiOS|OrcaAndroid/i },
  { id: 'whatsapp', label: 'WhatsApp', re: /WhatsApp/i },
  { id: 'linkedin', label: 'LinkedIn', re: /LinkedInApp/i },
  { id: 'tiktok', label: 'TikTok', re: /BytedanceWebview|musical_ly|TikTok/i },
  { id: 'twitter', label: 'X', re: /Twitter/i },
  { id: 'snapchat', label: 'Snapchat', re: /Snapchat/i },
  { id: 'line', label: 'Line', re: /\bLine\// },
  { id: 'wechat', label: 'WeChat', re: /MicroMessenger/i },
  { id: 'pinterest', label: 'Pinterest', re: /Pinterest/i },
];

function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  for (const entry of IN_APP_BROWSER_PATTERNS) {
    if (entry.re.test(ua)) return entry;
  }
  return null;
}

function isIOS() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

// Best-effort attempts to hand off to the system's real browser. None of
// these are guaranteed — see the honest breakdown of what does/doesn't
// work in the Task report — so a manual "Copy Link" path always exists too.
function attemptOpenInSystemBrowser(url) {
  if (/Android/i.test(navigator.userAgent)) {
    // Android's documented Intent URI scheme: tells the OS "hand this off
    // to a real browser" rather than the current app. Many (not all)
    // Android in-app WebViews honor navigation to an intent:// URL; some
    // block it. S.browser_fallback_url gives the OS somewhere to go if no
    // browser intercepts the intent at all.
    const bare = url.replace(/^https?:\/\//, '');
    window.location.href =
      `intent://${bare}#Intent;scheme=https;action=android.intent.action.VIEW;` +
      `category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return;
  }
  if (isIOS()) {
    // Undocumented iOS scheme some in-app browsers still hand off to real
    // Safari on. Not an Apple-published API — Apple has quietly broken
    // this trick before and could again, and several in-app browsers
    // (Instagram's reportedly among them) intercept and block it outright.
    // Fires as a best effort; Copy Link is the guaranteed fallback.
    window.location.href = url.replace(/^https?:\/\//i, 'x-safari-https://');
    return;
  }
  // Unrecognized platform: no known scheme trick — Copy Link is the path.
}

async function copyCurrentLink() {
  const url = window.location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Clipboard API is itself sometimes blocked inside restrictive
      // in-app WebViews — fall through to the legacy method below.
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function showInAppPanel(entry) {
  const target = isIOS() ? 'Safari' : 'Chrome';
  inAppPanelText.textContent =
    `AR needs your device's main browser — ${entry.label}'s built-in browser blocks camera/AR access. ` +
    `Tap the ••• or share icon above and choose "Open in ${target}" to use this feature.`;
  inAppPanel.classList.remove('hidden');
}

inAppPanelClose.addEventListener('click', () => inAppPanel.classList.add('hidden'));
inAppOpenBrowserBtn.addEventListener('click', () => attemptOpenInSystemBrowser(window.location.href));
inAppCopyLinkBtn.addEventListener('click', async () => {
  const ok = await copyCurrentLink();
  showToast(ok ? 'Link copied — paste it into Safari or Chrome.' : 'Couldn’t copy automatically — copy the link from the address bar instead.');
});

function activateUnsupported() {
  arButtonUnsupported.classList.remove('hidden');
}

arButtonUnsupported.addEventListener('click', () => {
  const inApp = detectInAppBrowser();
  if (inApp) {
    showInAppPanel(inApp);
  } else {
    // Genuinely unsupported device/browser (e.g. an old browser, an
    // unsupported desktop) — not an in-app browser — keeps the original
    // generic message rather than the in-app-specific one.
    showToast('AR isn’t supported on this device or browser. Try Chrome on an Android phone, or Safari on an iPhone.');
  }
});

async function route() {
  // All buttons/panels start hidden (see index.html) so there is never a
  // flash of the "wrong" one before detection resolves.
  const webXrOk = await detectWebXR();
  if (webXrOk) {
    arButton.classList.remove('hidden');
    return;
  }

  if (supportsQuickLook()) {
    activateQuickLook();
    return;
  }

  activateUnsupported();
}

route();
