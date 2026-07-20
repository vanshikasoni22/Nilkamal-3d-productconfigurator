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
const MODULE_DEFS = {
  single: {
    id: 'single', name: 'Single Seat', icon: '🛋️',
    file: 'single_sofa.glb', width: 0.553, depth: 0.939, height: 1.058,
    price: 18999,
  },
  armrest: {
    id: 'armrest', name: 'Armrest', icon: '🪑',
    file: 'armrest.glb', width: 0.152, depth: 0.783, height: 0.623,
    price: 7499,
  },
  long: {
    id: 'long', name: 'Extension Bench', icon: '🛏️',
    file: 'sofa_long_part.glb', width: 0.550, depth: 0.564, height: 0.472,
    price: 14999,
  },
  console: {
    id: 'console', name: 'Console Table', icon: '🪵',
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
  new THREE.LineBasicMaterial({ color: 0x2e9bdb, transparent: true, opacity: 0.85 })
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

const SELECT_EMISSIVE = new THREE.Color(0x2e9bdb);
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
// Presets — reuse the exact same snap math as manual dragging, by placing
// each module then nudging it onto the previous module's right edge.
// ============================================================================
function clearLayout() {
  [...instances].forEach((inst) => removeInstance(inst.id));
}

function placeChain(sequence) {
  clearLayout();
  let prev = null;
  sequence.forEach(({ type, rotationY = 0, via }) => {
    let x = 0, z = 0;
    if (prev) {
      // Naively creating every new module at (0,0) would place it much
      // farther from the previous one than SNAP_DIST, so findBestSnap would
      // never trigger. Instead, estimate a starting position by placing one
      // of this module's own edges (at its target rotation) exactly on one
      // of the previous module's edges — already touching, so the snap
      // check below only has to confirm/fine-tune, not bridge a big gap.
      //
      // Which edge pair to use isn't always "my left touches their right":
      // that's only true for a straight run. At a corner, a module rotated
      // 90°/270° has BOTH its left and right edges swung to face front/back
      // in world space, so the next module in the row has to connect via
      // ITS front or back edge instead. Each preset step can specify the
      // pair explicitly via `via: { mine, prev }`; it defaults to the
      // straight-run case (left<-right) when omitted.
      const mine = via?.mine ?? 'left';
      const prevSide = via?.prev ?? 'right';
      const prevEdge = worldEdge(prev, prevSide);
      const rad = THREE.MathUtils.degToRad(rotationY);
      const localMine = localEdges(type)[mine].local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
      x = prevEdge.worldPos.x - localMine.x;
      z = prevEdge.worldPos.z - localMine.z;
    }
    const inst = createInstance(type, x, z, rotationY);
    if (prev) {
      const snap = findBestSnap(inst);
      if (snap) {
        inst.x = snap.x; inst.z = snap.z; inst.object3D.position.set(inst.x, 0, inst.z);
        establishConnection(inst, snap.dSide, snap.other, snap.oSide);
      } else {
        console.warn(`[preset] ${type} did not snap to previous ${prev.type} — check rotation combo`);
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
  refreshAll();
  // Frame the camera on the finished layout.
  const box = new THREE.Box3();
  instances.forEach((inst) => box.expandByObject(inst.object3D));
  const center = box.getCenter(new THREE.Vector3());
  controls.target.set(center.x, 0.3, center.z);
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
  lshape: [
    { type: 'armrest', rotationY: 90 },
    { type: 'long', rotationY: 90, via: { mine: 'left', prev: 'right' } },
    // Corner turn: 'long' at rotY=90 has both its left/right edges facing
    // front/back in world space now, so the next module connects via ITS
    // front edge, not its left edge.
    { type: 'single', rotationY: 0, via: { mine: 'front', prev: 'right' } },
    { type: 'single', rotationY: 0, via: { mine: 'left', prev: 'right' } },
    { type: 'armrest', rotationY: 180, via: { mine: 'right', prev: 'right' } },
  ],
  ushape: [
    { type: 'armrest', rotationY: 90 },
    { type: 'long', rotationY: 90, via: { mine: 'left', prev: 'right' } },
    { type: 'single', rotationY: 0, via: { mine: 'front', prev: 'right' } },
    { type: 'console', rotationY: 0, via: { mine: 'left', prev: 'right' } },
    { type: 'single', rotationY: 0, via: { mine: 'left', prev: 'right' } },
    // Second corner turn, closing the U back into a rotY=270 run.
    { type: 'long', rotationY: 270, via: { mine: 'front', prev: 'right' } },
    { type: 'armrest', rotationY: 270, via: { mine: 'right', prev: 'left' } },
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
      // repeated clicks build a row instead of stacking at the origin.
      let x = 0;
      if (instances.length) {
        const box = new THREE.Box3();
        instances.forEach((inst) => box.expandByObject(inst.object3D));
        x = box.max.x + def.width / 2 + 0.05;
      }
      createInstance(type, x, 0, 0);
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
