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
