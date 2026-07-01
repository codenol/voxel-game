import type {
  Enemy,
  EnemyArchetype,
  GameCommand,
  GameEvent,
  GameState,
  GameStatus,
  Pickup,
  Projectile,
  RunSummary,
  Vector2,
  WaveSpawn
} from './types';
import { neonDistrictMap } from './districtMap';
import type { MapRect } from './districtMap';

const projectileRadius = 0.16;
const enemyProjectileRadius = 0.2;
const enemyAttackWindup = 0.34;

const enemyArchetypes: Record<
  EnemyArchetype,
  {
    radius: number;
    health: number;
    speed: number;
    damage: number;
    attackRange: number;
    attackCooldown: number;
    projectileSpeed: number;
    desiredRange: number;
  }
> = {
  rusher: {
    radius: 0.42,
    health: 52,
    speed: 1.58,
    damage: 9,
    attackRange: 0.92,
    attackCooldown: 0.82,
    projectileSpeed: 0,
    desiredRange: 0
  },
  shooter: {
    radius: 0.38,
    health: 44,
    speed: 1.08,
    damage: 7,
    attackRange: 6.2,
    attackCooldown: 1.45,
    projectileSpeed: 5.2,
    desiredRange: 4.5
  },
  tank: {
    radius: 0.56,
    health: 112,
    speed: 0.78,
    damage: 15,
    attackRange: 1.05,
    attackCooldown: 1.25,
    projectileSpeed: 0,
    desiredRange: 0
  },
  flanker: {
    radius: 0.34,
    health: 38,
    speed: 2.05,
    damage: 6,
    attackRange: 0.82,
    attackCooldown: 0.58,
    projectileSpeed: 0,
    desiredRange: 0
  }
};

export const createGameState = (): GameState => ({
  status: 'menu',
  previousStatus: null,
  player: {
    id: 'player',
    position: { x: 0, z: 0 },
    radius: 0.45,
    active: true,
    health: 100,
    maxHealth: 100,
    speed: 4.2,
    weaponId: 'pulse-carbine'
  },
  enemies: [],
  projectiles: [],
  pickups: [],
  weapons: {
    'pulse-carbine': {
      id: 'pulse-carbine',
      name: 'Pulse Carbine',
      damage: 34,
      cooldown: 0.28,
      projectileSpeed: 8.5,
      elapsedSinceShot: 0
    },
    'scatter-lance': {
      id: 'scatter-lance',
      name: 'Scatter Lance',
      damage: 58,
      cooldown: 0.58,
      projectileSpeed: 7.4,
      elapsedSinceShot: 0
    }
  },
  wave: {
    index: 0,
    countdown: 0,
    enemiesRemaining: 0,
    totalEnemies: 0,
    spawned: false,
    pendingSpawns: [],
    nextSpawnIn: 0
  },
  map: neonDistrictMap,
  runSummary: createRunSummary(),
  events: [],
  nextEntityId: 1
});

export const updateGame = (
  state: GameState,
  deltaSeconds: number,
  commands: GameCommand[] = []
): GameState => {
  state.events = [];
  let movementDirection: Vector2 | null = null;

  for (const command of commands) {
    if (command.type === 'movePlayer') {
      movementDirection = command.direction;
      continue;
    }

    applyCommand(state, command);
  }

  if (state.status !== 'playing' && state.status !== 'waveCountdown') {
    return state;
  }

  state.runSummary.elapsed += deltaSeconds;
  updateWeapons(state, deltaSeconds);

  if (state.status === 'waveCountdown') {
    updatePlayer(state, deltaSeconds, movementDirection);
    collectOverlappingPickups(state);
    removeInactiveEntities(state);
    state.wave.countdown = Math.max(0, state.wave.countdown - deltaSeconds);
    if (state.wave.countdown === 0) {
      transitionTo(state, 'playing');
      startWave(state);
    }
    return state;
  }

  updateWaveSpawning(state, deltaSeconds);
  updatePlayer(state, deltaSeconds, movementDirection);
  updateProjectiles(state, deltaSeconds);
  updateEnemies(state, deltaSeconds);
  resolveCombat(state);
  removeInactiveEntities(state);
  advanceWaveIfCleared(state);

  return state;
};

