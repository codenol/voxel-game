import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Game canvas was not found.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x162028);
scene.fog = new THREE.Fog(0x162028, 18, 48);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(7, 6, 9);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ambientLight = new THREE.HemisphereLight(0xb9d7ff, 0x26321f, 1.15);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff2c2, 3);
sun.position.set(7, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const groundGeometry = new THREE.BoxGeometry(18, 0.5, 18);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x3d5a36,
  roughness: 0.9
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x89c765, roughness: 0.72 }),
  new THREE.MeshStandardMaterial({ color: 0xc8b06c, roughness: 0.84 }),
  new THREE.MeshStandardMaterial({ color: 0x678eb8, roughness: 0.7 })
];

const blocks = new THREE.Group();

const blockLayout: Array<[x: number, y: number, z: number, material: number]> = [
  [-1, 0, 0, 0],
  [0, 0, 0, 0],
  [1, 0, 0, 0],
  [0, 1, 0, 1],
  [0, 2, 0, 2],
  [-1, 0, 1, 1],
  [1, 0, -1, 1]
];

for (const [x, y, z, material] of blockLayout) {
  const block = new THREE.Mesh(cubeGeometry, cubeMaterials[material]);
  block.position.set(x, y + 0.45, z);
  block.castShadow = true;
  block.receiveShadow = true;
  blocks.add(block);
}

scene.add(blocks);

const grid = new THREE.GridHelper(18, 18, 0x8da17f, 0x526247);
grid.position.y = -0.02;
scene.add(grid);

const resize = () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
};

window.addEventListener('resize', resize);
resize();

let previousTime = 0;

const animate = (time: number) => {
  const delta = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;

  blocks.rotation.y += delta * 0.35;
  renderer.render(scene, camera);
  window.requestAnimationFrame(animate);
};

window.requestAnimationFrame(animate);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
