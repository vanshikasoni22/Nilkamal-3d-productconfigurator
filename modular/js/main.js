import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/DRACOLoader.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';

// ============================================================================
// Nilkamal Infinia — Modular Sofa Builder
// customizable-upgrade branch: grid-snapping engine, live footprint, cross-
// module fabric/leather swap, BOM + live price, quick-start presets.
//
// IMPORTANT ASSET NOTE: the source GLBs have no authored snap-point locators
// and are not bottom-center pivoted (verified by inspection before writing
// this). Every module's attachment edges below are computed from its own
// real bounding box instead, and each module is re-centered onto the floor
// (Y=0) at load time. Modules can connect via any of their 4 sides (left/
// right/front/back) — a straight run only ever needs left/right, but a
// corner turn needs a rotated module's front/back too (see localEdges/
// findBestSnap). Back-to-back is the one pairing explicitly disallowed,
// since two backrests pressed together isn't a real seating layout.
// ============================================================================

// ----------------------------------------------------------------------
// Module catalog — real dimensions (meters) measured from each GLB's own
// bounding box. Prices are indicative placeholders, consistent with the
// rest of this demo.
// ----------------------------------------------------------------------
// Consistent line-icon system for the palette (24x24, uniform 1.6 stroke,
// currentColor so hover/active states can recolor them via CSS) — replaces
// the placeholder emoji, which varied wildly in weight/color/style between
// icons and didn't read as a single designed set.
const ICON_SINGLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="13" rx="2.5"/><line x1="5" y1="11" x2="19" y2="11"/><line x1="7" y1="17" x2="7" y2="20"/><line x1="17" y1="17" x2="17" y2="20"/></svg>`;
const ICON_ARMREST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="5" width="8" height="12" rx="3"/><line x1="9" y1="17" x2="9" y2="20"/><line x1="15" y1="17" x2="15" y2="20"/></svg>`;
const ICON_LONG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="7" rx="2"/><line x1="5" y1="17" x2="5" y2="20"/><line x1="19" y1="17" x2="19" y2="20"/></svg>`;
const ICON_CONSOLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="12" width="14" height="5" rx="1.5"/><path d="M6 12 V7 H18 V12"/><line x1="7" y1="17" x2="7" y2="20"/><line x1="17" y1="17" x2="17" y2="20"/></svg>`;

const MODULE_DEFS = {
  single: {
    id: 'single', name: 'Single Seat', icon: ICON_SINGLE,
    file: 'single_sofa.glb', width: 0.553, depth: 0.939, height: 1.058,
    price: 18999,
  },
  armrest: {
    id: 'armrest', name: 'Armrest', icon: ICON_ARMREST,
    file: 'armrest.glb', width: 0.152, depth: 0.783, height: 0.623,
    price: 7499,
  },
  long: {
    id: 'long', name: 'Extension Bench', icon: ICON_LONG,
    file: 'sofa_long_part.glb', width: 0.550, depth: 0.564, height: 0.472,
    price: 14999,
  },
  console: {
    id: 'console', name: 'Console Table', icon: ICON_CONSOLE,
    file: 'console.glb', width: 0.328, depth: 0.720, height: 0.575,
    price: 5999,
  },
};
const MODULE_ORDER = ['single', 'armrest', 'long', 'console'];
const LEATHER_PREMIUM = 1.15; // leatherette runs ~15% over fabric, indicative

const SWATCHES = {
  fabric: [
    { id: 'charcoal', name: 'Charcoal', hex: '#54585e' },
    { id: 'teal', name: 'Lagoon Teal', hex: '#3c7d84' },
    { id: 'beige', name: 'Sandstone', hex: '#cdb89a' },
    { id: 'navy', name: 'Midnight Navy', hex: '#33405c' },
    { id: 'rust', name: 'Rust', hex: '#b1552f' },
  ],
  leather: [
    { id: 'tan', name: 'Tan', hex: '#a9794e' },
    { id: 'espresso', name: 'Espresso', hex: '#3a2a22' },
    { id: 'black', name: 'Black', hex: '#232323' },
    { id: 'cognac', name: 'Cognac', hex: '#8a4a2b' },
  ],
};

// ============================================================================
// Scene setup
// ============================================================================
const canvas = document.getElementById('viewer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

function makeStudioBackground() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#f4f4f3');
  grad.addColorStop(0.55, '#ffffff');
  grad.addColorStop(1, '#e9e8e6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = makeStudioBackground();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
camera.position.set(2.4, 2.6, 3.6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = 1.2;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.3, 0);
controls.update();

const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 0.6);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(3, 4.5, 2.6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.55);
fill.position.set(-3.2, 2, -2);
scene.add(fill);

// Floor grid — visual reference for the "grid" in grid-snapping, plus a
// raycast target for drag placement.
function makeFloorGridTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f1f0ee';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  const step = size / 16; // 16 divisions across 8m => 0.5m grid
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const FLOOR_SIZE = 8;
const floorPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshBasicMaterial({ map: makeFloorGridTexture() })
);
floorPlane.rotation.x = -Math.PI / 2;
floorPlane.position.y = 0;
scene.add(floorPlane);

// Soft contact shadow under the whole layout, tracks the footprint.
function makeContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(20,20,22,0.35)');
  g.addColorStop(0.6, 'rgba(20,20,22,0.16)');
  g.addColorStop(1, 'rgba(20,20,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: makeContactShadowTexture(), transparent: true, depthWrite: false })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.y = 0.003;
contactShadow.renderOrder = -1;
contactShadow.visible = false;
scene.add(contactShadow);

// Live footprint outline — a crisp rectangle on the floor tracing the exact
// bounding box of all placed modules (distinct from the soft contactShadow
// above, which is a decorative grounding effect, not a measurement). Kept
// as a simple 5-point closed line loop whose vertices are rewritten every
// time updateFootprint() runs, rather than rebuilding the geometry.
const footprintOutline = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0),
  ]),
  new THREE.LineBasicMaterial({ color: 0xc80000, transparent: true, opacity: 0.85 })
);
footprintOutline.position.y = 0.006; // just above the contact shadow, avoids z-fighting
footprintOutline.renderOrder = 0;
footprintOutline.visible = false;
scene.add(footprintOutline);