const createRunSummary = (): RunSummary => ({
  elapsed: 0,
  kills: 0,
  pickupsCollected: 0,
  wavesCleared: 0,
  waveReached: 0,
  damageDealt: 0,
  damageTaken: 0,
  weaponsUsed: {}
});

const resetRun = (state: GameState) => {
  state.player.position = { x: 0, z: 0 };
  state.player.health = state.player.maxHealth;
  state.player.active = true;
  state.enemies = [];
  state.projectiles = [];
  state.pickups = createInitialPickups(state);
  state.runSummary = createRunSummary();
  state.wave = {
    index: 1,
    countdown: 2,
    enemiesRemaining: 0,
    totalEnemies: 0,
    spawned: false,
    pendingSpawns: [],
    nextSpawnIn: 0
  };
  for (const weapon of Object.values(state.weapons)) {
    weapon.elapsedSinceShot = Infinity;
  }
  state.player.weaponId = 'pulse-carbine';
  transitionTo(state, 'waveCountdown');
};

const applyCommand = (state: GameState, command: GameCommand) => {
  switch (command.type) {
    case 'finishLoading':
      if (state.status === 'loading') {
        transitionTo(state, 'menu');
      }
      break;
    case 'startRun':
      if (state.status === 'menu' || state.status === 'gameOver') {
        resetRun(state);
      }
      break;
    case 'restartRun':
      resetRun(state);
      break;
    case 'pause':
      if (state.status === 'playing' || state.status === 'waveCountdown') {
        state.previousStatus = state.status;
        transitionTo(state, 'paused');
      }
      break;
    case 'resume':
      if (state.status === 'paused') {
        transitionTo(state, state.previousStatus ?? 'playing');
        state.previousStatus = null;
      }
      break;
    case 'gameOver':
      endRun(state);
      break;
    case 'firePrimary':
      if (state.status === 'playing') {
        firePrimary(state, command.direction);
      }
      break;
    case 'collectPickup':
      collectPickup(state, command.pickupId);
      break;
  }
};

const updatePlayer = (
  state: GameState,
  deltaSeconds: number,
  movementDirection: Vector2 | null
) => {
  if (
    (state.status !== 'playing' && state.status !== 'waveCountdown') ||
    !movementDirection
  ) {
    return;
  }

  const normalized = normalize(movementDirection);
  if (!normalized) {
    return;
  }

  moveWithCollision(state, state.player, {
    x: normalized.x * state.player.speed * deltaSeconds,
    z: normalized.z * state.player.speed * deltaSeconds
  });
};

const transitionTo = (state: GameState, to: GameStatus) => {
  if (state.status === to) {
    return;
  }

  const from = state.status;
  state.status = to;
  emit(state, { type: 'stateChanged', from, to });
};

const updateWeapons = (state: GameState, deltaSeconds: number) => {
  for (const weapon of Object.values(state.weapons)) {
    weapon.elapsedSinceShot += deltaSeconds;
  }
};

const firePrimary = (state: GameState, direction: Vector2) => {
  const weapon = getActiveWeapon(state);
  if (weapon.elapsedSinceShot < weapon.cooldown) {
    return;
  }

  const normalized = normalize(direction);
  if (!normalized) {
    return;
  }

  weapon.elapsedSinceShot = 0;
  state.runSummary.weaponsUsed[weapon.name] =
    (state.runSummary.weaponsUsed[weapon.name] ?? 0) + 1;
  const projectile: Projectile = {
    id: nextId(state, 'projectile'),
    ownerId: state.player.id,
    ownerKind: 'player',
    position: { ...state.player.position },
    velocity: {
      x: normalized.x * weapon.projectileSpeed,
      z: normalized.z * weapon.projectileSpeed
    },
    radius: projectileRadius,
    active: true,
    damage: weapon.damage,
    ttl: 1.8
  };
  state.projectiles.push(projectile);
  emit(state, { type: 'projectileFired', projectileId: projectile.id });
};

