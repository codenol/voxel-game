import * as THREE from 'three';
import { GameLoop } from './runtime/gameLoop';
import { createGameState, updateGame } from './runtime/gameState';
import type {
  Enemy,
  GameCommand,
  GameState,
  Pickup,
  Projectile
} from './runtime/types';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const hud = document.querySelector<HTMLElement>('#hud');
const primaryAction = document.querySelector<HTMLButtonElement>('#primary-action');
const pauseAction = document.querySelector<HTMLButtonElement>('#pause-action');
const healthLabel = document.querySelector<HTMLElement>('#health-label');
const waveLabel = document.querySelector<HTMLElement>('#wave-label');
const enemiesLabel = document.querySelector<HTMLElement>('#enemies-label');
const statusLabel = document.querySelector<HTMLElement>('#status-label');
const summaryLabel = document.querySelector<HTMLElement>('#summary-label');

if (!canvas || !hud || !primaryAction || !pauseAction) {
  throw new Error('Game UI was not found.');
}

const gameHud = hud;
const primaryButton = primaryAction;
const pauseButton = pauseAction;
const state = createGameState();
const commandQueue: GameCommand[] = [];

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

const grid = new THREE.GridHelper(18, 18, 0x8da17f, 0x526247);
grid.position.y = -0.02;
scene.add(grid);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshStandardMaterial({
  color: 0x75c7ff,
  roughness: 0.62
});
const enemyMaterial = new THREE.MeshStandardMaterial({
  color: 0xe05b5b,
  roughness: 0.72
});
const projectileMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff08a,
  emissive: 0x665500,
  roughness: 0.45
});
const pickupMaterial = new THREE.MeshStandardMaterial({
  color: 0x58d68d,
  emissive: 0x0d4f28,
  roughness: 0.5
});
const towerMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x89c765, roughness: 0.72 }),
  new THREE.MeshStandardMaterial({ color: 0xc8b06c, roughness: 0.84 }),
  new THREE.MeshStandardMaterial({ color: 0x678eb8, roughness: 0.7 })
] as const;

const scenery = new THREE.Group();
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
  const block = new THREE.Mesh(cubeGeometry, towerMaterials[material] ?? towerMaterials[0]);
  block.position.set(x, y + 0.45, z);
  block.castShadow = true;
  block.receiveShadow = true;
  scenery.add(block);
}
scene.add(scenery);

const playerMesh = new THREE.Mesh(cubeGeometry, playerMaterial);
playerMesh.scale.set(0.75, 0.75, 0.75);
playerMesh.castShadow = true;
playerMesh.receiveShadow = true;
scene.add(playerMesh);

const enemyMeshes = new Map<string, THREE.Mesh>();
const projectileMeshes = new Map<string, THREE.Mesh>();
const pickupMeshes = new Map<string, THREE.Mesh>();

const resize = () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
};

const queueCommand = (command: GameCommand) => {
  commandQueue.push(command);
};

primaryButton.addEventListener('click', () => {
  if (state.status === 'menu') {
    queueCommand({ type: 'startRun' });
    return;
  }

  if (state.status === 'gameOver') {
    queueCommand({ type: 'restartRun' });
    return;
  }

  queueCommand({ type: 'firePrimary', direction: { x: 1, z: 0 } });
});

pauseButton.addEventListener('click', () => {
  queueCommand({ type: state.status === 'paused' ? 'resume' : 'pause' });
});

window.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault();
    queueCommand({ type: 'firePrimary', direction: { x: 1, z: 0 } });
  }

  if (event.key.toLowerCase() === 'p') {
    queueCommand({ type: state.status === 'paused' ? 'resume' : 'pause' });
  }

  if (event.key.toLowerCase() === 'r') {
    queueCommand({ type: 'restartRun' });
  }
});

window.addEventListener('resize', resize);
resize();

const loop = new GameLoop({
  update: (deltaSeconds) => {
    const commands = commandQueue.splice(0);
    updateGame(state, deltaSeconds, commands);
  },
  render: () => {
    renderGame(state);
  }
});

renderGame(state);
loop.start();