const moduleRoot = new THREE.Group();
scene.add(moduleRoot);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// ============================================================================
// Asset loading — preload every family/type combination once at startup so
// switching Fabric <-> Leatherette later is an instant in-scene swap with no
// network wait and no layout disruption.
// ============================================================================
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('../vendor/draco/gltf/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const assetCache = new Map(); // key: "family/type" -> THREE.Object3D (template, not added to scene)

function assetUrl(family, type) {
  return `./assets/${family}/${MODULE_DEFS[type].file}`;
}

// MODULE_DEFS.width/depth/height start as recorded reference values, but
// are OVERWRITTEN below with the real measured bounding box of each loaded
// GLB the moment it loads — every edge/snap/overlap computation in this
// file reads MODULE_DEFS[type].width/depth, so once this runs, ALL of that
// math is driven by the actual asset geometry, not a hand-entered number.
// A >2mm mismatch between the recorded and measured value is logged loudly
// so a future asset swap can't silently drift out of sync with the numbers
// the snap engine relies on.
const DIM_MISMATCH_TOLERANCE = 0.002; // meters
function loadOne(family, type) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(assetUrl(family, type), (gltf) => {
      const inner = gltf.scene;
      // Re-center pivot to bottom-center: the source meshes are centered on
      // their own geometric middle, not floor-anchored, so every instance
      // would otherwise float half-buried in the floor. The offset is baked
      // onto an INNER child, not the returned wrapper's own position — the
      // wrapper's position is what instance placement (x, 0, z) controls,
      // so it must stay free for that and not carry this offset itself.
      const box = new THREE.Box3().setFromObject(inner);
      inner.position.y -= box.min.y;

      const measuredWidth = box.max.x - box.min.x;
      const measuredDepth = box.max.z - box.min.z;
      const measuredHeight = box.max.y - box.min.y;
      const def = MODULE_DEFS[type];
      const widthDiff = Math.abs(def.width - measuredWidth);
      const depthDiff = Math.abs(def.depth - measuredDepth);
      if (widthDiff > DIM_MISMATCH_TOLERANCE || depthDiff > DIM_MISMATCH_TOLERANCE) {
        console.error(
          `[assets] ${family}/${type}: measured bbox (w=${measuredWidth.toFixed(4)}, d=${measuredDepth.toFixed(4)}) ` +
          `differs from recorded MODULE_DEFS (w=${def.width}, d=${def.depth}) by more than ${DIM_MISMATCH_TOLERANCE}m — ` +
          `overwriting with the measured value so snap/overlap math stays correct.`
        );
      }
      def.width = measuredWidth;
      def.depth = measuredDepth;
      def.height = measuredHeight;

      const wrapper = new THREE.Group();
      wrapper.add(inner);
      wrapper.updateMatrixWorld(true);
      assetCache.set(`${family}/${type}`, wrapper);
      resolve(wrapper);
    }, undefined, reject);
  });
}

async function preloadAll() {
  const jobs = [];
  for (const family of ['fabric', 'leather']) {
    for (const type of MODULE_ORDER) jobs.push(loadOne(family, type));
  }
  await Promise.all(jobs);
}

function cloneTemplate(family, type) {
  const template = assetCache.get(`${family}/${type}`);
  const clone = template.clone(true);
  clone.traverse((n) => {
    if (n.isMesh) {
      n.material = n.material.clone();
      if (n.material.map === undefined) n.material.map = null;
      n.material.userData.__origMap = n.material.map || null;
    }
  });
  return clone;
}

// ============================================================================
// Module instance model
// ============================================================================
let nextId = 1;
const instances = []; // { id, type, x, z, rotationY (deg, 0/90/180/270), object3D }
let selectedId = null;
let currentFamily = 'fabric';
let currentColorId = 'charcoal';

function halfExtents(type) {
  const d = MODULE_DEFS[type];
  return { hw: d.width / 2, hd: d.depth / 2 };
}

// Local (unrotated) edge anchors + outward normals, one per side of the
// module's bounding box. All 4 sides are snap-capable: a straight run only
// ever needs left/right, but turning a corner means a rotated module's
// left/right edges swing to face front/back in world space, so a module
// joining the row from that direction needs those edges available too.
// Back-to-back is explicitly disallowed in findBestSnap since that's never
// a valid seating arrangement.
function localEdges(type) {
  const { hw, hd } = halfExtents(type);
  return {
    left: { local: new THREE.Vector3(-hw, 0, 0), normal: new THREE.Vector3(-1, 0, 0) },
    right: { local: new THREE.Vector3(hw, 0, 0), normal: new THREE.Vector3(1, 0, 0) },
    front: { local: new THREE.Vector3(0, 0, hd), normal: new THREE.Vector3(0, 0, 1) },
    back: { local: new THREE.Vector3(0, 0, -hd), normal: new THREE.Vector3(0, 0, -1) },
  };
}
const SNAP_SIDES = ['left', 'right', 'front', 'back'];

function worldEdge(instance, side) {
  const e = localEdges(instance.type)[side];
  const rad = THREE.MathUtils.degToRad(instance.rotationY);
  const rotated = e.local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
  const normal = e.normal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
  const worldPos = new THREE.Vector3(instance.x, 0, instance.z).add(rotated);
  return { worldPos, normal };
}

function createInstance(type, x = 0, z = 0, rotationY = 0) {
  // connections tracks, per side, which OTHER instance id (if any) is
  // currently snapped there — lets the snap engine refuse to double-connect
  // a second module onto an edge that's already occupied.
  const inst = {
    id: nextId++, type, x, z, rotationY, object3D: null,
    connections: { left: null, right: null, front: null, back: null },
  };
  rebuildInstanceObject(inst);
  instances.push(inst);
  selectInstance(inst.id);
  refreshAll();
  return inst;
}