const startWave = (state: GameState) => {
  const spawns = createWaveSpawns(state.wave.index);
  state.wave.pendingSpawns = spawns;
  state.wave.enemiesRemaining = spawns.length;
  state.wave.totalEnemies = spawns.length;
  state.wave.spawned = true;
  state.wave.nextSpawnIn = 0;
  state.runSummary.waveReached = Math.max(
    state.runSummary.waveReached,
    state.wave.index
  );
  emit(state, { type: 'waveStarted', wave: state.wave.index });
  updateWaveSpawning(state, 0);
};

const updateWaveSpawning = (state: GameState, deltaSeconds: number) => {
  if (!state.wave.spawned || state.wave.pendingSpawns.length === 0) {
    return;
  }

  state.wave.nextSpawnIn = Math.max(0, state.wave.nextSpawnIn - deltaSeconds);

  while (state.wave.nextSpawnIn === 0 && state.wave.pendingSpawns.length > 0) {
    const spawnRequest = state.wave.pendingSpawns.shift();
    if (!spawnRequest) {
      return;
    }

    spawnEnemyFromWave(state, spawnRequest);
    state.wave.nextSpawnIn =
      state.wave.pendingSpawns[0]?.delay ?? Number.POSITIVE_INFINITY;
  }
};

const spawnEnemyFromWave = (state: GameState, spawnRequest: WaveSpawn) => {
  const spawnCount = state.map.enemySpawns.length;
  const spawn =
    state.map.enemySpawns[
      (spawnRequest.spawnIndex + state.wave.index - 1) % spawnCount
    ] ?? { x: 0, z: 0 };
  const enemy = createEnemy(
    state,
    spawnRequest.archetype,
    spawn,
    spawnRequest.spawnIndex
  );
  state.enemies.push(enemy);
  emit(state, { type: 'enemySpawned', enemyId: enemy.id });
};

const createWaveSpawns = (waveIndex: number): WaveSpawn[] => {
  const enemyCount = 3 + waveIndex + Math.floor(waveIndex * 0.55);
  const delay = Math.max(0.46, 1.1 - waveIndex * 0.08);
  const archetypes = archetypesForWave(waveIndex);

  return Array.from({ length: enemyCount }, (_, index) => ({
    archetype: archetypes[index % archetypes.length] ?? 'rusher',
    spawnIndex: index,
    delay: index === 0 ? 0 : delay
  }));
};

const archetypesForWave = (waveIndex: number): EnemyArchetype[] => {
  if (waveIndex === 1) {
    return ['rusher', 'rusher', 'shooter'];
  }

  if (waveIndex === 2) {
    return ['rusher', 'shooter', 'rusher', 'flanker'];
  }

  if (waveIndex === 3) {
    return ['rusher', 'shooter', 'flanker', 'tank', 'rusher'];
  }

  return ['rusher', 'shooter', 'flanker', 'rusher', 'tank', 'shooter'];
};

