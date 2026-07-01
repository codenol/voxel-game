import type {
  Enemy,
  GameCommand,
  GameEvent,
  GameState,
  GameStatus,
  Pickup,
  Projectile,
  RunSummary,
  Vector2
} from './types';

const arenaRadius = 7.5;
const enemyContactCooldown = 0.75;
const projectileRadius = 0.16;

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
    }
  },
  wave: {
    index: 0,
    countdown: 0,
    enemiesRemaining: 0,
    spawned: false
  },
  runSummary: createRunSummary(),
  enemyContactCooldownRemaining: 0,
  events: [],
  nextEntityId: 1
});

export const updateGame = (
  state: GameState,
  deltaSeconds: number,
  commands: GameCommand[] = []
): GameState => {
  state.events = [];

  for (const command of commands) {
    applyCommand(state, command);
  }

  if (state.status !== 'playing' && state.status !== 'waveCountdown') {
    return state;
  }

  state.runSummary.elapsed += deltaSeconds;
  updateWeapons(state, deltaSeconds);

  if (state.status === 'waveCountdown') {
    state.wave.countdown = Math.max(0, state.wave.countdown - deltaSeconds);
    if (state.wave.countdown === 0) {
      transitionTo(state, 'playing');
      spawnWave(state);
    }
    return state;
  }

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
  wavesCleared: 0
});

const resetRun = (state: GameState) => {
  state.player.position = { x: 0, z: 0 };
  state.player.health = state.player.maxHealth;
  state.player.active = true;
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.runSummary = createRunSummary();
  state.wave = {
    index: 1,
    countdown: 2,
    enemiesRemaining: 0,
    spawned: false
  };
  getActiveWeapon(state).elapsedSinceShot = Infinity;
  state.enemyContactCooldownRemaining = 0;
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
  const projectile: Projectile = {
    id: nextId(state, 'projectile'),
    ownerId: state.player.id,
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

const spawnWave = (state: GameState) => {
  const enemyCount = 2 + state.wave.index;
  state.wave.enemiesRemaining = enemyCount;
  state.wave.spawned = true;

  for (let index = 0; index < enemyCount; index += 1) {
    const angle = (Math.PI * 2 * index) / enemyCount;
    const enemy: Enemy = {
      id: nextId(state, 'enemy'),
      position: {
        x: Math.cos(angle) * 5.5,
        z: Math.sin(angle) * 5.5
      },
      radius: 0.42,
      active: true,
      health: 50 + state.wave.index * 12,
      speed: 1.1 + state.wave.index * 0.08,
      damage: 8
    };
    state.enemies.push(enemy);
  }

  emit(state, { type: 'waveStarted', wave: state.wave.index });
};

const updateProjectiles = (state: GameState, deltaSeconds: number) => {
  for (const projectile of state.projectiles) {
    projectile.position.x += projectile.velocity.x * deltaSeconds;
    projectile.position.z += projectile.velocity.z * deltaSeconds;
    projectile.ttl -= deltaSeconds;

    if (
      projectile.ttl <= 0 ||
      Math.abs(projectile.position.x) > arenaRadius ||
      Math.abs(projectile.position.z) > arenaRadius
    ) {
      projectile.active = false;
    }
  }
};

const updateEnemies = (state: GameState, deltaSeconds: number) => {
  state.enemyContactCooldownRemaining = Math.max(
    0,
    state.enemyContactCooldownRemaining - deltaSeconds
  );

  for (const enemy of state.enemies) {
    const direction = normalize({
      x: state.player.position.x - enemy.position.x,
      z: state.player.position.z - enemy.position.z
    });

    if (!direction) {
      continue;
    }

    enemy.position.x += direction.x * enemy.speed * deltaSeconds;
    enemy.position.z += direction.z * enemy.speed * deltaSeconds;
  }
};

const resolveCombat = (state: GameState) => {
  for (const projectile of state.projectiles) {
    if (!projectile.active) {
      continue;
    }

    const hitEnemy = state.enemies.find(
      (enemy) => enemy.active && overlaps(projectile, enemy)
    );

    if (!hitEnemy) {
      continue;
    }

    projectile.active = false;
    hitEnemy.health -= projectile.damage;

    if (hitEnemy.health <= 0) {
      hitEnemy.active = false;
      state.runSummary.kills += 1;
      state.wave.enemiesRemaining = Math.max(0, state.wave.enemiesRemaining - 1);
      maybeDropPickup(state, hitEnemy.position);
      emit(state, { type: 'enemyDefeated', enemyId: hitEnemy.id });
    }
  }

  const touchingEnemy = state.enemies.find(
    (enemy) => enemy.active && overlaps(state.player, enemy)
  );

  if (touchingEnemy && state.enemyContactCooldownRemaining === 0) {
    state.enemyContactCooldownRemaining = enemyContactCooldown;
    state.player.health = Math.max(0, state.player.health - touchingEnemy.damage);
    emit(state, {
      type: 'playerDamaged',
      amount: touchingEnemy.damage,
      health: state.player.health
    });

    if (state.player.health === 0) {
      endRun(state);
    }
  }

  for (const pickup of state.pickups) {
    if (pickup.active && overlaps(state.player, pickup)) {
      collectPickup(state, pickup.id);
    }
  }
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
  }

  emit(state, {
    type: 'pickupCollected',
    pickupId: pickup.id,
    kind: pickup.kind
  });
};

const maybeDropPickup = (state: GameState, position: Vector2) => {
  if (state.runSummary.kills % 3 !== 0) {
    return;
  }

  const pickup: Pickup = {
    id: nextId(state, 'pickup'),
    position: { ...position },
    radius: 0.3,
    active: true,
    kind: 'health',
    value: 18
  };
  state.pickups.push(pickup);
};

const advanceWaveIfCleared = (state: GameState) => {
  if (!state.wave.spawned || state.wave.enemiesRemaining > 0) {
    return;
  }

  emit(state, { type: 'waveCleared', wave: state.wave.index });
  state.runSummary.wavesCleared = state.wave.index;
  state.wave = {
    index: state.wave.index + 1,
    countdown: 3,
    enemiesRemaining: 0,
    spawned: false
  };
  transitionTo(state, 'waveCountdown');
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

const overlaps = (
  a: { position: Vector2; radius: number },
  b: { position: Vector2; radius: number }
) => distanceSquared(a.position, b.position) <= (a.radius + b.radius) ** 2;

const distanceSquared = (a: Vector2, b: Vector2) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

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