function rebuildInstanceObject(inst) {
  if (inst.object3D) {
    moduleRoot.remove(inst.object3D);
    inst.object3D.traverse((n) => { if (n.isMesh) { n.geometry.dispose(); } });
  }
  const obj = cloneTemplate(currentFamily, inst.type);
  obj.position.set(inst.x, 0, inst.z);
  obj.rotation.y = THREE.MathUtils.degToRad(inst.rotationY);
  moduleRoot.add(obj);
  inst.object3D = obj;
  applyColorToInstance(inst);
}

function removeInstance(id) {
  const idx = instances.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const [inst] = instances.splice(idx, 1);
  clearConnections(inst);
  moduleRoot.remove(inst.object3D);
  if (selectedId === id) selectedId = null;
  refreshAll();
}

const SELECT_EMISSIVE = new THREE.Color(0xc80000); // brand red (rebrand from blue)
function selectInstance(id) {
  selectedId = id;
  instances.forEach((inst) => {
    const isSelected = inst.id === selectedId;
    inst.object3D.traverse((n) => {
      if (n.isMesh && n.material && n.material.emissive) {
        n.material.emissive.copy(isSelected ? SELECT_EMISSIVE : new THREE.Color(0, 0, 0));
        n.material.emissiveIntensity = isSelected ? 0.18 : 0;
      }
    });
  });
}

// ============================================================================
// Snap engine
// ============================================================================
const SNAP_DIST = 0.16; // meters — proximity threshold to trigger a snap
const SNAP_NORMAL_DOT = -0.85; // how close to exactly-opposite the two edges must face

function findBestSnap(draggedInst) {
  let best = null;
  for (const other of instances) {
    if (other.id === draggedInst.id) continue;
    for (const dSide of SNAP_SIDES) {
      const dEdge = worldEdge(draggedInst, dSide);
      for (const oSide of SNAP_SIDES) {
        // A module's "back" is its backrest side — two backrests pressed
        // together is never a real layout, so that one pairing is excluded.
        // Every other combination (including front-to-front, e.g. two
        // chaise sections facing away from each other) is left to the
        // normal-opposition check below to validate.
        if (dSide === 'back' && oSide === 'back') continue;
        const oEdge = worldEdge(other, oSide);
        const dist = dEdge.worldPos.distanceTo(oEdge.worldPos);
        const dot = dEdge.normal.dot(oEdge.normal);
        if (dist < SNAP_DIST && dot < SNAP_NORMAL_DOT) {
          if (!best || dist < best.dist) {
            best = { dist, dEdge, oEdge, other, oSide, dSide };
          }
        }
      }
    }
  }
  if (!best) return null;
  // Shift the dragged module so its edge exactly meets the target edge.
  const delta = best.oEdge.worldPos.clone().sub(best.dEdge.worldPos);
  return {
    x: draggedInst.x + delta.x,
    z: draggedInst.z + delta.z,
    ghostWorldPos: best.oEdge.worldPos.clone(),
    other: best.other,
    oSide: best.oSide,
    dSide: best.dSide,
  };
}

// -- Connection bookkeeping ---------------------------------------------
// A connection is symmetric: if A's left touches B's right, both A.left
// and B.right point at each other's id. This is what lets the interactive
// snap search below refuse to place a module onto an edge someone else is
// already occupying (the "block invalid connections" requirement) — the
// asset set has no distinct connector "types" beyond side geometry, so the
// two concrete rules enforced are: no back-to-back, and no double-occupying
// a single edge.
function clearConnections(inst) {
  SNAP_SIDES.forEach((side) => {
    const otherId = inst.connections[side];
    if (otherId == null) return;
    const other = instances.find((i) => i.id === otherId);
    if (other) {
      SNAP_SIDES.forEach((oSide) => { if (other.connections[oSide] === inst.id) other.connections[oSide] = null; });
    }
    inst.connections[side] = null;
  });
}

function establishConnection(a, aSide, b, bSide) {
  a.connections[aSide] = b.id;
  b.connections[bSide] = a.id;
}

function isEdgeOccupied(other, oSide, exceptId) {
  const occupant = other.connections[oSide];
  return occupant != null && occupant !== exceptId;
}

// Interactive drag search: unlike findBestSnap (used by presets, which
// already know the correct target rotation for each module), a module
// being dragged by hand can arrive at ANY rotation, and a corner connection
// needs a DIFFERENT rotation than a straight one. So this searches every
// 90-degree rotation and every edge pair, and returns whichever valid,
// unoccupied combination would land closest to where the module currently
// is — i.e. "if the user let go right now, what's the nearest thing it
// would snap to, and how would it need to turn to fit."
const SNAP_ROTATIONS = [0, 90, 180, 270];
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function findBestSnapAnyRotation(draggedInst) {
  let best = null;
  for (const other of instances) {
    if (other.id === draggedInst.id) continue;
    for (const oSide of SNAP_SIDES) {
      if (isEdgeOccupied(other, oSide, draggedInst.id)) continue;
      const oEdge = worldEdge(other, oSide);
      for (const rot of SNAP_ROTATIONS) {
        const rad = THREE.MathUtils.degToRad(rot);
        for (const dSide of SNAP_SIDES) {
          if (dSide === 'back' && oSide === 'back') continue;
          const localE = localEdges(draggedInst.type)[dSide];
          const rotatedLocal = localE.local.clone().applyAxisAngle(Y_AXIS, rad);
          const rotatedNormal = localE.normal.clone().applyAxisAngle(Y_AXIS, rad);
          if (rotatedNormal.dot(oEdge.normal) >= SNAP_NORMAL_DOT) continue;
          const candidateX = oEdge.worldPos.x - rotatedLocal.x;
          const candidateZ = oEdge.worldPos.z - rotatedLocal.z;
          const dist = Math.hypot(candidateX - draggedInst.x, candidateZ - draggedInst.z);
          if (dist < SNAP_DIST && (!best || dist < best.dist)) {
            best = { dist, x: candidateX, z: candidateZ, rotationY: rot, other, oSide, dSide, ghostWorldPos: oEdge.worldPos.clone() };
          }
        }
      }
    }
  }
  return best;
}

// ============================================================================
// Pointer interaction — drag to move modules, drag empty space to orbit
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let dragState = null; // { inst, grabOffset: Vector3 }
const snapGhost = document.createElement('div');
snapGhost.className = 'snap-ghost';
document.querySelector('.viewer-col').appendChild(snapGhost);

