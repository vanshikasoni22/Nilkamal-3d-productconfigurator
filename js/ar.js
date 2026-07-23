import * as THREE from 'three';
import {
  scene,
  camera,
  renderer,
  controls,
  productRoot,
  moduleRoot,
  animate,
  getCurrentCmDims,
} from './main.js';

// ============================================================================
// "View in Your Room" — Android + Chrome WebXR AR flow.
//
// Scope: Android/Chrome only, via the WebXR Device API's "hit-test" feature
// for floor (plane) detection. iOS uses a completely separate USDZ / AR Quick
// Look flow (Task 4) which is not implemented here — see the Task 2 findings
// (no reliable automated GLB→USDZ conversion in our pipeline; USDZ assets
// need to be exported manually before iOS AR can be built). This file does
// not touch iOS behavior or the existing desktop OrbitControls configurator
// logic in js/main.js — the only shared change there is swapping the manual
// requestAnimationFrame loop for renderer.setAnimationLoop, which is required
// so this file can hand the render loop to the active XRSession and back.
// ============================================================================

const arButton = document.getElementById('arButton');
const arOverlay = document.getElementById('arOverlay');
const arExitBtn = document.getElementById('arExitBtn');
const arBanner = document.getElementById('arBanner');
const arBannerText = document.getElementById('arBannerText');
const arHint = document.getElementById('arHint');
const toastEl = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

