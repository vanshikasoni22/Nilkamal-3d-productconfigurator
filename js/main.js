import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { DRACOLoader } from '../vendor/three/DRACOLoader.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { CATALOG, CATEGORY_ORDER, SWATCHES, formatINR, emiEstimate } from './data.js';

// ============================================================================
// Three.js scene setup
// ============================================================================
const canvas = document.getElementById('viewer-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

// clean studio backdrop (soft vertical gradient, like an infinity-cove product shot)
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

// PMREM studio environment for realistic PBR reflections
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
camera.position.set(2.6, 1.6, 3.4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.6;
controls.maxDistance = 12;
controls.minPolarAngle = Math.PI * 0.12;
controls.maxPolarAngle = Math.PI * 0.52;
controls.target.set(0, 0.45, 0);
controls.update();

// Lighting: soft hemisphere fill + key + rim, tuned for a showroom product-shot look
const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(3.2, 4.4, 2.6);
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(-3.5, 2.2, -2.2);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(-1.5, 3, -3.5);
scene.add(rim);

// Soft ground contact shadow — a blurred radial-gradient disc under the
// model, not a real-time shadow map. Cheap, always-clean, no peter-panning
// or acne artifacts, and it reads as the soft "product photography" shadow
// used by references like IKEA's configurator rather than a hard drop shadow.
function makeContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(20,20,22,0.42)');
  g.addColorStop(0.55, 'rgba(20,20,22,0.22)');
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
contactShadow.renderOrder = -1;
contactShadow.visible = false;
scene.add(contactShadow);

// root that holds the current active product
const productRoot = new THREE.Group();
scene.add(productRoot);
const moduleRoot = new THREE.Group(); // side table / ottoman add-ons
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
// Live width/height dimension callouts, drawn as an SVG overlay on top of the
// canvas. Lines are anchored to the current model's bounding box and are
// re-projected to screen space every frame, so they track the camera as the
// user orbits.
// ============================================================================
const SVGNS = 'http://www.w3.org/2000/svg';
const dimSvg = document.getElementById('dimOverlay');

function makeDimGroup(axis) {
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('class', `dim-group dim-${axis}`);
  const tick1 = document.createElementNS(SVGNS, 'line');
  const tick2 = document.createElementNS(SVGNS, 'line');
  const main = document.createElementNS(SVGNS, 'line');
  [tick1, tick2, main].forEach((l) => l.setAttribute('class', 'dim-line'));
  const bg = document.createElementNS(SVGNS, 'rect');
  bg.setAttribute('class', 'dim-label-bg');
  const label = document.createElementNS(SVGNS, 'text');
  label.setAttribute('class', 'dim-label');
  g.appendChild(tick1); g.appendChild(tick2); g.appendChild(main);
  g.appendChild(bg); g.appendChild(label);
  dimSvg.appendChild(g);
  return { g, tick1, tick2, main, bg, label };
}
const dimWidth = makeDimGroup('width');
const dimHeight = makeDimGroup('height');

const _projV = new THREE.Vector3();
function worldToScreen(x, y, z) {
  _projV.set(x, y, z).project(camera);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  return { x: (_projV.x * 0.5 + 0.5) * w, y: (-_projV.y * 0.5 + 0.5) * h };
}

function setLine(el, a, b) {
  el.setAttribute('x1', a.x); el.setAttribute('y1', a.y);
  el.setAttribute('x2', b.x); el.setAttribute('y2', b.y);
}

// Offsets a label perpendicular to the on-screen direction of line a→b, so it
// stays correctly aligned with the dimension line at any camera angle instead
// of using a fixed pixel offset that only looks right from one viewpoint.
function perpLabelPos(a, b, dist, awayFrom) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  let dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  let px = -dy, py = dx;
  if (awayFrom) {
    const tx = mx - awayFrom.x, ty = my - awayFrom.y;
    if (px * tx + py * ty < 0) { px = -px; py = -py; }
  }
  return { x: mx + px * dist, y: my + py * dist };
}

function setLabel(group, midpoint, text) {
  group.label.textContent = text;
  group.label.setAttribute('x', midpoint.x);
  group.label.setAttribute('y', midpoint.y);
  const w = Math.max(30, text.length * 6.6 + 12);
  group.bg.setAttribute('x', midpoint.x - w / 2);
  group.bg.setAttribute('y', midpoint.y - 10);
  group.bg.setAttribute('width', w);
  group.bg.setAttribute('height', 18);
}

function getCurrentCmDims() {
  const cat = state.category;
  const s = state.perCategory[cat];
  const cfg = CATALOG[cat];
  if (cat === 'sofa') {
    const l = cfg.layouts.find((x) => x.id === s.layout);
    return { width: l.widthCm, height: l.heightCm };
  }
  if (cat === 'bed') {
    const sz = cfg.sizes.find((x) => x.id === s.size);
    const v = cfg.variants.find((x) => x.id === s.variant);
    return { width: sz.widthCm, height: v.heightCm };
  }
  if (cat === 'wardrobe') {
    const w = cfg.widths.find((x) => x.id === s.width);
    const v = cfg.variants.find((x) => x.id === s.variant);
    return { width: w.widthCm, height: v.heightCm };
  }
  if (cat === 'dining') {
    const v = cfg.variants.find((x) => x.id === s.variant);
    return { width: v.widthCm, height: v.heightCm };
  }
  if (cat === 'accent') {
    const sz = cfg.sizes.find((x) => x.id === s.size);
    return { width: sz.widthCm, height: sz.heightCm };
  }
  return { width: null, height: null };
}

let showDims = false;
const _dimBox = new THREE.Box3();
const _dimSize = new THREE.Vector3();
const _dimCenter = new THREE.Vector3();
function updateDimensionOverlay() {
  _dimBox.setFromObject(productRoot);
  if (_dimBox.isEmpty()) {
    dimSvg.style.opacity = 0;
    contactShadow.visible = false;
    return;
  }

  // Contact shadow tracks the model's footprint every frame, independent of
  // whether the measurement overlay is toggled on.
  _dimBox.getSize(_dimSize);
  _dimBox.getCenter(_dimCenter);
  contactShadow.visible = true;
  contactShadow.position.set(_dimCenter.x, _dimBox.min.y + 0.002, _dimCenter.z);
  contactShadow.scale.set(Math.max(_dimSize.x, 0.2) * 1.75, Math.max(_dimSize.z, 0.2) * 1.75, 1);

  if (!showDims) { dimSvg.style.opacity = 0; return; }
  dimSvg.style.opacity = 1;
  camera.updateMatrixWorld(true);

  const { min, max } = _dimBox;
  const { width, height } = getCurrentCmDims();
  const gap = 0.16;
  const center = _dimBox.getCenter(new THREE.Vector3());
  const screenCenter = worldToScreen(center.x, center.y, center.z);

  // width callout: horizontal line offset in front of the model, floor level
  const wz = max.z + gap;
  const wA = worldToScreen(min.x, min.y, wz);
  const wB = worldToScreen(max.x, min.y, wz);
  const wTickA1 = worldToScreen(min.x, min.y, max.z);
  const wTickA2 = worldToScreen(min.x, min.y, wz);
  const wTickB1 = worldToScreen(max.x, min.y, max.z);
  const wTickB2 = worldToScreen(max.x, min.y, wz);
  setLine(dimWidth.tick1, wTickA1, wTickA2);
  setLine(dimWidth.tick2, wTickB1, wTickB2);
  setLine(dimWidth.main, wA, wB);
  setLabel(dimWidth, perpLabelPos(wA, wB, 16, screenCenter), width ? `${width} cm` : '');

  // height callout: vertical line offset to the left side of the model
  const hx = min.x - gap;
  const hA = worldToScreen(hx, min.y, max.z);
  const hB = worldToScreen(hx, max.y, max.z);
  const hTickA1 = worldToScreen(min.x, min.y, max.z);
  const hTickA2 = worldToScreen(hx, min.y, max.z);
  const hTickB1 = worldToScreen(min.x, max.y, max.z);
  const hTickB2 = worldToScreen(hx, max.y, max.z);
  setLine(dimHeight.tick1, hTickA1, hTickA2);
  setLine(dimHeight.tick2, hTickB1, hTickB2);
  setLine(dimHeight.main, hA, hB);
  setLabel(dimHeight, perpLabelPos(hA, hB, 22, screenCenter), height ? `${height} cm` : '');
}

// No automatic/forced rotation — the model only turns when the user drags.
// OrbitControls (below) handles all rotation/zoom input directly.
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  updateDimensionOverlay();
}
animate();

