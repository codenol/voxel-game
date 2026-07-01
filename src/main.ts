import * as THREE from 'three';
import { GameLoop } from './runtime/gameLoop';
import { createGameState, updateGame } from './runtime/gameState';
import type {
  Enemy,
  GameCommand,
  GameEvent,
  GameState,
  Pickup,
  Projectile,
  Vector2
} from './runtime/types';
import type { MapProp, MapRect } from './runtime/districtMap';
import './styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const hud = document.querySelector<HTMLElement>('#hud');
const primaryAction = document.querySelector<HTMLButtonElement>('#primary-action');
const pauseAction = document.querySelector<HTMLButtonElement>('#pause-action');
const healthLabel = document.querySelector<HTMLElement>('#health-label');
const weaponLabel = document.querySelector<HTMLElement>('#weapon-label');
const ammoLabel = document.querySelector<HTMLElement>('#ammo-label');
const waveLabel = document.querySelector<HTMLElement>('#wave-label');
const countdownLabel = document.querySelector<HTMLElement>('#countdown-label');
const enemiesLabel = document.querySelector<HTMLElement>('#enemies-label');
const scoreLabel = document.querySelector<HTMLElement>('#score-label');
const killsLabel = document.querySelector<HTMLElement>('#kills-label');
const statusLabel = document.querySelector<HTMLElement>('#status-label');
const summaryLabel = document.querySelector<HTMLElement>('#summary-label');
const menuPanel = document.querySelector<HTMLElement>('#menu-panel');
const menuKicker = document.querySelector<HTMLElement>('#menu-kicker');
const menuTitle = document.querySelector<HTMLElement>('#menu-title');
const menuCopy = document.querySelector<HTMLElement>('#menu-copy');
const runStats = document.querySelector<HTMLElement>('#run-stats');
const menuPrimaryAction = document.querySelector<HTMLButtonElement>(
  '#menu-primary-action'
);
const menuSecondaryAction = document.querySelector<HTMLButtonElement>(
  '#menu-secondary-action'
);
const touchControls = document.querySelector<HTMLElement>('#touch-controls');
const moveStickThumb = document.querySelector<HTMLElement>('#move-stick-thumb');
const aimStickThumb = document.querySelector<HTMLElement>('#aim-stick-thumb');

if (
  !canvas ||
  !hud ||
  !primaryAction ||
  !pauseAction ||
  !menuPanel ||
  !menuPrimaryAction ||
  !menuSecondaryAction
) {
  throw new Error('Game UI was not found.');
}

const gameHud = hud;
const primaryButton = primaryAction;
const pauseButton = pauseAction;
const menuOverlay = menuPanel;
const menuPrimaryButton = menuPrimaryAction;
const menuSecondaryButton = menuSecondaryAction;
const touchControlsLayer = touchControls;
const moveThumb = moveStickThumb;
const aimThumb = aimStickThumb;
const state = createGameState();
const commandQueue: GameCommand[] = [];
const arenaSize = 18;
const halfArenaSize = arenaSize / 2;
const defaultFacing: Vector2 = { x: 1, z: 0 };
const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const smoothedCameraTarget = new THREE.Vector3(0, 0.8, 0);
const smoothedCameraPosition = new THREE.Vector3(7, 7.5, 8);
const fixedCameraOffset = new THREE.Vector3(7, 7.5, 8);
let aimDirection: Vector2 = { ...defaultFacing };
let keyboardMovementDirection: Vector2 | null = null;
let touchMovementDirection: Vector2 | null = null;
let touchAimDirection: Vector2 | null = null;
let mouseAimActive = false;
let pointerFireActive = false;
let touchFireActive = false;
let renderClock = 0;
let playerDamageFlashUntil = 0;
let pickupPulseUntil = 0;
const enemySpawnFlashUntil = new Map<string, number>();
const enemyHitFlashUntil = new Map<string, number>();
const enemyAttackFlashUntil = new Map<string, number>();
const projectileSpawnFlashUntil = new Map<string, number>();
const pickupCollectBursts: THREE.Object3D[] = [];
const pressedKeys = new Set<string>();
const pointerNdc = new THREE.Vector2();
const aimRaycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimIntersection = new THREE.Vector3();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172226);
scene.fog = new THREE.Fog(0x172226, 22, 48);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
camera.position.copy(smoothedCameraPosition);
camera.lookAt(smoothedCameraTarget);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const ambientLight = new THREE.HemisphereLight(0xb9d7ff, 0x344437, 1.25);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff1cf, 3.2);
sun.position.set(-6, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0x8fc7ff, 0.75);
fillLight.position.set(6, 5, -8);
scene.add(fillLight);

