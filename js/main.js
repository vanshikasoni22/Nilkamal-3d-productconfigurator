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

// No floor shadow-catcher and no contact-shadow blob — flat, clean studio
// product shot with no shadow underneath the model.

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
// No automatic/forced rotation — the model only turns when the user drags.
// OrbitControls (below) handles all rotation/zoom input directly.
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
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
function buildAccentTable({ shape = 'round', woodHex = '#b98a53', metalHex = '#2b2b2b', scale = 1 } = {}) {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: woodHex, roughness: 0.42, metalness: 0.02 });
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

function buildOttoman({ hex = '#575c62', scale = 1 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.0 });
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
// App state
// ============================================================================
const state = {
  category: 'sofa',
  perCategory: {
    sofa: { variant: 'boston', layout: 'seat2', color: 'charcoal', modules: {} },
    bed: { variant: 'dream', size: 'queen', color: 'charcoal' },
    wardrobe: { variant: 'classic', finish: 'walnut', width: 'standard' },
    dining: { variant: 'ovalis', seats: 6, woodColor: 'walnut', fabricColor: 'charcoal' },
    accent: { variant: 'round', size: 'small', woodColor: 'oak', metalColor: 'black' },
  },
};

const thumbCache = new Map(); // key: url -> dataURL

let sceneToken = 0; // guards against race conditions when rapidly switching
// ============================================================================
// Material tinting helper
// ============================================================================
function tintObject(object, materialNames, hex) {
  if (!hex) return;
  const color = new THREE.Color(hex);
  object.traverse((n) => {
    if (n.isMesh && n.material && materialNames.includes(n.material.name)) {
      n.material.color.copy(color);
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
  tintObject(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.color)?.hex);
  productRoot.clear();
  productRoot.add(obj);

  moduleRoot.clear();
  const box = new THREE.Box3().setFromObject(obj);
  if (s.modules.sidetable) {
    const t = buildAccentTable({ shape: 'round', woodHex: '#b98a53', metalHex: '#2b2b2b', scale: 1 });
    t.position.set(box.max.x + 0.34, 0, 0);
    moduleRoot.add(t);
  }
  if (s.modules.ottoman) {
    const o = buildOttoman({ hex: SWATCHES.fabric.find(sw => sw.id === s.color)?.hex });
    o.position.set(box.min.x - 0.32, 0, 0.15);
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
  tintObject(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.color)?.hex);
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
  const finishHex = SWATCHES.wood.find(sw => sw.id === s.finish)?.hex;
  tintObject(obj, cfg.materialTargets.wood, finishHex);
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
  tintObject(obj, cfg.materialTargets.wood, SWATCHES.wood.find(sw => sw.id === s.woodColor)?.hex);
  tintObject(obj, cfg.materialTargets.fabric, SWATCHES.fabric.find(sw => sw.id === s.fabricColor)?.hex);
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
  const obj = buildAccentTable({ shape: s.variant === 'square' ? 'square' : 'round', woodHex, metalHex, scale: 1 });
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
    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant,
      (v) => assetUrl(cfg.assetDir, cfg.layouts.find(l => l.id === s.layout).files[v.id]),
      (id) => { s.variant = id; refreshAll(); });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Layout');
    buildChipRow(s2, cfg.layouts, s.layout, (id) => { s.layout = id; refreshAll(); },
      (opt) => opt.dims);
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Fabric & Color');
    buildSwatchRow(s3, cfg.swatchGroup, s.color, (id) => { s.color = id; refreshAll(); });
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
    steps.appendChild(s3);

  } else if (cat === 'wardrobe') {
    const s1 = stepBlock(1, 'Select Variation');
    buildThumbRow(s1, cfg.variants, s.variant, (v) => assetUrl(cfg.assetDir, v.file),
      (id) => { s.variant = id; refreshAll(); });
    steps.appendChild(s1);

    const s2 = stepBlock(2, 'Select Width');
    buildChipRow(s2, cfg.widths, s.width, (id) => { s.width = id; refreshAll(); }, (opt) => opt.dims);
    steps.appendChild(s2);

    const s3 = stepBlock(3, 'Finish & Color');
    buildSwatchRow(s3, cfg.swatchGroup, s.finish, (id) => { s.finish = id; refreshAll(); });
    steps.appendChild(s3);

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
  if (cat === 'sofa') return { key: 'layout', options: cfg.layouts.map(l => l.id) };
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