// ============================================================================
// Loaders + cache
// ============================================================================
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./vendor/draco/gltf/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const modelCache = new Map(); // url -> THREE.Group (raw, unnormalized clone source)

function loadGLB(url) {
  if (modelCache.has(url)) return Promise.resolve(modelCache.get(url).clone(true));
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const obj = gltf.scene;
        obj.traverse((n) => {
          if (n.isMesh) {
            if (n.material) n.material = n.material.clone();
          }
        });
        modelCache.set(url, obj);
        resolve(obj.clone(true));
      },
      undefined,
      reject
    );
  });
}

function assetUrl(dir, file) {
  return `./assets/${dir}/${file}`;
}

// normalize scale+position so every product frames consistently regardless of source scale
function normalize(object, targetSize = 2.05) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  // recompute box after scaling to reposition on floor, centered at origin
  const box2 = new THREE.Box3().setFromObject(object);
  const size2 = new THREE.Vector3();
  box2.getSize(size2);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  object.position.x -= center2.x;
  object.position.z -= center2.z;
  object.position.y -= box2.min.y;
  return { footprint: size2 };
}

// ============================================================================
// Procedural accent side table (used standalone + as sofa module)
// ============================================================================
function buildAccentTable({ shape = 'round', woodHex = '#b98a53', metalHex = '#2b2b2b', scale = 1, textured = true } = {}) {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: woodHex, roughness: 0.42, metalness: 0.02, map: textured ? woodTexture : null });
  const metalMat = new THREE.MeshStandardMaterial({ color: metalHex, roughness: 0.32, metalness: 0.85 });

  const topH = 0.035;
  let top;
  if (shape === 'round') {
    top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, topH, 48), woodMat);
  } else {
    top = new THREE.Mesh(new THREE.BoxGeometry(0.5, topH, 0.5), woodMat);
  }
  top.position.y = 0.44;
  g.add(top);

  const legRadius = 0.012;
  const legPositions = [
    [0.19, 0.19], [-0.19, 0.19], [0.19, -0.19], [-0.19, -0.19],
  ];
  legPositions.forEach(([x, z]) => {
    const legGeo = new THREE.CylinderGeometry(legRadius, legRadius * 1.4, 0.42, 12);
    const leg = new THREE.Mesh(legGeo, metalMat);
    leg.position.set(x, 0.21, z);
    leg.rotation.z = (x > 0 ? -1 : 1) * 0.09;
    leg.rotation.x = (z > 0 ? 1 : -1) * 0.09;
    g.add(leg);
  });

  g.scale.setScalar(scale);
  return g;
}

