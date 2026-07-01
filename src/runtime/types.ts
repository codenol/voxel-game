import type { DistrictMap } from './districtMap';

export type GameStatus =
  | 'loading'
  | 'menu'
  | 'waveCountdown'
  | 'playing'
  | 'paused'
  | 'gameOver';

export interface Vector2 {
  x: number;
  z: number;
}

export interface EntityBase {
  id: string;
  position: Vector2;
  radius: number;
  active: boolean;
}

export interface Player extends EntityBase {
  health: number;
  maxHealth: number;
  speed: number;
  weaponId: string;
}

export type EnemyArchetype = 'rusher' | 'shooter' | 'tank' | 'flanker';

export interface Enemy extends EntityBase {
  archetype: EnemyArchetype;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  attackCooldownRemaining: number;
  windupRemaining: number;
  projectileSpeed: number;
  desiredRange: number;
  strafeDirection: 1 | -1;
  pathDirection: Vector2 | null;
  repathRemaining: number;
}

export interface Projectile extends EntityBase {
  ownerId: string;
  ownerKind: 'player' | 'enemy';
  velocity: Vector2;
  damage: number;
  ttl: number;
}

export interface Pickup extends EntityBase {
  kind: 'health' | 'ammo' | 'weapon';
  value: number;
}

export interface Weapon {
  id: string;
  name: string;
  damage: number;
  cooldown: number;
  projectileSpeed: number;
  elapsedSinceShot: number;
}

export interface Wave {
  index: number;
  countdown: number;
  enemiesRemaining: number;
  spawned: boolean;
}

export interface RunSummary {
  elapsed: number;
  kills: number;
  pickupsCollected: number;
  wavesCleared: number;
}

export type GameCommand =
  | { type: 'finishLoading' }
  | { type: 'startRun' }
  | { type: 'restartRun' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'gameOver' }
  | { type: 'movePlayer'; direction: Vector2 }
  | { type: 'firePrimary'; direction: Vector2 }
  | { type: 'collectPickup'; pickupId: string };

export type GameEvent =
  | { type: 'stateChanged'; from: GameStatus; to: GameStatus }
  | { type: 'waveStarted'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'projectileFired'; projectileId: string }
  | { type: 'enemySpawned'; enemyId: string }
  | { type: 'enemyDamaged'; enemyId: string }
  | { type: 'enemyAttackWarning'; enemyId: string }
  | { type: 'enemyAttacked'; enemyId: string }
  | { type: 'enemyDefeated'; enemyId: string }
  | { type: 'pickupCollected'; pickupId: string; kind: Pickup['kind'] }
  | { type: 'playerDamaged'; amount: number; health: number }
  | { type: 'runEnded'; summary: RunSummary };

export interface GameState {
  status: GameStatus;
  previousStatus: GameStatus | null;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  weapons: Record<string, Weapon>;
  wave: Wave;
  map: DistrictMap;
  runSummary: RunSummary;
  events: GameEvent[];
  nextEntityId: number;
}