const groundGeometry = new THREE.BoxGeometry(arenaSize, 0.5, arenaSize);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x405f3a,
  roughness: 0.9
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(arenaSize, arenaSize, 0x9eb08b, 0x526247);
grid.position.y = -0.018;
scene.add(grid);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshStandardMaterial({
  color: 0x75c7ff,
  emissive: 0x0d2238,
  roughness: 0.62
});
const playerDamageMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff2b3,
  emissive: 0xff3b25,
  roughness: 0.5
});
const enemyMaterial = new THREE.MeshStandardMaterial({
  color: 0xe05b5b,
  emissive: 0x2a0707,
  roughness: 0.72
});
const enemyShooterMaterial = new THREE.MeshStandardMaterial({
  color: 0xb477ff,
  emissive: 0x211039,
  roughness: 0.66
});
const enemyTankMaterial = new THREE.MeshStandardMaterial({
  color: 0xf08a4b,
  emissive: 0x351307,
  roughness: 0.8
});
const enemyFlankerMaterial = new THREE.MeshStandardMaterial({
  color: 0x4ee0b0,
  emissive: 0x08332a,
  roughness: 0.58
});
const enemyHitMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xff5b2e,
  roughness: 0.5
});
const enemyAttackMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff2a8,
  emissive: 0xff6f00,
  roughness: 0.42
});
const projectileMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff08a,
  emissive: 0x665500,
  roughness: 0.45
});
const enemyProjectileMaterial = new THREE.MeshStandardMaterial({
  color: 0xff73a6,
  emissive: 0x7a1032,
  roughness: 0.42
});
const pickupMaterial = new THREE.MeshStandardMaterial({
  color: 0x58d68d,
  emissive: 0x0d4f28,
  roughness: 0.5
});
const weaponPickupMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd166,
  emissive: 0x6f4100,
  roughness: 0.46
});
const burstMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff0a6,
  emissive: 0xffb400,
  transparent: true,
  opacity: 0.82,
  roughness: 0.5
});

const scenery = createScenery();
scene.add(scenery);

const playerMesh = createPlayerMesh();
scene.add(playerMesh);

const enemyMeshes = new Map<string, THREE.Group>();
const projectileMeshes = new Map<string, THREE.Group>();
const pickupMeshes = new Map<string, THREE.Group>();

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
  handlePrimaryAction();
});

pauseButton.addEventListener('click', () => {
  handlePauseAction();
});

menuPrimaryButton.addEventListener('click', () => {
  handleMenuPrimaryAction();
});

menuSecondaryButton.addEventListener('click', () => {
  handlePauseAction();
});

window.addEventListener('keydown', (event) => {
  if (isMovementKey(event.key)) {
    pressedKeys.add(event.key.toLowerCase());
    event.preventDefault();
  }

  if (event.key === ' ') {
    event.preventDefault();
    if (state.status === 'menu' || state.status === 'gameOver') {
      handlePrimaryAction();
    } else {
      queueCommand({ type: 'firePrimary', direction: aimDirection });
    }
  }

  if (event.key.toLowerCase() === 'p') {
    handlePauseAction();
  }

  if (event.key.toLowerCase() === 'r') {
    queueCommand({ type: 'restartRun' });
  }
});

window.addEventListener('keyup', (event) => {
  if (isMovementKey(event.key)) {
    pressedKeys.delete(event.key.toLowerCase());
    event.preventDefault();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') {
    updateAimFromPointer(event);
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'mouse' || event.button !== 0) {
    return;
  }

  updateAimFromPointer(event);
  pointerFireActive = true;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'mouse' && event.button === 0) {
    pointerFireActive = false;
    releasePointerCapture(canvas, event.pointerId);
  }
});

canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerType === 'mouse') {
    pointerFireActive = false;
    releasePointerCapture(canvas, event.pointerId);
  }
});

bindTouchStick('move', touchControlsLayer, moveThumb, (direction) => {
  touchMovementDirection = direction;
});
bindTouchStick('aim', touchControlsLayer, aimThumb, (direction) => {
  touchAimDirection = direction;
  touchFireActive = Boolean(direction);
  if (direction) {
    aimDirection = direction;
  }
});

window.addEventListener('resize', resize);
resize();

const loop = new GameLoop({
  update: (deltaSeconds) => {
    const commands = commandQueue.splice(0);
    const movementDirection = readMovementDirection();
    if (movementDirection) {
      commands.push({ type: 'movePlayer', direction: movementDirection });
    }
    if (pointerFireActive || touchFireActive) {
      commands.push({ type: 'firePrimary', direction: aimDirection });
    }

    updateGame(state, deltaSeconds, commands);
    processRenderEvents(state.events);
  },
  render: (alpha) => {
    renderGame(state, alpha);
  }
});