const createEnemy = (
  state: GameState,
  archetype: EnemyArchetype,
  position: Vector2,
  spawnIndex: number
): Enemy => {
  const template = enemyArchetypes[archetype];
  const waveHealthBonus =
    Math.max(0, state.wave.index - 1) * (archetype === 'tank' ? 14 : 7);
  const speedBonus = Math.min(0.34, Math.max(0, state.wave.index - 1) * 0.035);

  return {
    id: nextId(state, 'enemy'),
    archetype,
    position: { ...position },
    radius: template.radius,
    active: true,
    health: template.health + waveHealthBonus,
    maxHealth: template.health + waveHealthBonus,
    speed: template.speed + speedBonus,
    damage: template.damage + Math.floor(Math.max(0, state.wave.index - 1) / 2),
    attackRange: template.attackRange,
    attackCooldown: template.attackCooldown,
    attackCooldownRemaining: 0.35 + spawnIndex * 0.12,
    windupRemaining: 0,
    projectileSpeed: template.projectileSpeed,
    desiredRange: template.desiredRange,
    strafeDirection: spawnIndex % 2 === 0 ? 1 : -1,
    pathDirection: null,
    repathRemaining: 0
  };
};

const updateProjectiles = (state: GameState, deltaSeconds: number) => {
  for (const projectile of state.projectiles) {
    projectile.position.x += projectile.velocity.x * deltaSeconds;
    projectile.position.z += projectile.velocity.z * deltaSeconds;
    projectile.ttl -= deltaSeconds;

    if (
      projectile.ttl <= 0 ||
      isOutsideBounds(state, projectile.position, projectile.radius) ||
      collidesWithMap(state.map.colliders, projectile.position, projectile.radius)
    ) {
      projectile.active = false;
    }
  }
};

const shouldStartEnemyAttack = (
  state: GameState,
  enemy: Enemy,
  distanceToPlayer: number
) =>
  enemy.attackCooldownRemaining === 0 &&
  distanceToPlayer <= enemy.attackRange &&
  (enemy.archetype !== 'shooter' ||
    hasLineOfSight(state.map.colliders, enemy.position, state.player.position));

const performEnemyAttack = (
  state: GameState,
  enemy: Enemy,
  direction: Vector2,
  distanceToPlayer: number
) => {
  emit(state, { type: 'enemyAttacked', enemyId: enemy.id });

  if (enemy.archetype === 'shooter') {
    const projectile: Projectile = {
      id: nextId(state, 'projectile'),
      ownerId: enemy.id,
      ownerKind: 'enemy',
      position: { ...enemy.position },
      velocity: {
        x: direction.x * enemy.projectileSpeed,
        z: direction.z * enemy.projectileSpeed
      },
      radius: enemyProjectileRadius,
      active: true,
      damage: enemy.damage,
      ttl: 2.4
    };
    state.projectiles.push(projectile);
    emit(state, { type: 'projectileFired', projectileId: projectile.id });
    return;
  }

  if (distanceToPlayer <= enemy.attackRange + state.player.radius) {
    damagePlayer(state, enemy.damage);
  }
};

const enemyMovementDirection = (
  state: GameState,
  enemy: Enemy,
  directToPlayer: Vector2
): Vector2 | null => {
  const distanceToPlayer = Math.hypot(
    state.player.position.x - enemy.position.x,
    state.player.position.z - enemy.position.z
  );
  let desired = directToPlayer;

  if (enemy.archetype === 'shooter' && distanceToPlayer < enemy.desiredRange) {
    desired = { x: -directToPlayer.x, z: -directToPlayer.z };
  } else if (
    enemy.archetype === 'shooter' &&
    distanceToPlayer <= enemy.attackRange &&
    hasLineOfSight(state.map.colliders, enemy.position, state.player.position)
  ) {
    desired = {
      x: directToPlayer.z * enemy.strafeDirection,
      z: -directToPlayer.x * enemy.strafeDirection
    };
  } else if (enemy.archetype === 'flanker' && distanceToPlayer > 1.4) {
    desired = normalize({
      x: directToPlayer.x + directToPlayer.z * enemy.strafeDirection * 0.82,
      z: directToPlayer.z - directToPlayer.x * enemy.strafeDirection * 0.82
    }) ?? directToPlayer;
  }

  if (enemy.repathRemaining > 0 && enemy.pathDirection) {
    return enemy.pathDirection;
  }

  enemy.pathDirection = findNavigableDirection(state, enemy, desired);
  enemy.repathRemaining = 0.22;
  return enemy.pathDirection;
};

