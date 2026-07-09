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
