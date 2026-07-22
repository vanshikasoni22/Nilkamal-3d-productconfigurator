import { getArAssetInfo } from './main.js';

// ============================================================================
// "View in Your Room" — iOS Safari path (AR Quick Look).
//
// Separate from js/ar.js (Android/Chrome WebXR flow, Task 3) — that file and
// its #arButton element are untouched by this one. On iOS, Quick Look is a
// native OS feature launched by following a real `<a rel="ar" href="*.usdz">`
// link (Apple/WebKit-documented pattern) — there is no WebXR session, no
// hit-test code, no custom reticle/drag/rotate to write here. Once the link
// is followed, Quick Look itself does floor detection, placement, and
// real-world-scale display natively.
//
// KNOWN GAP — no .usdz files exist in this repo yet. Per Task 2's finding,
// no automated GLB→USDZ conversion proved reliable in this pipeline, so a
// teammate needs to manually export one .usdz per .glb (Blender's USD
// exporter or Apple's Reality Converter both work for this), using the SAME
// base filename in the SAME assets/<category>/ folder as the existing .glb,
// e.g. assets/sofa/sofa1-var1.glb -> assets/sofa/sofa1-var1.usdz. Until those
// files exist, following this link on a real iPhone will show Quick Look's
// own "cannot load model" screen rather than actually launching AR — that is
// expected given the current asset state, not a bug in this code, and is
// called out explicitly in the Task 4 report.
//
// MULTI-ITEM SCOPE — researched, not assumed (see Task 4 report for sources):
// USDZ itself CAN hold a multi-object scene with fixed relative positions
// (Apple's own Reality Composer workflow is built around exactly that), so a
// single combined USDZ for a sofa + side table is not blocked by Quick Look
// as a platform. It IS blocked by this project's current asset pipeline: the
// sofa's side table / ottoman add-ons are procedural Three.js geometry
// (buildAccentTable/buildOttoman in js/main.js) with no exported mesh file
// in any format, and Quick Look can only display a pre-authored static
// scene — it can't assemble modules at view-time the way our Three.js scene
// does. So for now iOS AR Quick Look is limited to the primary product mesh
// only; getArAssetInfo().hasAddOns flags this so we can tell the shopper
// clearly instead of silently dropping the add-on.
// ============================================================================

const iosLink = document.getElementById('arButtonIOS');
const iosImg = document.getElementById('arButtonIOSImg');
const androidBtn = document.getElementById('arButton');
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

function showToast(msg, ms = 4200) {
  toastText.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// Apple/WebKit-documented feature test for AR Quick Look support — checking
// this instead of sniffing the iOS/Safari user-agent string, since that's
// what Apple's own engineers recommend it for and it degrades correctly on
// non-Safari iOS browsers (Chrome/Firefox on iOS all use WebKit under the
// hood but some configurations still differ in rel=ar support).
function supportsQuickLook() {
  const a = document.createElement('a');
  return !!(a.relList && a.relList.supports && a.relList.supports('ar'));
}

function refreshIosLink() {
  const { glbUrl, hasAddOns, thumbnail } = getArAssetInfo();
  if (!glbUrl) {
    // Accent category: procedural, no source mesh exists in any format yet.
    iosLink.dataset.disabled = 'true';
    iosLink.href = '#';
    return { ok: false, hasAddOns: false };
  }
  iosLink.dataset.disabled = '';
  iosLink.href = glbUrl.replace(/\.glb$/i, '.usdz');
  if (thumbnail) iosImg.src = thumbnail;
  return { ok: true, hasAddOns };
}

iosLink.addEventListener('click', (e) => {
  const { ok, hasAddOns } = refreshIosLink();
  if (!ok) {
    e.preventDefault();
    showToast('AR isn’t available for this product yet — it’s built procedurally and has no exportable 3D file.');
    return;
  }
  if (hasAddOns) {
    // Non-blocking heads-up: Quick Look will still open (assuming the .usdz
    // exists) and show the sofa at correct scale — just without the add-on.
    showToast('AR preview shows the sofa only for now — the side table/ottoman add-on isn’t available in iOS AR yet.');
  }
  // Let the native rel="ar" navigation proceed from here into Quick Look.
  // If the .usdz is missing (see KNOWN GAP above), Quick Look shows its own
  // load-failed screen — no page-side handling needed or possible for that.
});

function init() {
  if (supportsQuickLook()) {
    androidBtn.classList.add('hidden');
    iosLink.classList.remove('hidden');
    refreshIosLink();
  } else {
    iosLink.classList.add('hidden');
    // androidBtn (js/ar.js) stays visible and handles its own unsupported-
    // device messaging on click — untouched by this file.
  }
}

init();