const findNavigableDirection = (
  state: GameState,
  enemy: Enemy,
  desired: Vector2
): Vector2 | null => {
  const normalized = normalize(desired);
  if (!normalized) {
    return null;
  }

  const candidates = [
    normalized,
    rotateVector(normalized, Math.PI / 4),
    rotateVector(normalized, -Math.PI / 4),
    rotateVector(normalized, Math.PI / 2),
    rotateVector(normalized, -Math.PI / 2),
    { x: normalized.x, z: 0 },
    { x: 0, z: normalized.z }
  ];

  for (const candidate of candidates) {
    const direction = normalize(candidate);
    if (!direction) {
      continue;
    }

    const probe = {
      x: enemy.position.x + direction.x * Math.max(enemy.radius * 1.25, 0.68),
      z: enemy.position.z + direction.z * Math.max(enemy.radius * 1.25, 0.68)
    };
    if (canOccupy(state, probe, enemy.radius)) {
      return direction;
    }
  }

  return null;
};

const updateEnemies = (state: GameState, deltaSeconds: number) => {
  for (const enemy of state.enemies) {
    enemy.attackCooldownRemaining = Math.max(
      0,
      enemy.attackCooldownRemaining - deltaSeconds
    );
    enemy.repathRemaining = Math.max(0, enemy.repathRemaining - deltaSeconds);

    const toPlayer = {
      x: state.player.position.x - enemy.position.x,
      z: state.player.position.z - enemy.position.z
    };
    const distanceToPlayer = Math.hypot(toPlayer.x, toPlayer.z);
    const direction = normalize(toPlayer);

    if (!direction) {
      continue;
    }

    if (enemy.windupRemaining > 0) {
      enemy.windupRemaining = Math.max(0, enemy.windupRemaining - deltaSeconds);
      if (enemy.windupRemaining === 0) {
        performEnemyAttack(state, enemy, direction, distanceToPlayer);
      }
      continue;
    }

    if (shouldStartEnemyAttack(state, enemy, distanceToPlayer)) {
      enemy.windupRemaining = enemyAttackWindup;
      enemy.attackCooldownRemaining = enemy.attackCooldown;
      emit(state, { type: 'enemyAttackWarning', enemyId: enemy.id });
      continue;
    }

    const desiredDirection = enemyMovementDirection(state, enemy, direction);
    if (!desiredDirection) {
      continue;
    }

    moveWithCollision(state, enemy, {
      x: desiredDirection.x * enemy.speed * deltaSeconds,
      z: desiredDirection.z * enemy.speed * deltaSeconds
    });
  }
};

const resolveCombat = (state: GameState) => {
  for (const projectile of state.projectiles) {
    if (!projectile.active) {
      continue;
    }

    if (projectile.ownerKind === 'enemy') {
      if (overlaps(projectile, state.player)) {
        projectile.active = false;
        damagePlayer(state, projectile.damage);
      }
      continue;
    }

    const hitEnemy = state.enemies.find(
      (enemy) => enemy.active && overlaps(projectile, enemy)
    );

    if (!hitEnemy) {
      continue;
    }

    projectile.active = false;
    const damageDealt = Math.min(projectile.damage, hitEnemy.health);
    hitEnemy.health -= projectile.damage;
    state.runSummary.damageDealt += damageDealt;
    emit(state, { type: 'enemyDamaged', enemyId: hitEnemy.id });

    if (hitEnemy.health <= 0) {
      defeatEnemy(state, hitEnemy);
    }
  }

  collectOverlappingPickups(state);
};

const damagePlayer = (state: GameState, amount: number) => {
  const damageTaken = Math.min(amount, state.player.health);
  state.player.health = Math.max(0, state.player.health - amount);
  state.runSummary.damageTaken += damageTaken;
  emit(state, {
    type: 'playerDamaged',
    amount,
    health: state.player.health
  });

  if (state.player.health === 0) {
    endRun(state);
  }
};