renderGame(state);
loop.start();

function renderGame(gameState: GameState, alpha = 0) {
  renderClock += 1 / 60;
  updateAutoAimFallback(gameState);
  playerMesh.position.set(
    gameState.player.position.x,
    0.38,
    gameState.player.position.z
  );
  playerMesh.rotation.y = Math.atan2(aimDirection.x, aimDirection.z);
  playerMesh.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.material =
        renderClock < playerDamageFlashUntil ? playerDamageMaterial : playerMaterial;
    }
  });
  playerMesh.visible = gameState.player.active;

  syncMeshes(gameState.enemies, enemyMeshes, createEnemyMesh, updateEnemyMesh);
  syncMeshes(
    gameState.projectiles,
    projectileMeshes,
    createProjectileMesh,
    updateProjectileMesh
  );
  syncMeshes(gameState.pickups, pickupMeshes, createPickupMesh, updatePickupMesh);
  updatePickupBursts();
  updateCamera(gameState, alpha);
  updateHud(gameState);
  renderer.render(scene, camera);
}

function syncMeshes<T extends Enemy | Projectile | Pickup, TObject extends THREE.Object3D>(
  entities: T[],
  meshes: Map<string, TObject>,
  createMesh: (entity: T) => TObject,
  updateMesh: (entity: T, mesh: TObject) => void
) {
  const activeIds = new Set(entities.map((entity) => entity.id));

  for (const [id, mesh] of meshes) {
    if (!activeIds.has(id)) {
      scene.remove(mesh);
      disposeObject(mesh);
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

function createEnemyMesh(enemy: Enemy) {
  const group = new THREE.Group();
  const material = enemyMaterialFor(enemy);
  const body = new THREE.Mesh(cubeGeometry.clone(), material);
  body.scale.copy(enemyBodyScale(enemy));
  body.castShadow = true;
  body.receiveShadow = true;

  const head = new THREE.Mesh(cubeGeometry.clone(), material);
  head.position.set(0, 0.54, -0.08);
  head.scale.set(
    enemy.archetype === 'tank' ? 0.5 : 0.42,
    enemy.archetype === 'flanker' ? 0.2 : 0.28,
    enemy.archetype === 'shooter' ? 0.56 : 0.42
  );
  head.castShadow = true;
  head.receiveShadow = true;

  group.userData.baseMaterial = material;
  group.add(body, head);

  if (enemy.archetype === 'shooter') {
    const barrel = new THREE.Mesh(cubeGeometry.clone(), material);
    barrel.position.set(0, 0.35, 0.52);
    barrel.scale.set(0.18, 0.16, 0.56);
    barrel.castShadow = true;
    group.add(barrel);
  }

  if (enemy.archetype === 'tank') {
    const armor = new THREE.Mesh(cubeGeometry.clone(), material);
    armor.position.set(0, 0.12, 0);
    armor.scale.set(0.96, 0.24, 0.96);
    armor.castShadow = true;
    armor.receiveShadow = true;
    group.add(armor);
  }

  if (enemy.archetype === 'flanker') {
    const fin = new THREE.Mesh(cubeGeometry.clone(), material);
    fin.position.set(0, 0.42, -0.42);
    fin.scale.set(0.18, 0.3, 0.45);
    fin.castShadow = true;
    group.add(fin);
  }

  return group;
}

function updateEnemyMesh(enemy: Enemy, mesh: THREE.Group) {
  const hitUntil = enemyHitFlashUntil.get(enemy.id) ?? 0;
  const spawnUntil = enemySpawnFlashUntil.get(enemy.id) ?? 0;
  const attackUntil = enemyAttackFlashUntil.get(enemy.id) ?? 0;
  const baseMaterial = mesh.userData.baseMaterial as THREE.MeshStandardMaterial;
  mesh.position.set(enemy.position.x, 0.36, enemy.position.z);
  if (enemy.pathDirection) {
    mesh.rotation.y = Math.atan2(enemy.pathDirection.x, enemy.pathDirection.z);
  } else {
    mesh.rotation.y += 0.025;
  }

  const spawnScale =
    renderClock < spawnUntil ? 1 - (spawnUntil - renderClock) / 0.32 : 1;
  const hitScale = renderClock < hitUntil ? 1.16 : 1;
  const attackScale = renderClock < attackUntil ? 1.12 : 1;
  mesh.scale.setScalar(Math.max(0.2, spawnScale) * hitScale * attackScale);
  mesh.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.material =
        renderClock < hitUntil
          ? enemyHitMaterial
          : renderClock < attackUntil
            ? enemyAttackMaterial
            : baseMaterial;
    }
  });
}