function showToast(msg, ms = 3400) {
  toastText.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function setBanner(text) {
  arBannerText.textContent = text;
  arBanner.style.display = text ? 'flex' : 'none';
}

function setHint(text, autoHideMs) {
  arHint.textContent = text;
  arHint.style.display = text ? 'block' : 'none';
  clearTimeout(setHint._t);
  if (text && autoHideMs) {
    setHint._t = setTimeout(() => { arHint.style.display = 'none'; }, autoHideMs);
  }
}

renderer.xr.enabled = true;

let session = null;
let hitTestSource = null;
let localRefSpace = null;
let reticle = null;
let arRoot = null;        // clone of productRoot + moduleRoot, rescaled to real-world meters
let placed = false;
let sawAnyHit = false;
let scanStartedAt = 0;

const touchState = { mode: null, lastAngle: 0 };
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dragPoint = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _throwaway = new THREE.Vector3();

function buildReticle() {
  const geo = new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x2e9bdb, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  return mesh;
}

// Real-world scale correction --------------------------------------------
// The desktop scene's normalize() (js/main.js) fits every loaded model to a
// fixed 2.05-unit footprint purely so framing looks consistent across very
// differently-sized source meshes — that is NOT real-world meters, it's a
// cosmetic scale chosen per-session. To place the current configuration at
// true real-world scale in AR, we measure the live productRoot footprint in
// scene units and rescale a clone so its width matches the product's actual
// documented width (cm, from CATALOG via getCurrentCmDims()) converted to
// meters. This correction is applied only to the AR clone below; the
// desktop view's own scale/position is left completely untouched.
function buildArRoot() {
  const box = new THREE.Box3().setFromObject(productRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  const sceneUnitsWidth = size.x || 1;

  const { width: widthCm } = getCurrentCmDims();
  const realWidthM = (widthCm || 90) / 100;
  const scaleFactor = realWidthM / sceneUnitsWidth;

  // Whole current layout (main product + any side table / ottoman modules)
  // is grouped together so it places and moves as one unit, preserving the
  // relative positions the user configured.
  const root = new THREE.Group();
  root.add(productRoot.clone(true));
  root.add(moduleRoot.clone(true));
  root.scale.setScalar(scaleFactor);
  root.visible = false;
  return root;
}

async function startAR() {
  console.info('[ar] "View in Your Room" tapped (Android/WebXR path)');

  if (!navigator.xr) {
    console.warn('[ar] navigator.xr is undefined in this browser — cannot start a WebXR session');
    showToast('AR isn’t supported in this browser. Try Chrome on an Android phone.');
    return;
  }

  // No isSessionSupported() re-check here — js/ar-router.js already awaited
  // that once at page load and only reveals/enables this button when it
  // came back true, so re-checking on every click would just insert an
  // unnecessary await between the user's tap and requestSession(). WebXR
  // requires requestSession to be called within the same synchronous
  // continuation as the triggering user gesture; any extra await ahead of
  // it risks the browser no longer treating the call as gesture-initiated
  // and silently withholding the camera permission prompt.

  // IMPORTANT (this is the actual fix for the "specified session
  // configuration is not supported" error seen on a real Android device):
  // the WebXR DOM Overlay spec requires the domOverlay.root element to be
  // a real, displayable element AT THE MOMENT requestSession() is called —
  // a hidden (display:none) root is treated as an invalid configuration
  // and Chrome rejects the *entire* requestSession call over it, even
  // though dom-overlay was only requested as an optional feature. arOverlay
  // starts as display:none (see css/style.css .ar-overlay) and previously
  // only became visible *after* requestSession had already resolved/
  // rejected — so the overlay was still hidden at the exact instant it
  // needed to be visible. Making it visible first, before the call, fixes
  // that. UI state (hiding the desktop product, resetting placement state)
  // is set up here too, before the request, for the same reason — none of
  // it depends on the session actually existing yet.
  productRoot.visible = false;
  moduleRoot.visible = false;
  controls.enabled = false;
  placed = false;
  sawAnyHit = false;
  touchState.mode = null;
  arOverlay.classList.add('active');
  setBanner('Starting AR…');
  setHint('', 0);

  async function tryRequestSession(withDomOverlay) {
    const init = withDomOverlay
      ? { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: arOverlay } }
      : { requiredFeatures: ['hit-test'] };
    console.info('[ar] calling navigator.xr.requestSession("immersive-ar", ...) — dom-overlay:', withDomOverlay, init);
    return navigator.xr.requestSession('immersive-ar', init);
  }

  try {
    session = await tryRequestSession(true);
    console.info('[ar] requestSession() resolved with dom-overlay — camera permission granted, XRSession started');
  } catch (err1) {
    console.warn('[ar] requestSession() with dom-overlay rejected, retrying without it:', err1);
    try {
      session = await tryRequestSession(false);
      console.info('[ar] requestSession() resolved WITHOUT dom-overlay — camera permission granted, XRSession started (scanning banner/exit button UI will not be shown this session)');
      arOverlay.classList.remove('active');
    } catch (err2) {
      console.error('[ar] requestSession() rejected on both attempts — hit-test itself is likely unsupported on this device/browser:', err2);
      arOverlay.classList.remove('active');
      productRoot.visible = true;
      moduleRoot.visible = true;
      controls.enabled = true;
      showToast('Could not start AR' + (err2 && err2.message ? ': ' + err2.message : '.'));
      return;
    }
  }

  arButton.classList.add('hidden');
  if (arOverlay.classList.contains('active')) setBanner('Move your phone slowly to find a floor…');

  arRoot = buildArRoot();
  scene.add(arRoot);
  reticle = buildReticle();
  scene.add(reticle);

  try {
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    console.info('[ar] renderer.xr.setSession() done — three.js is now rendering into the AR session');

    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    localRefSpace = renderer.xr.getReferenceSpace();
    scanStartedAt = performance.now();
    console.info('[ar] hit-test source acquired — scanning for a floor plane');
  } catch (err) {
    console.error('[ar] setup after session start failed (reference space / hit-test source):', err);
    showToast('AR started but could not set up floor detection' + (err && err.message ? ': ' + err.message : '.'));
    session.end();
    return;
  }

  session.addEventListener('end', onSessionEnd);
  session.addEventListener('select', onSelect);

  arOverlay.addEventListener('touchstart', onTouchStart, { passive: true });
  arOverlay.addEventListener('touchmove', onTouchMove, { passive: false });
  arOverlay.addEventListener('touchend', onTouchEnd, { passive: true });

  renderer.setAnimationLoop(arFrame);
}

function arFrame(time, frame) {
  if (!frame) {
    renderer.render(scene, camera);
    return;
  }

  if (!placed && hitTestSource) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length) {
      if (!sawAnyHit) {
        sawAnyHit = true;
        setBanner('Floor found — tap to place');
      }
      const pose = hits[0].getPose(localRefSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
      if (!sawAnyHit && time - scanStartedAt > 15000) {
        setBanner('Still looking… try a well-lit floor with some texture or pattern');
      }
    }
  }

  renderer.render(scene, camera);
}

