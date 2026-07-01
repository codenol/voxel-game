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
const waveLabel = document.querySelector<HTMLElement>('#wave-label');
const enemiesLabel = document.querySelector<HTMLElement>('#enemies-label');
const statusLabel = document.querySelector<HTMLElement>('#status-label');
const summaryLabel = document.querySelector<HTMLElement>('#summary-label');
const touchControls = document.querySelector<HTMLElement>('#touch-controls');
const moveStickThumb = document.querySelector<HTMLElement>('#move-stick-thumb');
const aimStickThumb = document.querySelector<HTMLElement>('#aim-stick-thumb');

if (!canvas || !hud || !primaryAction || !pauseAction) {
  throw new Error('Game UI was not found.');
}

const gameHud = hud;
const primaryButton = primaryAction;
const pauseButton = pauseAction;
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
const enemyHitFlashUntil = new Map<string, number>();
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
const enemyHitMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xff5b2e,
  roughness: 0.5
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
  if (state.status === 'menu') {
    queueCommand({ type: 'startRun' });
    return;
  }

  if (state.status === 'gameOver') {
    queueCommand({ type: 'restartRun' });
    return;
  }

  queueCommand({ type: 'firePrimary', direction: aimDirection });
});

pauseButton.addEventListener('click', () => {
  queueCommand({ type: state.status === 'paused' ? 'resume' : 'pause' });
});

window.addEventListener('keydown', (event) => {
  if (isMovementKey(event.key)) {
    pressedKeys.add(event.key.toLowerCase());
    event.preventDefault();
  }

  if (event.key === ' ') {
    event.preventDefault();
    queueCommand({ type: 'firePrimary', direction: aimDirection });
  }

  if (event.key.toLowerCase() === 'p') {
    queueCommand({ type: state.status === 'paused' ? 'resume' : 'pause' });
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

function createEnemyMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(cubeGeometry.clone(), enemyMaterial);
  body.scale.set(0.72, 0.72, 0.72);
  body.castShadow = true;
  body.receiveShadow = true;

  const head = new THREE.Mesh(cubeGeometry.clone(), enemyMaterial);
  head.position.set(0, 0.54, -0.08);
  head.scale.set(0.42, 0.28, 0.42);
  head.castShadow = true;
  head.receiveShadow = true;

  group.add(body, head);
  return group;
}

function updateEnemyMesh(enemy: Enemy, mesh: THREE.Group) {
  const hitUntil = enemyHitFlashUntil.get(enemy.id) ?? 0;
  mesh.position.set(enemy.position.x, 0.36, enemy.position.z);
  mesh.rotation.y += 0.025;
  mesh.scale.setScalar(renderClock < hitUntil ? 1.16 : 1);
  mesh.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = renderClock < hitUntil ? enemyHitMaterial : enemyMaterial;
    }
  });
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
  mesh.position.set(
    pickup.position.x,
    0.4 + Math.sin(renderClock * 5) * 0.06,
    pickup.position.z
  );
  mesh.rotation.y += 0.04;
  mesh.scale.setScalar(pulse);
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
        if (projectile) {
          aimDirection = normalize2(projectile.velocity) ?? aimDirection;
        }
        break;
      }
      case 'enemyDefeated': {
        enemyHitFlashUntil.set(event.enemyId, renderClock + 0.16);
        const mesh = enemyMeshes.get(event.enemyId);
        if (mesh) {
          createPickupBurst(mesh.position);
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
  burst.castShadow = false;
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

    const progress = 1 - remaining / 0.32;
    burst.scale.setScalar(0.18 + progress * 1.8);
    burst.rotation.y += 0.08;
    if (burst instanceof THREE.Mesh && burst.material instanceof THREE.MeshStandardMaterial) {
      burst.material.opacity = Math.max(0, remaining / 0.32);
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