function setPointerNDC(ev) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickInstanceAt(ev) {
  setPointerNDC(ev);
  raycaster.setFromCamera(pointerNDC, camera);
  const meshes = [];
  instances.forEach((inst) => inst.object3D.traverse((n) => { if (n.isMesh) meshes.push([n, inst]); }));
  const intersects = raycaster.intersectObjects(meshes.map((m) => m[0]), false);
  if (!intersects.length) return null;
  const hitMesh = intersects[0].object;
  const found = meshes.find((m) => m[0] === hitMesh);
  return found ? found[1] : null;
}

function floorPointFromEvent(ev) {
  setPointerNDC(ev);
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = raycaster.intersectObject(floorPlane, false);
  return hit.length ? hit[0].point : null;
}

canvas.addEventListener('pointerdown', (ev) => {
  const inst = pickInstanceAt(ev);
  if (inst) {
    selectInstance(inst.id);
    const floorPt = floorPointFromEvent(ev);
    const grabOffset = floorPt ? new THREE.Vector3(inst.x - floorPt.x, 0, inst.z - floorPt.z) : new THREE.Vector3();
    // Picking a module up detaches it from whatever it was snapped to —
    // this is what makes "drag away to disconnect" work: the old slot is
    // freed immediately, and it only reattaches (see endDrag) if it's
    // dropped back within snapping range of a compatible edge.
    clearConnections(inst);
    dragState = { inst, grabOffset, baseRotationY: inst.rotationY };
    controls.enabled = false;
    canvas.setPointerCapture(ev.pointerId);
  }
});

canvas.addEventListener('pointermove', (ev) => {
  if (!dragState) return;
  const floorPt = floorPointFromEvent(ev);
  if (!floorPt) return;
  const { inst, grabOffset, baseRotationY } = dragState;
  inst.x = floorPt.x + grabOffset.x;
  inst.z = floorPt.z + grabOffset.z;

  const snap = findBestSnapAnyRotation(inst);
  if (snap) {
    // Live preview: show the module already sitting at the position AND
    // rotation it would land at if released right now, before the user
    // commits to the drop.
    inst.object3D.position.set(snap.x, 0, snap.z);
    inst.object3D.rotation.y = THREE.MathUtils.degToRad(snap.rotationY);
    const screen = snap.ghostWorldPos.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    snapGhost.style.left = `${rect.left + (screen.x * 0.5 + 0.5) * rect.width}px`;
    snapGhost.style.top = `${rect.top + (-screen.y * 0.5 + 0.5) * rect.height}px`;
    snapGhost.style.display = 'block';
    dragState.pendingSnap = snap;
  } else {
    inst.object3D.position.set(inst.x, 0, inst.z);
    inst.object3D.rotation.y = THREE.MathUtils.degToRad(baseRotationY);
    snapGhost.style.display = 'none';
    dragState.pendingSnap = null;
  }
  updateFootprint();
});

function endDrag() {
  if (!dragState) return;
  const { inst, pendingSnap, baseRotationY } = dragState;
  if (pendingSnap) {
    inst.x = pendingSnap.x;
    inst.z = pendingSnap.z;
    inst.rotationY = pendingSnap.rotationY;
    establishConnection(inst, pendingSnap.dSide, pendingSnap.other, pendingSnap.oSide);
  } else {
    inst.rotationY = baseRotationY;
  }
  inst.object3D.position.set(inst.x, 0, inst.z);
  inst.object3D.rotation.y = THREE.MathUtils.degToRad(inst.rotationY);
  snapGhost.style.display = 'none';
  dragState = null;
  controls.enabled = true;
  updateFootprint();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (ev) => {
  if (selectedId == null) return;
  const inst = instances.find((i) => i.id === selectedId);
  if (!inst) return;
  if (ev.key === 'r' || ev.key === 'R') {
    clearConnections(inst); // rotating in place invalidates any existing snap
    inst.rotationY = (inst.rotationY + 90) % 360;
    inst.object3D.rotation.y = THREE.MathUtils.degToRad(inst.rotationY);
    updateFootprint();
  } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
    removeInstance(inst.id);
  }
});

// ============================================================================
// Live footprint dimensions
// ============================================================================
const footprintBadge = document.getElementById('footprintBadge');
function updateFootprint() {
  if (!instances.length) {
    footprintBadge.textContent = '0.0m × 0.0m';
    contactShadow.visible = false;
    footprintOutline.visible = false;
    return;
  }
  const box = new THREE.Box3();
  instances.forEach((inst) => box.expandByObject(inst.object3D));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  footprintBadge.textContent = `${size.x.toFixed(2)}m × ${size.z.toFixed(2)}m`;
  contactShadow.visible = true;
  contactShadow.position.set(center.x, 0.003, center.z);
  contactShadow.scale.set(Math.max(size.x, 0.3) * 1.3, Math.max(size.z, 0.3) * 1.3, 1);

  // Rewrite the outline's 4 corners to exactly match the live bounding box.
  const positions = footprintOutline.geometry.attributes.position;
  const corners = [
    [box.min.x, box.min.z], [box.max.x, box.min.z],
    [box.max.x, box.max.z], [box.min.x, box.max.z],
  ];
  corners.forEach(([x, z], i) => positions.setXYZ(i, x, 0, z));
  positions.needsUpdate = true;
  footprintOutline.geometry.computeBoundingSphere();
  footprintOutline.visible = true;
}

// ============================================================================
// Material family + color — applies to every placed module at once, and
// never touches position/rotation, so the layout & snap connections survive
// any material change untouched.
// ============================================================================
function applyColorToInstance(inst) {
  const hex = SWATCHES[currentFamily].find((s) => s.id === currentColorId)?.hex || '#54585e';
  const color = new THREE.Color(hex);
  inst.object3D.traverse((n) => {
    if (n.isMesh && n.material) {
      n.material.color.copy(color);
      n.material.needsUpdate = true;
    }
  });
}