function onSelect() {
  if (placed || !reticle || !reticle.visible) {
    console.info('[ar] select event ignored (already placed, or no floor detected yet)');
    return;
  }
  console.info('[ar] select event — placing layout at reticle pose');
  // Reticle's matrix already holds the hit-test pose (position + rotation);
  // decompose it onto arRoot directly. Scale is thrown away here on purpose
  // so arRoot keeps the real-world scaleFactor computed in buildArRoot().
  reticle.matrix.decompose(arRoot.position, arRoot.quaternion, _throwaway);
  arRoot.visible = true;
  placed = true;
  reticle.visible = false;
  setBanner('');
  setHint('Drag to move · Twist with two fingers to rotate', 3500);
}

function onSessionEnd() {
  console.info('[ar] XRSession ended — restoring desktop view');
  renderer.setAnimationLoop(animate);
  arOverlay.removeEventListener('touchstart', onTouchStart);
  arOverlay.removeEventListener('touchmove', onTouchMove);
  arOverlay.removeEventListener('touchend', onTouchEnd);
  arOverlay.classList.remove('active');
  arButton.classList.remove('hidden');
  setBanner('');
  setHint('', 0);
  if (arRoot) { scene.remove(arRoot); arRoot = null; }
  if (reticle) { scene.remove(reticle); reticle = null; }
  hitTestSource = null;
  localRefSpace = null;
  productRoot.visible = true;
  moduleRoot.visible = true;
  controls.enabled = true;
  session = null;
  placed = false;
}

// ---- drag-to-reposition (1 finger) / twist-to-rotate (2 fingers) ----------
// Touch events land on the dom-overlay root per the WebXR dom-overlay spec,
// so this is standard DOM touch handling, not XRInputSource polling — that
// gives continuous drag deltas, which discrete XR 'select' events don't.
function angleBetween(a, b) {
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
}

function onTouchStart(e) {
  if (!placed) return;
  if (e.touches.length === 1) {
    touchState.mode = 'move';
  } else if (e.touches.length === 2) {
    touchState.mode = 'rotate';
    touchState.lastAngle = angleBetween(e.touches[0], e.touches[1]);
  }
}

function onTouchMove(e) {
  if (!placed || !touchState.mode) return;
  e.preventDefault();

  if (touchState.mode === 'move' && e.touches.length === 1) {
    const rect = renderer.domElement.getBoundingClientRect();
    const t = e.touches[0];
    _ndc.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;

    const xrCam = renderer.xr.getCamera();
    _raycaster.setFromCamera(_ndc, xrCam);
    _dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), arRoot.position);
    if (_raycaster.ray.intersectPlane(_dragPlane, _dragPoint)) {
      arRoot.position.x = _dragPoint.x;
      arRoot.position.z = _dragPoint.z;
    }
  } else if (touchState.mode === 'rotate' && e.touches.length === 2) {
    const angle = angleBetween(e.touches[0], e.touches[1]);
    arRoot.rotation.y += (angle - touchState.lastAngle);
    touchState.lastAngle = angle;
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) touchState.mode = null;
  else if (e.touches.length === 1) touchState.mode = 'move';
}

arButton.addEventListener('click', startAR);
arExitBtn.addEventListener('click', () => { if (session) session.end(); });