function buildOttoman({ hex = '#575c62', scale = 1, textured = true } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.0, map: textured ? fabricTexture : null });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.32, 32), mat);
  body.position.y = 0.16;
  g.add(body);
  const legMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.35, metalness: 0.7 });
  [[0.18,0.18],[-0.18,0.18],[0.18,-0.18],[-0.18,-0.18]].forEach(([x,z])=>{
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.014,0.08,10), legMat);
    leg.position.set(x, 0.02, z);
    g.add(leg);
  });
  g.scale.setScalar(scale);
  return g;
}

// ============================================================================
// Procedural fabric / wood-grain textures ("Texture" toggle)
// Neutral grayscale patterns that get multiplied with the swatch color in the
// shader, so one texture works underneath every color choice — this is what
// makes swatches read as real woven cloth / wood grain instead of flat color.
// ============================================================================
function makeFabricCanvasTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  // Fine grain noise instead of a bold checker pattern — this mesh's UVs are
  // stretched enough that a coarse pattern reads as a giant checkerboard, so
  // the pattern itself has to be very low-contrast and very high-frequency to
  // still look like cloth once repeated across the surface.
  const img = ctx.getImageData(0, 0, 64, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    img.data[i] = 255 + n;
    img.data[i + 1] = 255 + n;
    img.data[i + 2] = 255 + n;
  }
  ctx.putImageData(img, 0, 0);
  // faint diagonal thread hint, barely visible, just enough to read as woven
  ctx.strokeStyle = 'rgba(0,0,0,0.03)';
  ctx.lineWidth = 1;
  for (let i = -64; i < 128; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(45, 45);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWoodCanvasTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y++) {
    const wobble = Math.sin(y * 0.35) * 0.05 + (Math.random() - 0.5) * 0.09;
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.16 + wobble)})`;
    ctx.fillRect(0, y, 128, 1);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 10; i++) {
    const y = Math.random() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.1 + i) * 3);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const fabricTexture = makeFabricCanvasTexture();
const woodTexture = makeWoodCanvasTexture();

// ============================================================================
// App state
// ============================================================================
const state = {
  category: 'sofa',
  perCategory: {
    sofa: { variant: 'boston', layout: 'seat2', color: 'charcoal', modules: {}, textured: true },
    bed: { variant: 'dream', size: 'queen', color: 'charcoal', textured: false },
    wardrobe: { variant: 'classic', finish: 'walnut', frameColor: 'walnut', doorColor: 'oak', width: 'standard', textured: false },
    dining: { variant: 'ovalis', seats: 6, woodColor: 'walnut', fabricColor: 'charcoal', textured: false },
    accent: { variant: 'round', size: 'small', woodColor: 'oak', metalColor: 'black', textured: false },
  },
};

const thumbCache = new Map(); // key: url -> dataURL

let sceneToken = 0; // guards against race conditions when rapidly switching

// ============================================================================
// Material tinting helper
// ============================================================================
// Tints matched materials by name, and optionally layers on a neutral woven
// fabric / wood-grain pattern (multiplied with the tint color) so swatches
// read as real material instead of flat plastic color.
function applyFinish(object, materialNames, hex, patternType, textured) {
  if (!hex || !materialNames) return;
  const color = new THREE.Color(hex);
  const tex = patternType === 'wood' ? woodTexture : patternType === 'fabric' ? fabricTexture : null;
  object.traverse((n) => {
    if (n.isMesh && n.material && materialNames.includes(n.material.name)) {
      // Remember the model's own baked texture the first time we touch this
      // material, so turning the procedural texture toggle off restores the
      // real baked detail instead of falling back to a flat, mapless color.
      // Any material NOT in materialNames (e.g. a split-off frame/leg region)
      // is never touched here at all — it keeps its original color and
      // texture untouched, so a color swatch only recolors the part of the
      // model that's actually meant to change.
      if (n.material.userData.__origMap === undefined) {
        n.material.userData.__origMap = n.material.map || null;
      }
      n.material.color.copy(color);
      n.material.map = textured ? tex : n.material.userData.__origMap;
      n.material.needsUpdate = true;
    }
  });
}

function setChairVisibility(object, chairNodes, visibleCount) {
  chairNodes.forEach((name, i) => {
    const node = object.getObjectByName(name);
    if (node) node.visible = i < visibleCount;
  });
}

// ============================================================================
// Scene builders per category
// ============================================================================
async function renderSofaScene(token) {
  const cfg = CATALOG.sofa;
  const s = state.perCategory.sofa;
  const layout = cfg.layouts.find((l) => l.id === s.layout);
  const file = layout.files[s.variant];
  const url = assetUrl(cfg.assetDir, file);
  const obj = await loadGLB(url);
  if (token !== sceneToken) return;

  normalize(obj);
  // sofa1-var1.glb and sofa1-var2.glb (same for sofa2) share the exact same
  // source geometry/bounding box — they're texture bakes of one fixed sofa,
  // not distinct 2-seat/3-seat models. We scale the 3-seater relative to the
  // 2-seater baseline so it actually reads as bigger on screen. This used to
  // warp the mesh badly, but that turned out to be caused by the Boston GLBs
  // shipping with KHR_materials_unlit + no vertex normals (now fixed) — the
  // stretch itself renders cleanly once the material/normals are correct.
  const baseLayout = cfg.layouts[0];
  obj.scale.x *= layout.widthCm / baseLayout.widthCm;
  obj.scale.z *= layout.depthCm / baseLayout.depthCm;
  applyFinish(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.color)?.hex, 'fabric', s.textured);
  productRoot.clear();
  productRoot.add(obj);

  moduleRoot.clear();
  const box = new THREE.Box3().setFromObject(obj);
  // Accent table/ottoman footprints are ~0.27-0.3 units in radius — offset
  // by that radius plus a real visible gap so they sit clearly beside the
  // sofa's arm instead of clipping into it. The camera looks at the model
  // from +Z (see camera.position further up), so "beside the front of the
  // sofa" means near max.z, not the depth-center (Z=0) — otherwise the
  // module reads as sitting further back than the front seat cushions.
  const SIDE_TABLE_RADIUS = 0.27;
  const OTTOMAN_RADIUS = 0.30;
  const SIDE_GAP = 0.22;
  // Align with the very front edge of the sofa (where the front cushions/arm
  // face the camera), not just "mostly forward" — a real side table sits
  // flush with the front of the sofa, reachable from the front seat.
  const frontZ = box.max.z - 0.05;
  if (s.modules.sidetable) {
    const t = buildAccentTable({ shape: 'round', woodHex: '#b98a53', metalHex: '#2b2b2b', scale: 1, textured: s.textured });
    t.position.set(box.max.x + SIDE_TABLE_RADIUS + SIDE_GAP, 0, frontZ);
    moduleRoot.add(t);
  }
  if (s.modules.ottoman) {
    const o = buildOttoman({ hex: SWATCHES.fabric.find(sw => sw.id === s.color)?.hex, textured: s.textured });
    o.position.set(box.min.x - OTTOMAN_RADIUS - SIDE_GAP, 0, frontZ);
    moduleRoot.add(o);
  }
  captureThumbnailFor(url, obj);
}

async function renderBedScene(token) {
  const cfg = CATALOG.bed;
  const s = state.perCategory.bed;
  const file = cfg.files[s.variant];
  const url = assetUrl(cfg.assetDir, file);
  const obj = await loadGLB(url);
  if (token !== sceneToken) return;

  normalize(obj);
  const sizeCfg = cfg.sizes.find((z) => z.id === s.size);
  obj.scale.x *= sizeCfg.scale;
  applyFinish(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.color)?.hex, 'fabric', s.textured);
  productRoot.clear();
  productRoot.add(obj);
  moduleRoot.clear();
  captureThumbnailFor(url, obj);
}

async function renderWardrobeScene(token) {
  const cfg = CATALOG.wardrobe;
  const s = state.perCategory.wardrobe;
  const variant = cfg.variants.find((v) => v.id === s.variant);
  const url = assetUrl(cfg.assetDir, variant.file);
  const obj = await loadGLB(url);
  if (token !== sceneToken) return;

  normalize(obj);
  const widthCfg = cfg.widths.find((w) => w.id === s.width);
  obj.scale.x *= widthCfg.scaleX;
  if (variant.twoTone) {
    applyFinish(obj, variant.materialTargets.frame, SWATCHES.wood.find(sw => sw.id === s.frameColor)?.hex, 'wood', s.textured);
    applyFinish(obj, variant.materialTargets.door, SWATCHES.doorAccent.find(sw => sw.id === s.doorColor)?.hex, 'wood', s.textured);
  } else {
    applyFinish(obj, variant.materialTargets.wood, SWATCHES.wood.find(sw => sw.id === s.finish)?.hex, 'wood', s.textured);
  }
  // Satin polish pass — the source materials come in flat/matte, which reads
  // as "cheap plastic" rather than lacquered furniture. Nudge every material
  // toward a subtle sheen so it looks more premium under the studio lights.
  obj.traverse((n) => {
    if (n.isMesh && n.material) {
      n.material.roughness = Math.min(n.material.roughness ?? 0.6, 0.4);
      n.material.metalness = Math.max(n.material.metalness ?? 0, 0.05);
      n.material.envMapIntensity = 1.15;
    }
  });
  productRoot.clear();
  productRoot.add(obj);
  moduleRoot.clear();
  captureThumbnailFor(url, obj);
}

async function renderDiningScene(token) {
  const cfg = CATALOG.dining;
  const s = state.perCategory.dining;
  const variant = cfg.variants.find((v) => v.id === s.variant);
  const url = assetUrl(cfg.assetDir, variant.file);
  const obj = await loadGLB(url);
  if (token !== sceneToken) return;

  normalize(obj);
  setChairVisibility(obj, variant.chairNodes, s.seats);
  applyFinish(obj, cfg.materialTargets.wood, SWATCHES.wood.find(sw => sw.id === s.woodColor)?.hex, 'wood', s.textured);
  applyFinish(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.fabricColor)?.hex, 'fabric', s.textured);
  productRoot.clear();
  productRoot.add(obj);
  moduleRoot.clear();
  captureThumbnailFor(url, obj);
}

async function renderAccentScene(token) {
  const cfg = CATALOG.accent;
  const s = state.perCategory.accent;
  const sizeCfg = cfg.sizes.find((z) => z.id === s.size);
  const woodHex = SWATCHES.wood.find(sw => sw.id === s.woodColor)?.hex;
  const metalHex = SWATCHES.metal.find(sw => sw.id === s.metalColor)?.hex;
  const obj = buildAccentTable({ shape: s.variant === 'square' ? 'square' : 'round', woodHex, metalHex, scale: 1, textured: s.textured });
  normalize(obj, 1.5 * sizeCfg.scale);
  productRoot.clear();
  productRoot.add(obj);
  moduleRoot.clear();
  hideLoading();
}

const SCENE_RENDERERS = {
  sofa: renderSofaScene,
  bed: renderBedScene,
  wardrobe: renderWardrobeScene,
  dining: renderDiningScene,
  accent: renderAccentScene,
};

function showLoading() { document.getElementById('viewer-loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('viewer-loading').classList.add('hidden'); }

async function refreshScene() {
  const token = ++sceneToken;
  showLoading();
  try {
    await SCENE_RENDERERS[state.category](token);
  } catch (e) {
    console.error('Scene load failed', e);
  }
  if (token === sceneToken) hideLoading();
  updateDims();
}

// ============================================================================
// Thumbnails — captured from the live renderer once a model has been framed
// ============================================================================
function captureThumbnailFor(key, obj) {
  if (thumbCache.has(key)) { refreshThumbButtons(); return; }
  // wait a couple of frames so camera/controls settle and shadows render
  let frames = 0;
  function tick() {
    frames++;
    if (frames < 3) { requestAnimationFrame(tick); return; }
    try {
      const dataUrl = renderer.domElement.toDataURL('image/png');
      thumbCache.set(key, dataUrl);
      refreshThumbButtons();
    } catch (e) { /* canvas tainted or not ready — ignore */ }
  }
  requestAnimationFrame(tick);
}

function refreshThumbButtons() {
  document.querySelectorAll('[data-thumb-key]').forEach((el) => {
    const key = el.getAttribute('data-thumb-key');
    if (thumbCache.has(key)) {
      el.style.backgroundImage = `url(${thumbCache.get(key)})`;
      const fb = el.querySelector('.thumb-fallback');
      if (fb) fb.style.display = 'none';
    }
  });
}

// ============================================================================
// Pricing
// ============================================================================
function computePrice() {
  const cat = state.category;
  const s = state.perCategory[cat];
  const cfg = CATALOG[cat];
  let total = 0;
  let strike = 0;

  if (cat === 'sofa') {
    const layout = cfg.layouts.find((l) => l.id === s.layout);
    total += layout.price[s.variant];
    const colorSw = SWATCHES.fabric.find(sw => sw.id === s.color);
    if (colorSw?.premium) total += 3500;
    cfg.modules.forEach((m) => { if (s.modules[m.id]) total += m.price; });
  } else if (cat === 'bed') {
    total += cfg.basePrice[s.variant];
    total += cfg.sizes.find((z) => z.id === s.size).priceAdd;
    const colorSw = SWATCHES.fabric.find(sw => sw.id === s.color);
    if (colorSw?.premium) total += 2000;
  } else if (cat === 'wardrobe') {
    const variant = cfg.variants.find((v) => v.id === s.variant);
    total += variant.basePrice;
    total += cfg.widths.find((w) => w.id === s.width).priceAdd;
    const finishSw = SWATCHES.wood.find(sw => sw.id === s.finish);
    if (finishSw?.premium) total += 2500;
  } else if (cat === 'dining') {
    const variant = cfg.variants.find((v) => v.id === s.variant);
    total += variant.basePrice;
    const includedChairs = Math.max(...variant.seatOptions);
    total += (s.seats - includedChairs) * variant.chairPrice;
  } else if (cat === 'accent') {
    total += cfg.basePrice;
    total += cfg.sizes.find((z) => z.id === s.size).priceAdd;
    const variant = cfg.variants.find((v) => v.id === s.variant);
    total += variant.priceAdd;
  }

  strike = Math.round(total * 1.18);
  return { total, strike };
}

function updatePriceUI() {
  const { total, strike } = computePrice();
  document.getElementById('price-main').textContent = formatINR(total);
  document.getElementById('price-strike').textContent = formatINR(strike);
  document.getElementById('price-emi').textContent = `or ${formatINR(emiEstimate(total))}/mo with EMI*`;
  const pct = Math.round(((strike - total) / strike) * 100);
  document.getElementById('price-save').textContent = `You Save ${formatINR(strike - total)} (${pct}% Off)`;
}

function updateDims() {
  const cat = state.category;
  const s = state.perCategory[cat];
  const cfg = CATALOG[cat];
  let dims = '';
  if (cat === 'sofa') dims = cfg.layouts.find((l) => l.id === s.layout)?.dims || '';
  else if (cat === 'bed') dims = cfg.sizes.find((z) => z.id === s.size)?.dims || '';
  else if (cat === 'wardrobe') dims = cfg.widths.find((w) => w.id === s.width)?.dims || '';
  else if (cat === 'dining') dims = `${s.seats}-seat configuration`;
  else if (cat === 'accent') dims = cfg.sizes.find((z) => z.id === s.size)?.dims || '';
  document.getElementById('viewer-dims').textContent = dims;
}

// ============================================================================
// UI builders
// ============================================================================
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function stepBlock(num, label) {
  const step = el('div', 'step');
  const lab = el('div', 'step-label');
  lab.innerHTML = `<span class="step-num">${num}</span>${label}`;
  step.appendChild(lab);
  return step;
}

function buildSwatchRow(container, group, activeId, onPick) {
  const row = el('div', 'swatch-row');
  SWATCHES[group].forEach((sw) => {
    const wrap = el('div', 'swatch-wrap');
    const btn = el('div', 'swatch' + (sw.id === activeId ? ' active' : ''));
    btn.style.background = sw.hex;
    btn.title = sw.name;
    if (sw.premium) {
      const dot = el('div', 'premium-dot', '+');
      btn.appendChild(dot);
    }
    btn.addEventListener('click', () => onPick(sw.id));
    const label = el('div', 'swatch-label', sw.name);
    wrap.appendChild(btn);
    wrap.appendChild(label);
    row.appendChild(wrap);
  });
  container.appendChild(row);
}

function buildChipRow(container, options, activeId, onPick, priceFormatter) {
  const row = el('div', 'chip-row');
  options.forEach((opt) => {
    const chip = el('div', 'chip' + (opt.id === activeId ? ' active' : ''));
    const sub = priceFormatter ? priceFormatter(opt) : (opt.dims || opt.desc || '');
    chip.innerHTML = `<span>${opt.name}</span><span class="chip-sub">${sub}</span>`;
    chip.addEventListener('click', () => onPick(opt.id));
    row.appendChild(chip);
  });
  container.appendChild(row);
}

function buildThumbRow(container, options, activeId, thumbKeyFn, onPick) {
  const row = el('div', 'thumb-row');
  options.forEach((opt) => {
    const wrap = el('div', 'thumb-wrap');
    const key = thumbKeyFn(opt);
    const btn = el('div', 'thumb-btn' + (opt.id === activeId ? ' active' : ''));
    btn.setAttribute('data-thumb-key', key);
    if (thumbCache.has(key)) btn.style.backgroundImage = `url(${thumbCache.get(key)})`;
    const fb = el('div', 'thumb-fallback', '🛋️');
    if (thumbCache.has(key)) fb.style.display = 'none';
    btn.appendChild(fb);
    btn.addEventListener('click', () => onPick(opt.id));
    wrap.appendChild(btn);
    wrap.appendChild(el('div', 'thumb-label', opt.name));
    row.appendChild(wrap);
  });
  container.appendChild(row);
}

function buildModuleRow(container, modules, activeMap, onToggle) {
  const row = el('div', 'module-row');
  modules.forEach((m) => {
    const item = el('div', 'module-item' + (activeMap[m.id] ? ' active' : ''));
    const left = el('div', 'module-left');
    left.innerHTML = `<span class="module-checkbox">${activeMap[m.id] ? '✓' : ''}</span><span>${m.name}</span>`;
    const price = el('div', 'module-price', '+' + formatINR(m.price));
    item.appendChild(left);
    item.appendChild(price);
    item.addEventListener('click', () => onToggle(m.id));
    row.appendChild(item);
  });
  container.appendChild(row);
}

function buildStepperRow(container, value, min, max, onChange, labelFn) {
  const row = el('div', 'stepper-row');
  const minus = el('button', 'stepper-btn', '−');
  const val = el('div', 'stepper-val', labelFn(value));
  const plus = el('button', 'stepper-btn', '+');
  minus.disabled = value <= min;
  plus.disabled = value >= max;
  minus.addEventListener('click', () => onChange(Math.max(min, value - 1)));
  plus.addEventListener('click', () => onChange(Math.min(max, value + 1)));
  row.appendChild(minus); row.appendChild(val); row.appendChild(plus);
  container.appendChild(row);
}

function buildTextureToggle(container, label, active, onToggle) {
  const row = el('div', 'texture-toggle' + (active ? ' active' : ''));
  row.innerHTML = `<span class="tt-track"><span class="tt-thumb"></span></span><span class="tt-label">${label}: <strong>${active ? 'On' : 'Off'}</strong></span>`;
  row.addEventListener('click', () => onToggle(!active));
  container.appendChild(row);
}

// ---------------------------------------------------------------------------
function renderPanel() {
  const cat = state.category;
  const cfg = CATALOG[cat];
  const s = state.perCategory[cat];

  document.getElementById('p-title').textContent = cfg.heroName;
  document.getElementById('p-sku').textContent = `SKU ${cfg.sku} · Studio Render`;
  document.getElementById('p-stars').textContent = '★★★★★'.slice(0, Math.round(cfg.rating)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(cfg.rating));
  document.getElementById('p-reviews').textContent = `${cfg.rating.toFixed(1)} (${cfg.reviews} reviews)`;

  const steps = document.getElementById('steps');
  steps.classList.add('fading');
  steps.innerHTML = '';

  if (cat === 'sofa') {
    const layoutsForVariant = (variantId) => cfg.layouts.filter((l) => !(l.excludeVariants || []).includes(variantId));

    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant,
      (v) => assetUrl(cfg.assetDir, cfg.layouts.find(l => l.id === s.layout).files[v.id]),
      (id) => {
        s.variant = id;
        // some layouts aren't offered for every variant (e.g. Boston only
        // ships as a 2-seater) — fall back to the first valid layout instead
        // of leaving the state pointed at a hidden option.
        const available = layoutsForVariant(id);
        if (!available.some((l) => l.id === s.layout)) s.layout = available[0].id;
        refreshAll();
      });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Layout');
    buildChipRow(s2, layoutsForVariant(s.variant), s.layout, (id) => { s.layout = id; refreshAll(); },
      (opt) => opt.dims);
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Fabric & Color');
    buildSwatchRow(s3, cfg.swatchGroup, s.color, (id) => { s.color = id; refreshAll(); });
    buildTextureToggle(s3, 'Woven Fabric Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
    steps.appendChild(s3);

    const s4 = stepBlock(4, 'Add Modules');
    buildModuleRow(s4, cfg.modules, s.modules, (id) => { s.modules[id] = !s.modules[id]; refreshAll(); });
    steps.appendChild(s4);

  } else if (cat === 'bed') {
    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant, (v) => assetUrl(cfg.assetDir, cfg.files[v.id]),
      (id) => { s.variant = id; refreshAll(); });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Size');
    buildChipRow(s2, cfg.sizes, s.size, (id) => { s.size = id; refreshAll(); }, (opt) => opt.dims);
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Fabric & Color');
    buildSwatchRow(s3, cfg.swatchGroup, s.color, (id) => { s.color = id; refreshAll(); });
    buildTextureToggle(s3, 'Woven Fabric Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
    steps.appendChild(s3);

  } else if (cat === 'wardrobe') {
    const variant = cfg.variants.find(v => v.id === s.variant);

    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant, (v) => assetUrl(cfg.assetDir, v.file),
      (id) => { s.variant = id; refreshAll(); });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Width');
    buildChipRow(s2, cfg.widths, s.width, (id) => { s.width = id; refreshAll(); }, (opt) => opt.dims);
    steps.appendChild(s2);

    if (variant.twoTone) {
      const s3 = stepBlock(3, 'Frame Finish');
      buildSwatchRow(s3, 'wood', s.frameColor, (id) => { s.frameColor = id; refreshAll(); });
      steps.appendChild(s3);

      const s4 = stepBlock(4, 'Door Accent Color');
      buildSwatchRow(s4, 'doorAccent', s.doorColor, (id) => { s.doorColor = id; refreshAll(); });
      buildTextureToggle(s4, 'Wood Grain Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
      steps.appendChild(s4);
    } else {
      const s3 = stepBlock(3, 'Finish & Color');
      buildSwatchRow(s3, cfg.swatchGroup, s.finish, (id) => { s.finish = id; refreshAll(); });
      buildTextureToggle(s3, 'Wood Grain Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
      steps.appendChild(s3);
    }

  } else if (cat === 'dining') {
    const variant = cfg.variants.find(v => v.id === s.variant);
    if (!variant.seatOptions.includes(s.seats)) s.seats = variant.seatOptions[variant.seatOptions.length - 1];

    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant, (v) => assetUrl(cfg.assetDir, v.file),
      (id) => { s.variant = id; const nv = cfg.variants.find(x=>x.id===id); s.seats = Math.max(...nv.seatOptions); refreshAll(); });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Seating Count');
    const chipOpts = variant.seatOptions.map((n) => ({ id: n, name: `${n}-Seater` }));
    buildChipRow(s2, chipOpts, s.seats, (id) => { s.seats = id; refreshAll(); }, () => 'Add / remove chairs');
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Table Finish');
    buildSwatchRow(s3, 'wood', s.woodColor, (id) => { s.woodColor = id; refreshAll(); });
    steps.appendChild(s3);

    const s4 = stepBlock(4, 'Chair Upholstery');
    buildSwatchRow(s4, 'fabric', s.fabricColor, (id) => { s.fabricColor = id; refreshAll(); });
    buildTextureToggle(s4, 'Wood Grain + Fabric Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
    steps.appendChild(s4);

  } else if (cat === 'accent') {
    const s1 = stepBlock(1, 'Select Style');
    buildChipRow(s1, cfg.variants, s.variant, (id) => { s.variant = id; refreshAll(); }, (opt) => opt.desc);
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Size');
    buildChipRow(s2, cfg.sizes, s.size, (id) => { s.size = id; refreshAll(); }, (opt) => opt.dims);
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Top Finish');
    buildSwatchRow(s3, 'wood', s.woodColor, (id) => { s.woodColor = id; refreshAll(); });
    buildTextureToggle(s3, 'Wood Grain Texture', s.textured, (val) => { s.textured = val; refreshAll(); });
    steps.appendChild(s3);

    const s4 = stepBlock(4, 'Leg Finish');
    buildSwatchRow(s4, 'metal', s.metalColor, (id) => { s.metalColor = id; refreshAll(); });
    steps.appendChild(s4);
  }

  updatePriceUI();
  refreshThumbButtons();
  requestAnimationFrame(() => steps.classList.remove('fading'));
}

function refreshAll() {
  renderPanel();
  refreshScene();
  buildConfigDots();
}

// ============================================================================
// Nav tabs
// ============================================================================
function buildNavTabs() {
  const nav = document.getElementById('navtabs');
  nav.innerHTML = '';
  CATEGORY_ORDER.forEach((key) => {
    const btn = el('button', 'navtab' + (key === state.category ? ' active' : ''), CATALOG[key].navLabel);
    btn.addEventListener('click', () => {
      state.category = key;
      document.querySelectorAll('.navtab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refreshAll();
    });
    nav.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// Prev / next arrows cycle through the primary config axis for the category
// ---------------------------------------------------------------------------
function primaryAxisOptions() {
  const cat = state.category;
  const cfg = CATALOG[cat];
  if (cat === 'sofa') {
    const s = state.perCategory.sofa;
    const available = cfg.layouts.filter((l) => !(l.excludeVariants || []).includes(s.variant));
    return { key: 'layout', options: available.map(l => l.id) };
  }
  if (cat === 'bed') return { key: 'size', options: cfg.sizes.map(z => z.id) };
  if (cat === 'wardrobe') return { key: 'width', options: cfg.widths.map(w => w.id) };
  if (cat === 'dining') return { key: 'variant', options: cfg.variants.map(v => v.id) };
  if (cat === 'accent') return { key: 'size', options: cfg.sizes.map(z => z.id) };
}

function buildConfigDots() {
  const { options } = primaryAxisOptions();
  const s = state.perCategory[state.category];
  const { key } = primaryAxisOptions();
  const dotsWrap = document.getElementById('viewerDots');
  dotsWrap.innerHTML = '';
  options.forEach((id) => {
    const dot = el('div', 'viewer-dot' + (s[key] === id ? ' active' : ''));
    dotsWrap.appendChild(dot);
  });
}

function stepAxis(dir) {
  const { key, options } = primaryAxisOptions();
  const s = state.perCategory[state.category];
  let idx = options.indexOf(s[key]);
  idx = (idx + dir + options.length) % options.length;
  s[key] = options[idx];
  refreshAll();
}

document.getElementById('prevConfig').addEventListener('click', () => stepAxis(-1));
document.getElementById('nextConfig').addEventListener('click', () => stepAxis(1));

const toggleDimsBtn = document.getElementById('toggleDims');
toggleDimsBtn.addEventListener('click', () => {
  showDims = !showDims;
  toggleDimsBtn.classList.toggle('active', showDims);
  toggleDimsBtn.setAttribute('aria-pressed', String(showDims));
  if (!showDims) dimSvg.style.opacity = 0;
});

// ============================================================================
// Add to cart (dummy)
// ============================================================================
document.getElementById('addToCart').addEventListener('click', () => {
  const toast = document.getElementById('toast');
  const cfg = CATALOG[state.category];
  document.getElementById('toast-text').textContent = `Added "${cfg.heroName}" to cart (demo)`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
});

// ============================================================================
// Boot
// ============================================================================
buildNavTabs();
refreshAll();