function renderGame(gameState: GameState) {
  scenery.rotation.y += gameState.status === 'paused' ? 0 : 0.004;
  playerMesh.position.set(
    gameState.player.position.x,
    0.38,
    gameState.player.position.z
  );
  playerMesh.visible = gameState.player.active;

  syncMeshes(gameState.enemies, enemyMeshes, createEnemyMesh, updateEnemyMesh);
  syncMeshes(
    gameState.projectiles,
    projectileMeshes,
    createProjectileMesh,
    updateProjectileMesh
  );
  syncMeshes(gameState.pickups, pickupMeshes, createPickupMesh, updatePickupMesh);
  updateHud(gameState);
  renderer.render(scene, camera);
}

function syncMeshes<T extends Enemy | Projectile | Pickup>(
  entities: T[],
  meshes: Map<string, THREE.Mesh>,
  createMesh: (entity: T) => THREE.Mesh,
  updateMesh: (entity: T, mesh: THREE.Mesh) => void
) {
  const activeIds = new Set(entities.map((entity) => entity.id));

  for (const [id, mesh] of meshes) {
    if (!activeIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      meshes.delete(id);
    }
  }

  for (const entity of entities) {
    let mesh = meshes.get(entity.id);
    if (!mesh) {
      mesh = createMesh(entity);
      meshes.set(entity.id, mesh);
      scene.add(mesh);
    }

    updateMesh(entity, mesh);
  }
}

function createEnemyMesh() {
  const mesh = new THREE.Mesh(cubeGeometry.clone(), enemyMaterial);
  mesh.scale.set(0.72, 0.72, 0.72);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function updateEnemyMesh(enemy: Enemy, mesh: THREE.Mesh) {
  mesh.position.set(enemy.position.x, 0.36, enemy.position.z);
  mesh.rotation.y += 0.025;
}

function createProjectileMesh() {
  const mesh = new THREE.Mesh(cubeGeometry.clone(), projectileMaterial);
  mesh.scale.set(0.22, 0.22, 0.22);
  mesh.castShadow = true;
  return mesh;
}

function updateProjectileMesh(projectile: Projectile, mesh: THREE.Mesh) {
  mesh.position.set(projectile.position.x, 0.5, projectile.position.z);
}

function createPickupMesh() {
  const mesh = new THREE.Mesh(cubeGeometry.clone(), pickupMaterial);
  mesh.scale.set(0.35, 0.35, 0.35);
  mesh.castShadow = true;
  return mesh;
}

function updatePickupMesh(pickup: Pickup, mesh: THREE.Mesh) {
  mesh.position.set(pickup.position.x, 0.4, pickup.position.z);
  mesh.rotation.y += 0.04;
}

function updateHud(gameState: GameState) {
  gameHud.dataset.status = gameState.status;
  primaryButton.textContent = primaryActionLabel(gameState);
  primaryButton.disabled =
    gameState.status !== 'menu' &&
    gameState.status !== 'playing' &&
    gameState.status !== 'gameOver';
  pauseButton.textContent = gameState.status === 'paused' ? 'Resume' : 'Pause';
  pauseButton.disabled =
    gameState.status !== 'playing' &&
    gameState.status !== 'waveCountdown' &&
    gameState.status !== 'paused';

  setText(healthLabel, `Health ${Math.ceil(gameState.player.health)}`);
  setText(waveLabel, `Wave ${gameState.wave.index || '-'}`);
  setText(enemiesLabel, `Enemies ${gameState.wave.enemiesRemaining}`);
  setText(statusLabel, statusText(gameState));
  setText(
    summaryLabel,
    `Kills ${gameState.runSummary.kills} | Pickups ${gameState.runSummary.pickupsCollected}`
  );
}

function primaryActionLabel(gameState: GameState) {
  switch (gameState.status) {
    case 'menu':
      return 'Start';
    case 'gameOver':
      return 'Restart';
    default:
      return 'Fire';
  }
}

function statusText(gameState: GameState) {
  switch (gameState.status) {
    case 'menu':
      return 'Ready';
    case 'waveCountdown':
      return `Wave starts in ${Math.ceil(gameState.wave.countdown)}`;
    case 'playing':
      return 'Playing';
    case 'paused':
      return 'Paused';
    case 'gameOver':
      return `Game over after ${Math.floor(gameState.runSummary.elapsed)}s`;
    case 'loading':
      return 'Loading';
  }
}

function setText(element: HTMLElement | null, text: string) {
  if (element) {
    element.textContent = text;
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