function enemyMaterialFor(enemy: Enemy) {
  switch (enemy.archetype) {
    case 'shooter':
      return enemyShooterMaterial;
    case 'tank':
      return enemyTankMaterial;
    case 'flanker':
      return enemyFlankerMaterial;
    case 'rusher':
      return enemyMaterial;
  }
}

function enemyBodyScale(enemy: Enemy) {
  switch (enemy.archetype) {
    case 'shooter':
      return new THREE.Vector3(0.62, 0.68, 0.84);
    case 'tank':
      return new THREE.Vector3(1, 0.86, 1);
    case 'flanker':
      return new THREE.Vector3(0.52, 0.58, 0.72);
    case 'rusher':
      return new THREE.Vector3(0.72, 0.72, 0.72);
  }
}

function createProjectileMesh() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(cubeGeometry.clone(), projectileMaterial);
  core.scale.set(0.22, 0.22, 0.22);
  core.castShadow = true;
  const glow = new THREE.PointLight(0xffe66b, 0.9, 3);
  group.add(core, glow);
  return group;
}

function updateProjectileMesh(projectile: Projectile, mesh: THREE.Group) {
  const spawnUntil = projectileSpawnFlashUntil.get(projectile.id) ?? 0;
  mesh.position.set(projectile.position.x, 0.5, projectile.position.z);
  mesh.rotation.y = Math.atan2(projectile.velocity.x, projectile.velocity.z);
  mesh.scale.setScalar(renderClock < spawnUntil ? 1.5 : 1);
  mesh.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.material =
        projectile.ownerKind === 'enemy'
          ? enemyProjectileMaterial
          : projectileMaterial;
    }
    if (child instanceof THREE.PointLight) {
      child.color.set(projectile.ownerKind === 'enemy' ? 0xff73a6 : 0xffe66b);
    }
  });
}

function createPickupMesh() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(cubeGeometry.clone(), pickupMaterial);
  core.scale.set(0.35, 0.35, 0.35);
  core.castShadow = true;
  const cap = new THREE.Mesh(cubeGeometry.clone(), pickupMaterial);
  cap.position.y = 0.24;
  cap.scale.set(0.46, 0.1, 0.46);
  cap.castShadow = true;
  group.add(core, cap);
  return group;
}

function updatePickupMesh(pickup: Pickup, mesh: THREE.Group) {
  const pulse = renderClock < pickupPulseUntil ? 1.3 : 1;
  const material = pickup.kind === 'weapon' ? weaponPickupMaterial : pickupMaterial;
  mesh.position.set(
    pickup.position.x,
    0.4 + Math.sin(renderClock * 5) * 0.06,
    pickup.position.z
  );
  mesh.rotation.y += 0.04;
  mesh.scale.setScalar(pulse);
  mesh.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
    }
  });
}

function createScenery() {
  const group = new THREE.Group();
  const map = state.map;
  const plazaMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f665c,
    roughness: 0.88
  });
  const streetMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e4146,
    roughness: 0.9
  });
  const alleyMaterial = new THREE.MeshStandardMaterial({
    color: 0x28363b,
    roughness: 0.92
  });

  group.add(createMapSurface(map.plaza, 0.012, plazaMaterial));
  for (const street of map.streets) {
    group.add(createMapSurface(street, 0.018, streetMaterial));
  }
  for (const alley of map.alleys) {
    group.add(createMapSurface(alley, 0.024, alleyMaterial));
  }

  for (const prop of [...map.cover, ...map.buildings, ...map.landmarks]) {
    group.add(createMapProp(prop));
  }

  const borderMaterial = new THREE.MeshStandardMaterial({
    color: 0x26343a,
    roughness: 0.88
  });
  const borders: Array<[x: number, z: number, width: number, depth: number]> = [
    [0, -halfArenaSize - 0.15, arenaSize + 0.4, 0.3],
    [0, halfArenaSize + 0.15, arenaSize + 0.4, 0.3],
    [-halfArenaSize - 0.15, 0, 0.3, arenaSize + 0.4],
    [halfArenaSize + 0.15, 0, 0.3, arenaSize + 0.4]
  ];

  for (const [x, z, width, depth] of borders) {
    const border = new THREE.Mesh(cubeGeometry.clone(), borderMaterial);
    border.position.set(x, 0.18, z);
    border.scale.set(width, 0.36, depth);
    border.castShadow = true;
    border.receiveShadow = true;
    group.add(border);
  }

  return group;
}