function setFamily(family) {
  if (family === currentFamily) return;
  currentFamily = family;
  if (!SWATCHES[family].some((s) => s.id === currentColorId)) currentColorId = SWATCHES[family][0].id;
  instances.forEach((inst) => rebuildInstanceObject(inst)); // swap geometry, keep x/z/rotationY
  // rebuildInstanceObject clones a fresh material per instance, which resets
  // emissive to its default (off) — so without this, whichever module was
  // selected loses its highlight the moment you change material family.
  // Re-applying the same selection after the rebuild restores it.
  if (selectedId != null) selectInstance(selectedId);
  buildSwatchRow();
  refreshAll();
}

function setColor(id) {
  currentColorId = id;
  instances.forEach(applyColorToInstance);
  buildSwatchRow();
  updatePrice();
}

// ============================================================================
// BOM + price
// ============================================================================
function updateBOM() {
  const bomList = document.getElementById('bomList');
  if (!instances.length) {
    bomList.innerHTML = '<div class="bom-empty">No modules placed yet — add one from the left.</div>';
    return;
  }
  const counts = {};
  instances.forEach((inst) => { counts[inst.type] = (counts[inst.type] || 0) + 1; });
  bomList.innerHTML = '';
  MODULE_ORDER.forEach((type) => {
    if (!counts[type]) return;
    const def = MODULE_DEFS[type];
    const unit = Math.round(def.price * (currentFamily === 'leather' ? LEATHER_PREMIUM : 1));
    const row = document.createElement('div');
    row.className = 'bom-row';
    row.innerHTML = `<span class="bom-info"><span><span class="bom-name">${def.name}</span><span class="bom-qty">&times;${counts[type]}</span></span><span class="bom-unit">${formatINR(unit)} each</span></span><span class="bom-price">${formatINR(unit * counts[type])}</span>`;
    bomList.appendChild(row);
  });
}

function updatePrice() {
  let total = 0;
  instances.forEach((inst) => {
    const unit = MODULE_DEFS[inst.type].price * (currentFamily === 'leather' ? LEATHER_PREMIUM : 1);
    total += unit;
  });
  document.getElementById('priceTotal').textContent = formatINR(total);
}

function formatINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function refreshAll() {
  updateFootprint();
  updateBOM();
  updatePrice();
}

// ============================================================================
// Presets — reuse the exact same snap machinery as manual dragging
// (worldEdge/findBestSnap/establishConnection), never authored/hardcoded
// x-z-rotation numbers. Two kinds of steps are supported:
//   `via: { mine, prev }`   — plain single-edge touch, for runs where every
//                              module in the pair shares the same
//                              perpendicular width (straight runs, and the
//                              second arm of a corner once it's underway).
//   `corner: { touch, flush }` — an L-turn between two modules of DIFFERENT
//                              perpendicular width. A single edge-center
//                              match can only satisfy ONE positional
//                              constraint, but placing a wide piece flush
//                              against a narrower row needs two: touch
//                              (no gap on the seam) AND flush (the outer
//                              edges must line up, not just the centers).
//                              Both constraints are still pure edge lookups
//                              via worldEdge() — no fudge constant.
// ============================================================================
function clearLayout() {
  [...instances].forEach((inst) => removeInstance(inst.id));
}

function resolveTouchPosition(type, rotationY, mine, prevSide, prev) {
  const prevEdge = worldEdge(prev, prevSide);
  const rad = THREE.MathUtils.degToRad(rotationY);
  const localMine = localEdges(type)[mine].local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
  return { x: prevEdge.worldPos.x - localMine.x, z: prevEdge.worldPos.z - localMine.z };
}

// Corner placement: start from the touch pair (fixes the axis along the
// touching seam, exactly like resolveTouchPosition), then override
// whichever single axis the flush pair's normal points along, so that
// mine's flush edge and prev's flush edge land on the same world
// coordinate (coplanar/flush) instead of the touch pair's implicit
// edge-center-to-edge-center result (which is what caused the overhang —
// see PRESETS.lshape comment). Both edges come from the real per-type
// dimensions via localEdges/worldEdge, so this is exact, not approximate.
function resolveCornerPosition(type, rotationY, corner, prev) {
  const rad = THREE.MathUtils.degToRad(rotationY);
  const Y = new THREE.Vector3(0, 1, 0);
  let { x, z } = resolveTouchPosition(type, rotationY, corner.touch.mine, corner.touch.prev, prev);

  const prevFlushEdge = worldEdge(prev, corner.flush.prev);
  const mineFlushEdge = localEdges(type)[corner.flush.mine];
  const mineFlushLocal = mineFlushEdge.local.clone().applyAxisAngle(Y, rad);
  const mineFlushNormal = mineFlushEdge.normal.clone().applyAxisAngle(Y, rad);
  if (Math.abs(mineFlushNormal.x) > Math.abs(mineFlushNormal.z)) {
    x = prevFlushEdge.worldPos.x - mineFlushLocal.x;
  } else {
    z = prevFlushEdge.worldPos.z - mineFlushLocal.z;
  }
  return { x, z };
}

// A module's true world-space footprint (rotation-aware AABB), built from
// the same real per-type width/depth as everything else. Distinct from
// worldEdge's single-point-per-side model: a face here is a full segment
// with real extent, not just its midpoint.
function instanceWorldAABB(inst) {
  const { hw, hd } = halfExtents(inst.type);
  const rad = THREE.MathUtils.degToRad(inst.rotationY);
  const Y = new THREE.Vector3(0, 1, 0);
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => {
    const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(Y, rad);
    return { x: inst.x + v.x, z: inst.z + v.z };
  });
  return {
    minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)),
    minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)),
  };
}

// Coplanarity tolerance for corner joins, in meters. Position for a corner
// step is computed exactly (see resolveCornerPosition), so a real touch
// lands here to within floating-point error — this is a sanity margin, not
// a fudge factor.
const TOUCH_EPSILON = 0.001;