const defeatEnemy = (state: GameState, enemy: Enemy) => {
  enemy.active = false;
  state.runSummary.kills += 1;
  state.wave.enemiesRemaining = Math.max(0, state.wave.enemiesRemaining - 1);
  maybeDropPickup(state, enemy.position);
  emit(state, { type: 'enemyDefeated', enemyId: enemy.id });
};

const collectPickup = (state: GameState, pickupId: string) => {
  const pickup = state.pickups.find((candidate) => candidate.id === pickupId);
  if (!pickup || !pickup.active) {
    return;
  }

  pickup.active = false;
  state.runSummary.pickupsCollected += 1;

  if (pickup.kind === 'health') {
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + pickup.value
    );
  } else if (pickup.kind === 'weapon') {
    const weapon = state.weapons['scatter-lance'];
    if (!weapon) {
      return;
    }

    state.player.weaponId = 'scatter-lance';
    weapon.elapsedSinceShot = Infinity;
  }

  emit(state, {
    type: 'pickupCollected',
    pickupId: pickup.id,
    kind: pickup.kind
  });
};

const maybeDropPickup = (state: GameState, position: Vector2) => {
  if (state.runSummary.kills % 4 !== 0) {
    return;
  }

  const spawn = nearestLootSpawn(state, position);
  const pickup: Pickup = {
    id: nextId(state, 'pickup'),
    position: { ...spawn },
    radius: 0.3,
    active: true,
    kind: 'health',
    value: 18
  };
  state.pickups.push(pickup);
};

const createInitialPickups = (state: GameState): Pickup[] =>
  state.map.lootSpawns.slice(0, 2).map((position) => ({
    id: nextId(state, 'pickup'),
    position: { ...position },
    radius: 0.3,
    active: true,
    kind: 'health',
    value: 18
  }));

const collectOverlappingPickups = (state: GameState) => {
  for (const pickup of state.pickups) {
    if (pickup.active && overlaps(state.player, pickup)) {
      collectPickup(state, pickup.id);
    }
  }
};

const advanceWaveIfCleared = (state: GameState) => {
  if (
    !state.wave.spawned ||
    state.wave.enemiesRemaining > 0 ||
    state.wave.pendingSpawns.length > 0
  ) {
    return;
  }

  emit(state, { type: 'waveCleared', wave: state.wave.index });
  state.runSummary.wavesCleared = state.wave.index;
  createBetweenWaveLoot(state);
  state.wave = {
    index: state.wave.index + 1,
    countdown: 4,
    enemiesRemaining: 0,
    totalEnemies: 0,
    spawned: false,
    pendingSpawns: [],
    nextSpawnIn: 0
  };
  transitionTo(state, 'waveCountdown');
};

const createBetweenWaveLoot = (state: GameState) => {
  const rewardCount = state.wave.index % 3 === 0 ? 3 : 2;
  for (let index = 0; index < rewardCount; index += 1) {
    const spawn =
      state.map.lootSpawns[
        (state.wave.index + index * 2) % state.map.lootSpawns.length
      ] ?? { x: 0, z: 0 };
    state.pickups.push({
      id: nextId(state, 'pickup'),
      position: { ...spawn },
      radius: 0.3,
      active: true,
      kind:
        state.wave.index >= 2 &&
        index === rewardCount - 1 &&
        state.player.weaponId !== 'scatter-lance'
          ? 'weapon'
          : 'health',
      value: 20 + Math.min(12, state.wave.index * 2)
    });
  }
};

const endRun = (state: GameState) => {
  if (state.status === 'gameOver') {
    return;
  }

  state.player.active = false;
  emit(state, { type: 'runEnded', summary: { ...state.runSummary } });
  transitionTo(state, 'gameOver');
};