function createMapSurface(
  rect: MapRect,
  y: number,
  material: THREE.MeshStandardMaterial
) {
  const surface = new THREE.Mesh(cubeGeometry.clone(), material);
  surface.position.set(rect.position.x, y - 0.025, rect.position.z);
  surface.scale.set(rect.width, 0.05, rect.depth);
  surface.receiveShadow = true;
  return surface;
}

function createMapProp(prop: MapProp) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: prop.color,
    emissive: prop.emissive ?? 0x000000,
    emissiveIntensity: prop.emissive ? 0.55 : 0,
    roughness: prop.kind === 'building' ? 0.78 : 0.68
  });
  const body = new THREE.Mesh(cubeGeometry.clone(), material);
  body.position.set(prop.position.x, prop.height / 2 - 0.05, prop.position.z);
  body.scale.set(prop.width, prop.height, prop.depth);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (prop.kind === 'building') {
    const roof = new THREE.Mesh(
      cubeGeometry.clone(),
      new THREE.MeshStandardMaterial({
        color: 0x98a66f,
        roughness: 0.84
      })
    );
    roof.position.set(prop.position.x, prop.height + 0.08, prop.position.z);
    roof.scale.set(prop.width + 0.18, 0.16, prop.depth + 0.18);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }

  if (prop.kind === 'landmark') {
    const light = new THREE.PointLight(prop.emissive ?? 0x7dfcff, 1.35, 4.5);
    light.position.set(prop.position.x, prop.height + 0.45, prop.position.z);
    group.add(light);

    const sign = new THREE.Mesh(
      cubeGeometry.clone(),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: prop.emissive ?? 0x7dfcff,
        emissiveIntensity: 1.2,
        roughness: 0.38
      })
    );
    sign.position.set(prop.position.x, prop.height * 0.68, prop.position.z - 0.37);
    sign.scale.set(prop.width * 0.9, 0.16, 0.08);
    group.add(sign);
  }

  return group;
}

function createPlayerMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(cubeGeometry.clone(), playerMaterial);
  body.scale.set(0.75, 0.7, 0.75);
  body.castShadow = true;
  body.receiveShadow = true;

  const visor = new THREE.Mesh(cubeGeometry.clone(), playerMaterial);
  visor.position.set(0, 0.38, 0.18);
  visor.scale.set(0.46, 0.18, 0.24);
  visor.castShadow = true;
  visor.receiveShadow = true;

  group.add(body, visor);
  return group;
}

function processRenderEvents(events: GameEvent[]) {
  for (const event of events) {
    switch (event.type) {
      case 'projectileFired': {
        projectileSpawnFlashUntil.set(event.projectileId, renderClock + 0.12);
        const projectile = state.projectiles.find(
          (candidate) => candidate.id === event.projectileId
        );
        if (projectile?.ownerKind === 'player') {
          aimDirection = normalize2(projectile.velocity) ?? aimDirection;
        }
        break;
      }
      case 'enemySpawned':
        enemySpawnFlashUntil.set(event.enemyId, renderClock + 0.32);
        break;
      case 'enemyDamaged':
        enemyHitFlashUntil.set(event.enemyId, renderClock + 0.12);
        break;
      case 'enemyAttackWarning':
        enemyAttackFlashUntil.set(event.enemyId, renderClock + 0.34);
        break;
      case 'enemyAttacked': {
        enemyAttackFlashUntil.set(event.enemyId, renderClock + 0.14);
        const mesh = enemyMeshes.get(event.enemyId);
        if (mesh) {
          createAttackBurst(mesh.position);
        }
        break;
      }
      case 'enemyDefeated': {
        enemyHitFlashUntil.set(event.enemyId, renderClock + 0.16);
        const mesh = enemyMeshes.get(event.enemyId);
        if (mesh) {
          createDeathBurst(mesh.position);
        }
        break;
      }
      case 'pickupCollected': {
        pickupPulseUntil = renderClock + 0.28;
        const mesh = pickupMeshes.get(event.pickupId);
        if (mesh) {
          createPickupBurst(mesh.position);
        }
        break;
      }
      case 'playerDamaged':
        playerDamageFlashUntil = renderClock + 0.25;
        break;
      default:
        break;
    }
  }
}

function updateAutoAimFallback(gameState: GameState) {
  if (
    pointerFireActive ||
    touchAimDirection ||
    keyboardMovementDirection ||
    gameState.enemies.length === 0
  ) {
    return;
  }

  const closestEnemy = gameState.enemies.reduce<Enemy | null>((closest, enemy) => {
    if (!closest) {
      return enemy;
    }

    const enemyDistance = distanceSquared(gameState.player.position, enemy.position);
    const closestDistance = distanceSquared(gameState.player.position, closest.position);
    return enemyDistance < closestDistance ? enemy : closest;
  }, null);

  if (!closestEnemy) {
    return;
  }

  const direction = normalize2({
    x: closestEnemy.position.x - gameState.player.position.x,
    z: closestEnemy.position.z - gameState.player.position.z
  });

  if (direction) {
    aimDirection = direction;
  }
}