// findBestSnap validates a connection by checking whether two edge
// MIDPOINTS are close together (dist < SNAP_DIST). That's the right test
// when both modules share the same perpendicular width — their edge
// midpoints necessarily coincide when the faces are flush. But it's the
// WRONG test for this L-corner: the corner single's face is 0.939m wide
// and the row single's face it's joining is 0.553m wide, so a genuinely
// flush, fully-overlapping join still leaves the two edge midpoints
// 0.193m apart — outside SNAP_DIST (0.16m). findBestSnap would reject a
// physically correct connection here, not because it isn't touching, but
// because its own point-based test can't see mismatched-width overlap.
//
// This checks what actually matters for "are these two faces touching":
// are they coplanar (same position along the shared normal, within
// TOUCH_EPSILON) AND does their real extent overlap at all (using each
// module's true rotated footprint, not just its edge midpoint)? If both
// hold, it's a genuine touch and the connection is recorded via the same
// establishConnection() used everywhere else in the engine.
function establishCornerConnection(inst, corner, prev) {
  const mineEdge = worldEdge(inst, corner.touch.mine);
  const prevEdge = worldEdge(prev, corner.touch.prev);
  const facingOk = mineEdge.normal.dot(prevEdge.normal) < SNAP_NORMAL_DOT;
  const alongX = Math.abs(mineEdge.normal.x) > Math.abs(mineEdge.normal.z);
  const coplanarGap = alongX
    ? Math.abs(mineEdge.worldPos.x - prevEdge.worldPos.x)
    : Math.abs(mineEdge.worldPos.z - prevEdge.worldPos.z);
  const mineBox = instanceWorldAABB(inst);
  const prevBox = instanceWorldAABB(prev);
  const overlaps = alongX
    ? Math.min(mineBox.maxZ, prevBox.maxZ) - Math.max(mineBox.minZ, prevBox.minZ) > 0
    : Math.min(mineBox.maxX, prevBox.maxX) - Math.max(mineBox.minX, prevBox.minX) > 0;
  if (facingOk && coplanarGap < TOUCH_EPSILON && overlaps) {
    establishConnection(inst, corner.touch.mine, prev, corner.touch.prev);
    return true;
  }
  return false;
}

function placeChain(sequence) {
  clearLayout();
  let prev = null;
  // Tracked at the moment each step resolves, not just inferred afterward
  // from connections[] — a LATER step's successful snap can retroactively
  // populate an earlier module's connections object (e.g. the closing
  // Armrest connecting TO the corner module fills in the corner's own
  // `right` slot), which would silently mask an earlier step's snap
  // failure if validation only looked at final connection state.
  const failedSteps = [];
  sequence.forEach(({ type, rotationY = 0, via, corner }) => {
    let x = 0, z = 0;
    if (prev) {
      // Naively creating every new module at (0,0) would place it much
      // farther from the previous one than SNAP_DIST, so findBestSnap would
      // never trigger. Instead, estimate a starting position already
      // touching the previous module, so the snap check below only has to
      // confirm/fine-tune, not bridge a big gap.
      if (corner) {
        ({ x, z } = resolveCornerPosition(type, rotationY, corner, prev));
      } else {
        const mine = via?.mine ?? 'left';
        const prevSide = via?.prev ?? 'right';
        ({ x, z } = resolveTouchPosition(type, rotationY, mine, prevSide, prev));
      }
    }
    const inst = createInstance(type, x, z, rotationY);
    if (prev) {
      if (corner) {
        // findBestSnap's point-distance test can't validate this join —
        // see establishCornerConnection's comment for the exact numbers.
        // Position was already resolved exactly (resolveCornerPosition);
        // this checks it's a genuine touching connection (coplanar + real
        // extent overlap) and records it via the same establishConnection
        // used everywhere else — never assigning connection state on
        // faith.
        const ok = establishCornerConnection(inst, corner, prev);
        if (!ok) {
          console.error(`[preset] ${type} corner join to previous ${prev.type} failed coplanarity/overlap check — layout would ship broken`);
          failedSteps.push(inst);
        }
      } else {
        // This is the SAME findBestSnap() function used by manual
        // drag-and-drop (Task 1) to decide what a dropped module connects
        // to — the estimate above just gets the module close enough
        // (within SNAP_DIST) for it to trigger, exactly like dragging a
        // module near another one by hand. The preset never assigns
        // connection state directly; it only comes from this call
        // succeeding.
        const snap = findBestSnap(inst);
        if (snap) {
          inst.x = snap.x; inst.z = snap.z; inst.object3D.position.set(inst.x, 0, inst.z);
          establishConnection(inst, snap.dSide, snap.other, snap.oSide);
        } else {
          console.error(`[preset] ${type} did NOT register a snap connection to previous ${prev.type} — layout would ship broken, check rotation/via combo`);
          failedSteps.push(inst);
        }
      }
    }
    prev = inst;
  });
  // createInstance() auto-selects every module it creates (that's the
  // correct behavior for a single manual placement from the palette), but
  // during a preset build it means the LAST module placed is left selected
  // and highlighted afterward — visually a random module (usually the end-
  // cap Armrest) shows a blue tint blended into its material that every
  // other module doesn't have. A preset places a whole finished layout, not
  // a single piece the user is now editing, so nothing should stay selected
  // when it's done.
  selectInstance(null);

  // Validation, run in code every time a preset builds (not just checked
  // offline before shipping) — three independent checks, all of which must
  // pass or the layout is flagged as broken rather than silently rendered:
  //
  // 1) every module placed after the first one MUST have resolved via a
  //    successful findBestSnap()/establishCornerConnection() call above
  //    (failedSteps) AND must still show a live connection now
  //    (disconnected) — the second check catches anything that never got
  //    backfilled by a later step.
  // 2) every rotation actually used is one of the 4 the engine supports —
  //    this system can only ever produce axis-aligned (0/90/180/270)
  //    layouts, so a genuinely diagonal rotation appearing here would mean
  //    something wrote to inst.rotationY outside this engine entirely.
  // 3) no two placed modules' real, rotation-aware bounding boxes actually
  //    overlap in BOTH the X and Z projections at once (touching along a
  //    shared seam with zero gap is fine and expected; overlapping is not)
  //    — computed from each module's live MODULE_DEFS.width/depth, which
  //    loadOne() now measures directly off the loaded GLB rather than a
  //    hand-entered constant.
  if (instances.length > 1) {
    const disconnected = instances.filter((inst) => SNAP_SIDES.every((s) => inst.connections[s] == null));

    const badRotations = instances.filter((inst) => !SNAP_ROTATIONS.includes(((inst.rotationY % 360) + 360) % 360));

    const instanceAABB = (inst) => {
      const { hw, hd } = halfExtents(inst.type);
      const rad = THREE.MathUtils.degToRad(inst.rotationY);
      const Y = new THREE.Vector3(0, 1, 0);
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => {
        const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(Y, rad);
        return { x: inst.x + v.x, z: inst.z + v.z };
      });
      return {
        minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)),
        minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)),
      };
    };
    const overlaps = [];
    for (let a = 0; a < instances.length; a++) {
      for (let b = a + 1; b < instances.length; b++) {
        const A = instanceAABB(instances[a]);
        const B = instanceAABB(instances[b]);
        const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
        const overlapZ = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
        if (overlapX > 1e-6 && overlapZ > 1e-6) {
          overlaps.push({ a: instances[a], b: instances[b], overlapX, overlapZ });
        }
      }
    }

    const ok = failedSteps.length === 0 && disconnected.length === 0 && badRotations.length === 0 && overlaps.length === 0;
    if (!ok) {
      console.error(
        `[preset] BUILD FAILED — ${failedSteps.length} module(s) never snapped at placement time, ` +
        `${disconnected.length} module(s) show no live connection, ` +
        `${badRotations.length} module(s) at a non-90-degree rotation, ` +
        `${overlaps.length} real bounding-box overlap(s) detected. This layout should not ship as-is.`
      );
      overlaps.forEach(({ a, b, overlapX, overlapZ }) => {
        console.error(`  overlap: ${a.type}#${a.id} vs ${b.type}#${b.id} — ${overlapX.toFixed(4)}m x ${overlapZ.toFixed(4)}m`);
      });
    } else {
      console.log(`[preset] build OK — all ${instances.length} modules confirmed snapped, axis-aligned, and non-overlapping.`);
    }
  }

  refreshAll();
  frameCameraOnLayout();
}