const removeInactiveEntities = (state: GameState) => {
  state.enemies = state.enemies.filter((enemy) => enemy.active);
  state.projectiles = state.projectiles.filter((projectile) => projectile.active);
  state.pickups = state.pickups.filter((pickup) => pickup.active);
};

const moveWithCollision = (
  state: GameState,
  entity: { position: Vector2; radius: number },
  movement: Vector2
) => {
  const nextX = {
    x: entity.position.x + movement.x,
    z: entity.position.z
  };
  if (canOccupy(state, nextX, entity.radius)) {
    entity.position.x = nextX.x;
  }

  const nextZ = {
    x: entity.position.x,
    z: entity.position.z + movement.z
  };
  if (canOccupy(state, nextZ, entity.radius)) {
    entity.position.z = nextZ.z;
  }
};

const canOccupy = (state: GameState, position: Vector2, radius: number) =>
  !isOutsideBounds(state, position, radius) &&
  !collidesWithMap(state.map.colliders, position, radius);

const isOutsideBounds = (state: GameState, position: Vector2, radius: number) =>
  position.x - radius < state.map.bounds.minX ||
  position.x + radius > state.map.bounds.maxX ||
  position.z - radius < state.map.bounds.minZ ||
  position.z + radius > state.map.bounds.maxZ;

const collidesWithMap = (colliders: MapRect[], position: Vector2, radius: number) =>
  colliders.some((collider) => circleOverlapsRect(position, radius, collider));

const circleOverlapsRect = (position: Vector2, radius: number, rect: MapRect) => {
  const halfWidth = rect.width / 2;
  const halfDepth = rect.depth / 2;
  const closestX = clamp(
    position.x,
    rect.position.x - halfWidth,
    rect.position.x + halfWidth
  );
  const closestZ = clamp(
    position.z,
    rect.position.z - halfDepth,
    rect.position.z + halfDepth
  );

  return distanceSquared(position, { x: closestX, z: closestZ }) <= radius ** 2;
};

const hasLineOfSight = (colliders: MapRect[], from: Vector2, to: Vector2) => {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.ceil(distance / 0.35));

  for (let step = 1; step < steps; step += 1) {
    const alpha = step / steps;
    const point = {
      x: from.x + (to.x - from.x) * alpha,
      z: from.z + (to.z - from.z) * alpha
    };

    if (collidesWithMap(colliders, point, 0.08)) {
      return false;
    }
  }

  return true;
};

const nearestLootSpawn = (state: GameState, position: Vector2) =>
  state.map.lootSpawns.reduce((nearest, spawn) =>
    distanceSquared(position, spawn) < distanceSquared(position, nearest)
      ? spawn
      : nearest
  );

const overlaps = (
  a: { position: Vector2; radius: number },
  b: { position: Vector2; radius: number }
) => distanceSquared(a.position, b.position) <= (a.radius + b.radius) ** 2;

const distanceSquared = (a: Vector2, b: Vector2) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rotateVector = (vector: Vector2, radians: number): Vector2 => {
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    x: vector.x * cos - vector.z * sin,
    z: vector.x * sin + vector.z * cos
  };
};

const normalize = (vector: Vector2): Vector2 | null => {
  const length = Math.hypot(vector.x, vector.z);
  if (length === 0) {
    return null;
  }

  return {
    x: vector.x / length,
    z: vector.z / length
  };
};

const nextId = (state: GameState, prefix: string) => {
  const id = `${prefix}-${state.nextEntityId}`;
  state.nextEntityId += 1;
  return id;
};

const emit = (state: GameState, event: GameEvent) => {
  state.events.push(event);
};

const getActiveWeapon = (state: GameState) => {
  const weapon = state.weapons[state.player.weaponId];
  if (!weapon) {
    throw new Error(`Missing player weapon: ${state.player.weaponId}`);
  }

  return weapon;
};