function updateCamera(gameState: GameState, alpha: number) {
  cameraTarget.set(gameState.player.position.x, 0.8, gameState.player.position.z);
  desiredCameraPosition.copy(cameraTarget).add(fixedCameraOffset);
  desiredCameraPosition.x = clamp(desiredCameraPosition.x, -11, 11);
  desiredCameraPosition.z = clamp(desiredCameraPosition.z, -11, 11);

  const smoothing = gameState.status === 'playing' ? 0.08 + alpha * 0.02 : 0.12;
  smoothedCameraTarget.lerp(cameraTarget, smoothing);
  smoothedCameraPosition.lerp(desiredCameraPosition, smoothing);
  camera.position.copy(smoothedCameraPosition);
  cameraLookTarget.copy(smoothedCameraTarget);
  cameraLookTarget.y += 0.15;
  camera.lookAt(cameraLookTarget);
}

function createPickupBurst(position: THREE.Vector3) {
  const burst = new THREE.Mesh(cubeGeometry.clone(), burstMaterial.clone());
  burst.position.copy(position);
  burst.position.y += 0.35;
  burst.scale.set(0.18, 0.18, 0.18);
  burst.userData.expiresAt = renderClock + 0.32;
  burst.userData.duration = 0.32;
  burst.castShadow = false;
  pickupCollectBursts.push(burst);
  scene.add(burst);
}

function createAttackBurst(position: THREE.Vector3) {
  const material = burstMaterial.clone();
  material.color.set(0xff7a2f);
  material.emissive.set(0xff2f00);
  const burst = new THREE.Mesh(cubeGeometry.clone(), material);
  burst.position.copy(position);
  burst.position.y += 0.25;
  burst.scale.set(0.16, 0.08, 0.16);
  burst.userData.expiresAt = renderClock + 0.2;
  burst.userData.duration = 0.2;
  pickupCollectBursts.push(burst);
  scene.add(burst);
}

function createDeathBurst(position: THREE.Vector3) {
  const material = burstMaterial.clone();
  material.color.set(0xffffff);
  material.emissive.set(0xff5b2e);
  const burst = new THREE.Mesh(cubeGeometry.clone(), material);
  burst.position.copy(position);
  burst.position.y += 0.42;
  burst.scale.set(0.24, 0.24, 0.24);
  burst.userData.expiresAt = renderClock + 0.38;
  burst.userData.duration = 0.38;
  pickupCollectBursts.push(burst);
  scene.add(burst);
}

function updatePickupBursts() {
  for (let index = pickupCollectBursts.length - 1; index >= 0; index -= 1) {
    const burst = pickupCollectBursts[index];
    if (!burst) {
      continue;
    }

    const remaining = burst.userData.expiresAt - renderClock;
    if (remaining <= 0) {
      scene.remove(burst);
      disposeObject(burst);
      pickupCollectBursts.splice(index, 1);
      continue;
    }

    const duration = Number(burst.userData.duration) || 0.32;
    const progress = 1 - remaining / duration;
    burst.scale.setScalar(0.18 + progress * 1.8);
    burst.rotation.y += 0.08;
    if (burst instanceof THREE.Mesh && burst.material instanceof THREE.MeshStandardMaterial) {
      burst.material.opacity = Math.max(0, remaining / duration);
    }
  }
}

function updateAimFromPointer(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  );
  aimRaycaster.setFromCamera(pointerNdc, camera);

  const hit = aimRaycaster.ray.intersectPlane(aimPlane, aimIntersection);
  if (!hit) {
    return;
  }

  const direction = normalize2({
    x: aimIntersection.x - state.player.position.x,
    z: aimIntersection.z - state.player.position.z
  });
  if (direction) {
    mouseAimActive = true;
    aimDirection = direction;
  }
}