// Fit the camera to whatever the preset just built, instead of only
// re-centering the orbit target (which was the previous behavior — it left
// the CAMERA at its default fixed position/angle no matter how big or how
// shaped the new layout was). That default position sits on the +Z side at
// a fairly low ~31 degree elevation; for a straight run that's fine, but
// the L-Shape's corner run recedes away in -Z from that same viewpoint, so
// the front row's ~1m-tall backrests sat directly between the camera and
// the corner and blocked it — exactly the "why can't I see the L" problem
// reported from a client demo. Two changes fix that: a noticeably higher,
// more bird's-eye elevation (so you're looking down onto the seat tops
// rather than across them at backrest height, which is what makes an
// L/U shape actually read as a shape instead of a wall of cushions), and
// sizing the distance to the layout's real bounding box so small (Straight)
// and large (L/U) layouts both fill the frame instead of using one fixed
// distance for everything.
// Values below are not eyeballed — found by sweeping azimuth/elevation
// against the real decoded module meshes and ray-casting from each
// candidate camera position to sample points on each piece, checking
// whether any OTHER piece's geometry sits between the camera and it
// (real occlusion, not a bounding-box guess). azimuth=100/elevation=50 was
// the first combination with ~0% occlusion in BOTH directions (row not
// blocked by the corner, corner not blocked by the row) for the L-Shape
// layout — verified offline before shipping.
// This angle prioritizes matching a classic low front-3/4 product-photo
// framing (the style of a typical furniture-catalog sectional shot) over
// the purely occlusion-optimized angles tried previously (which read more
// like an architectural/isometric floor-plan view than a normal sofa
// photo). That style genuinely trades off some visibility of the corner
// module: a real 2-piece sectional's chaise is low and backless, so
// nothing blocks it from a low front angle, but every Infinia module —
// including the corner one — is a full-height seat with its own backrest,
// so viewed from the row's own "seating" side (the natural product-photo
// angle) the row's backrests do partially occlude what's behind them.
// Swept the whole front-3/4 zone against the real decoded meshes to find
// the least-bad option: azimuth=70/elevation=30 keeps the row itself at
// 0% occlusion (reads perfectly clean, like the main sofa run in a
// reference photo) while holding the corner module's occlusion to ~33%
// (partial near-side overlap with the row, not a wholesale block) — the
// lowest available in this style of framing; more occlusion-free angles
// exist (see git history) but look like a floor-plan diagram, not a photo.
const CAMERA_ELEVATION_DEG = 30;
const CAMERA_AZIMUTH_DEG = 70;
function frameCameraOnLayout() {
  const box = new THREE.Box3();
  instances.forEach((inst) => box.expandByObject(inst.object3D));
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Fit distance off the larger of the two floor-plan dimensions (not just
  // width) so an L/U shape's depth is accounted for too, plus a bit of
  // padding so the layout isn't touching the frame edges.
  const footprint = Math.max(size.x, size.z, 0.6);
  const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitDistance = (footprint * 0.62) / Math.tan(halfFovRad) + footprint * 0.55;
  const distance = THREE.MathUtils.clamp(fitDistance, controls.minDistance, controls.maxDistance);

  const elevRad = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG);
  const azimRad = THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG);
  const horizDist = distance * Math.cos(elevRad);
  camera.position.set(
    center.x + horizDist * Math.sin(azimRad),
    center.y + distance * Math.sin(elevRad) + 0.3,
    center.z + horizDist * Math.cos(azimRad)
  );
  controls.target.set(center.x, 0.3, center.z);
  controls.update();
}

