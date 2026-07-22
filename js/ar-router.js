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
//   3. Otherwise, a graceful "AR not supported on this device" button —
//      still visible and clickable, not a silent disappearance, matching
//      the same fallback approach already used inside the WebXR flow for
//      unsupported Android devices.
//
// This file only toggles the "hidden" class on the three pre-existing
// buttons/anchor and does not duplicate any AR logic that already lives in
// js/ar.js or js/ar-ios.js.
// ============================================================================

const arButton = document.getElementById('arButton');               // Android/WebXR (js/ar.js)
const arButtonIOS = document.getElementById('arButtonIOS');         // iOS/Quick Look (js/ar-ios.js)
const arButtonUnsupported = document.getElementById('arButtonUnsupported');
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

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

function activateUnsupported() {
  arButtonUnsupported.classList.remove('hidden');
}

arButtonUnsupported.addEventListener('click', () => {
  showToast('AR isn’t supported on this device or browser. Try Chrome on an Android phone, or Safari on an iPhone.');
});

async function route() {
  // All three buttons start hidden (see index.html) so there is never a
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