function bindTouchStick(
  kind: 'move' | 'aim',
  layer: HTMLElement | null,
  thumb: HTMLElement | null,
  onChange: (direction: Vector2 | null) => void
) {
  const stick = thumb?.parentElement;
  if (!layer || !stick || !thumb) {
    return;
  }

  let activePointerId: number | null = null;

  const updateStick = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) {
      return;
    }

    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    const maxDistance = radius - thumb.offsetWidth / 2;
    const rawX = event.clientX - (rect.left + radius);
    const rawY = event.clientY - (rect.top + radius);
    const distance = Math.hypot(rawX, rawY);
    const limitedDistance = Math.min(distance, maxDistance);
    const scale = distance === 0 ? 0 : limitedDistance / distance;
    const x = rawX * scale;
    const y = rawY * scale;

    thumb.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    const normalizedDistance = maxDistance === 0 ? 0 : limitedDistance / maxDistance;
    if (normalizedDistance < 0.14) {
      onChange(null);
      return;
    }

    onChange({
      x: x / maxDistance,
      z: y / maxDistance
    });
  };

  const resetStick = (pointerId: number) => {
    activePointerId = null;
    thumb.style.transform = 'translate3d(0, 0, 0)';
    onChange(null);
    releasePointerCapture(stick, pointerId);
  };

  stick.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || activePointerId !== null) {
      return;
    }

    activePointerId = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateStick(event);
    event.preventDefault();
  });

  stick.addEventListener('pointermove', (event) => {
    updateStick(event);
    if (activePointerId === event.pointerId) {
      event.preventDefault();
    }
  });

  stick.addEventListener('pointerup', (event) => {
    if (activePointerId === event.pointerId) {
      resetStick(event.pointerId);
      event.preventDefault();
    }
  });

  stick.addEventListener('pointercancel', (event) => {
    if (activePointerId === event.pointerId) {
      resetStick(event.pointerId);
      event.preventDefault();
    }
  });

  stick.dataset.control = kind;
}

function readMovementDirection(): Vector2 | null {
  let x = 0;
  let z = 0;

  if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) {
    x -= 1;
  }
  if (pressedKeys.has('d') || pressedKeys.has('arrowright')) {
    x += 1;
  }
  if (pressedKeys.has('w') || pressedKeys.has('arrowup')) {
    z -= 1;
  }
  if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) {
    z += 1;
  }

  keyboardMovementDirection = x === 0 && z === 0 ? null : { x, z };

  if (touchMovementDirection) {
    x += touchMovementDirection.x;
    z += touchMovementDirection.z;
  }

  const direction = x === 0 && z === 0 ? null : { x, z };
  if (direction && !mouseAimActive && !touchAimDirection) {
    aimDirection = normalize2(direction) ?? aimDirection;
  }

  return direction;
}

function isMovementKey(key: string) {
  return (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key.toLowerCase() === 'w' ||
    key.toLowerCase() === 'a' ||
    key.toLowerCase() === 's' ||
    key.toLowerCase() === 'd'
  );
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
}

function normalize2(vector: Vector2): Vector2 | null {
  const length = Math.hypot(vector.x, vector.z);
  if (length === 0) {
    return null;
  }

  return {
    x: vector.x / length,
    z: vector.z / length
  };
}

function distanceSquared(a: Vector2, b: Vector2) {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function releasePointerCapture(element: Element, pointerId: number) {
  if (element.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
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

  const activeWeapon = gameState.weapons[gameState.player.weaponId];
  const health = Math.ceil(gameState.player.health);
  const maxHealth = Math.ceil(gameState.player.maxHealth);
  const score = calculateScore(gameState);
  setText(healthLabel, `Health ${health}/${maxHealth}`);
  setText(weaponLabel, activeWeapon?.name ?? 'Unknown');
  setText(ammoLabel, 'Ammo ∞');
  setText(waveLabel, `Wave ${gameState.wave.index || '-'}`);
  setText(countdownLabel, countdownText(gameState));
  setText(
    enemiesLabel,
    `Enemies ${defeatedInWave(gameState)}/${gameState.wave.totalEnemies || 0}`
  );
  setText(scoreLabel, `Score ${score}`);
  setText(killsLabel, `Kills ${gameState.runSummary.kills}`);
  setText(statusLabel, statusText(gameState));
  setText(summaryLabel, summaryText(gameState));
  updateMenuPanel(gameState);
}

function handlePrimaryAction() {
  if (state.status === 'menu') {
    queueCommand({ type: 'startRun' });
    return;
  }

  if (state.status === 'gameOver') {
    queueCommand({ type: 'restartRun' });
    return;
  }

  queueCommand({ type: 'firePrimary', direction: aimDirection });
}

function handlePauseAction() {
  queueCommand({ type: state.status === 'paused' ? 'resume' : 'pause' });
}

function handleMenuPrimaryAction() {
  if (state.status === 'paused') {
    queueCommand({ type: 'restartRun' });
    return;
  }

  handlePrimaryAction();
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
      return gameState.wave.pendingSpawns.length > 0
        ? `Wave ${gameState.wave.index} deploying`
        : `Wave ${gameState.wave.index} active`;
    case 'paused':
      return 'Paused';
    case 'gameOver':
      return `Game over after ${formatDuration(gameState.runSummary.elapsed)}`;
    case 'loading':
      return 'Loading';
  }
}

function summaryText(gameState: GameState) {
  const weapon = gameState.weapons[gameState.player.weaponId]?.name ?? 'Unknown';
  if (gameState.status !== 'gameOver') {
    return `${weapon} | ${formatDuration(gameState.runSummary.elapsed)} | Damage ${Math.round(
      gameState.runSummary.damageDealt
    )} | Taken ${Math.round(gameState.runSummary.damageTaken)}`;
  }

  return [
    `Reached wave ${gameState.runSummary.waveReached}`,
    `Kills ${gameState.runSummary.kills}`,
    `Duration ${formatDuration(gameState.runSummary.elapsed)}`,
    `Dealt ${Math.round(gameState.runSummary.damageDealt)}`,
    `Taken ${Math.round(gameState.runSummary.damageTaken)}`,
    `Primary ${formatPrimaryWeapon(gameState.runSummary.weaponsUsed)}`
  ].join(' | ');
}

function formatWeaponsUsed(weaponsUsed: Record<string, number>) {
  const entries = Object.entries(weaponsUsed);
  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([name, shots]) => `${name} ${shots}`).join(', ');
}