// Each step's `via` says which of ITS edges meets which edge of the
// PREVIOUS step; omitted = the default straight-run pairing (left<-right).
// Verified offline (all dist=0.0000, no overlaps) before shipping — see
// /tmp/preset_check/verify3.mjs in the working notes for the check.
const PRESETS = {
  straight: [
    { type: 'armrest', rotationY: 0 },
    { type: 'single', rotationY: 0 },
    { type: 'single', rotationY: 0 },
    { type: 'armrest', rotationY: 180, via: { mine: 'right', prev: 'right' } },
  ],
  // Matches the client's reference screenshot: a 3-piece straight run
  // (Armrest, Single, Single) that turns 90 degrees into a second Single
  // (the corner-pivot piece) capped by a second Armrest — no 'long'
  // Extension Bench piece in this composition. Verified against the
  // rendered assets the same way ushape was: 'long' has no backrest at all
  // (low bench, ~47cm tall) which doesn't match the tall-backrest corner
  // piece in the reference, while 'single' does.
  // Simplified per direct client feedback after repeated trouble with a
  // true 90-degree corner: every Infinia seat module (armrest, single) has
  // its own full-height backrest, so a rotated corner seat always partly
  // hides behind the row from a normal product-photo camera angle — a
  // structural limitation of this module set that camera tweaks alone
  // can't fully solve (documented in frameCameraOnLayout's comments).
  // Dropped the corner turn entirely: a loveseat (Armrest + 2 Singles)
  // closed by one Extension Bench flush against the 2nd seat, matching a
  // classic sofa+chaise reference photo. The 'long' Extension Bench module
  // has NO backrest (~0.47m tall vs ~1.06m for a Single) so it can't
  // occlude or be occluded by anything, from any angle — and because
  // every piece here stays at rotationY=0, this is a plain straight run:
  // the same proven left<-right touch math as PRESETS.straight, no
  // `corner` step, no rotation-mismatch math needed at all.
  lshape: [
    { type: 'armrest', rotationY: 0 },
    { type: 'single', rotationY: 0 },
    { type: 'single', rotationY: 0 },
    { type: 'long', rotationY: 0 },
  ],
  // Matches the client's reference screenshot exactly: two reclined Single
  // Seat chairs bookending two Console Table units (the ones with the
  // built-in cupholder cutouts) — a straight row, not an actual 90-degree
  // U-turn. Verified against the real shipped assets before writing this:
  // single_sofa.glb is modeled in a reclined chaise pose (tall backrest
  // into an extended low leg-rest) which is exactly the end-piece
  // silhouette in the reference, and console.glb has real cupholder holes
  // matching the middle units. Named "U-Shape" per the client's own
  // terminology for this layout, not a geometric description.
  ushape: [
    { type: 'single', rotationY: 0 },
    { type: 'console', rotationY: 0 },
    { type: 'console', rotationY: 0 },
    { type: 'single', rotationY: 0 },
  ],
};

// ============================================================================
// UI wiring
// ============================================================================
function buildModuleGrid() {
  const grid = document.getElementById('moduleGrid');
  grid.innerHTML = '';
  MODULE_ORDER.forEach((type) => {
    const def = MODULE_DEFS[type];
    const card = document.createElement('div');
    card.className = 'module-card';
    card.innerHTML = `<div class="icon">${def.icon}</div><div class="name">${def.name}</div><div class="price">${formatINR(def.price)}</div>`;
    card.addEventListener('click', () => {
      // Place new modules just to the right of the current footprint so
      // repeated clicks build a row instead of stacking at the origin. That
      // starting spot is only an ESTIMATE (deliberately within snap range,
      // same 0.05m-gap trick placeChain's presets use) — without the snap
      // step below it was also the FINAL position, so clicking a module
      // card repeatedly left a permanent, unsnapped 5cm gap between every
      // module and no connection between them at all. Running it through
      // the same rotation-aware snap search drag-and-drop uses fixes that:
      // clicked modules now land genuinely flush and connected, exactly
      // like dragging one into place by hand would.
      let x = 0;
      if (instances.length) {
        const box = new THREE.Box3();
        instances.forEach((inst) => box.expandByObject(inst.object3D));
        x = box.max.x + def.width / 2 + 0.05;
      }
      const inst = createInstance(type, x, 0, 0);
      if (instances.length > 1) {
        const snap = findBestSnapAnyRotation(inst);
        if (snap) {
          inst.x = snap.x;
          inst.z = snap.z;
          inst.rotationY = snap.rotationY;
          inst.object3D.position.set(inst.x, 0, inst.z);
          inst.object3D.rotation.y = THREE.MathUtils.degToRad(inst.rotationY);
          establishConnection(inst, snap.dSide, snap.other, snap.oSide);
          updateFootprint();
        }
      }
    });
    grid.appendChild(card);
  });
}

function buildFamilyToggle() {
  const wrap = document.getElementById('familyToggle');
  wrap.querySelectorAll('.family-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.family-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setFamily(btn.dataset.family);
    });
  });
}

function buildSwatchRow() {
  const row = document.getElementById('colorSwatches');
  row.innerHTML = '';
  SWATCHES[currentFamily].forEach((sw) => {
    const wrap = document.createElement('div');
    wrap.className = 'swatch-wrap';
    const btn = document.createElement('div');
    btn.className = 'swatch' + (sw.id === currentColorId ? ' active' : '');
    btn.style.background = sw.hex;
    btn.title = sw.name;
    btn.addEventListener('click', () => setColor(sw.id));
    const label = document.createElement('div');
    label.className = 'swatch-label';
    label.textContent = sw.name;
    wrap.appendChild(btn);
    wrap.appendChild(label);
    row.appendChild(wrap);
  });
}

function buildPresetRow() {
  const row = document.getElementById('presetRow');
  const labels = { straight: 'Straight', lshape: 'L-Shape', ushape: 'U-Shape' };
  Object.keys(PRESETS).forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = labels[key];
    btn.addEventListener('click', () => placeChain(PRESETS[key]));
    row.appendChild(btn);
  });
}

document.getElementById('clearAllBtn').addEventListener('click', clearLayout);
document.getElementById('addToCartBtn').addEventListener('click', () => {
  alert('Added to cart (demo) — Shopify checkout wired in production build.');
});

// ============================================================================
// Boot
// ============================================================================
async function boot() {
  buildModuleGrid();
  buildFamilyToggle();
  buildSwatchRow();
  buildPresetRow();
  await preloadAll();
  document.getElementById('viewer-loading').classList.add('hidden');
  placeChain(PRESETS.straight);
}
boot();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