function formatPrimaryWeapon(weaponsUsed: Record<string, number>) {
  const [name, shots] =
    Object.entries(weaponsUsed).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!name || shots === undefined) {
    return 'none';
  }

  return `${name} (${shots} shots)`;
}

function updateMenuPanel(gameState: GameState) {
  const isVisible =
    gameState.status === 'menu' ||
    gameState.status === 'paused' ||
    gameState.status === 'gameOver';
  menuOverlay.hidden = !isVisible;
  menuOverlay.dataset.status = gameState.status;

  if (!isVisible) {
    return;
  }

  setText(menuKicker, menuKickerText(gameState));
  setText(menuTitle, menuTitleText(gameState));
  setText(menuCopy, menuCopyText(gameState));
  menuPrimaryButton.textContent = menuPrimaryActionLabel(gameState);
  menuSecondaryButton.hidden = gameState.status !== 'paused';

  if (gameState.status === 'gameOver') {
    renderRunStats(gameState);
  } else if (runStats) {
    runStats.hidden = true;
    runStats.replaceChildren();
  }
}

function menuKickerText(gameState: GameState) {
  switch (gameState.status) {
    case 'paused':
      return 'Paused';
    case 'gameOver':
      return 'Run Summary';
    default:
      return 'Voxel Survival';
  }
}

function menuTitleText(gameState: GameState) {
  switch (gameState.status) {
    case 'paused':
      return 'Game Paused';
    case 'gameOver':
      return 'Game Over';
    default:
      return 'Ready';
  }
}

function menuCopyText(gameState: GameState) {
  switch (gameState.status) {
    case 'paused':
      return 'Resume the current run or restart from wave one.';
    case 'gameOver':
      return `Score ${calculateScore(gameState)} from ${gameState.runSummary.kills} kills.`;
    default:
      return 'Clear waves, collect drops, and stay alive.';
  }
}

function menuPrimaryActionLabel(gameState: GameState) {
  switch (gameState.status) {
    case 'paused':
      return 'Restart';
    case 'gameOver':
      return 'Restart Run';
    default:
      return 'Start Run';
  }
}

function renderRunStats(gameState: GameState) {
  if (!runStats) {
    return;
  }

  const stats: Array<[string, string]> = [
    ['Wave reached', String(gameState.runSummary.waveReached)],
    ['Kills', String(gameState.runSummary.kills)],
    ['Duration', formatDuration(gameState.runSummary.elapsed)],
    ['Primary weapon', formatPrimaryWeapon(gameState.runSummary.weaponsUsed)],
    ['Weapon shots', formatWeaponsUsed(gameState.runSummary.weaponsUsed)],
    ['Damage dealt', String(Math.round(gameState.runSummary.damageDealt))],
    ['Damage taken', String(Math.round(gameState.runSummary.damageTaken))]
  ];

  runStats.replaceChildren(
    ...stats.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      return [term, description];
    })
  );
  runStats.hidden = false;
}

function countdownText(gameState: GameState) {
  if (gameState.status !== 'waveCountdown') {
    return 'Next --';
  }

  return `Next ${Math.ceil(gameState.wave.countdown)}s`;
}

function defeatedInWave(gameState: GameState) {
  return Math.max(0, gameState.wave.totalEnemies - gameState.wave.enemiesRemaining);
}

function calculateScore(gameState: GameState) {
  return (
    gameState.runSummary.kills * 100 +
    gameState.runSummary.wavesCleared * 500 +
    Math.round(gameState.runSummary.damageDealt)
  );
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
