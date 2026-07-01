import type { Vector2 } from './types';

export interface MapRect {
  id: string;
  position: Vector2;
  width: number;
  depth: number;
}

export interface MapProp extends MapRect {
  kind: 'cover' | 'building' | 'landmark';
  height: number;
  color: number;
  emissive?: number;
}

export interface DistrictMap {
  id: string;
  name: string;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  plaza: MapRect;
  streets: MapRect[];
  alleys: MapRect[];
  cover: MapProp[];
  buildings: MapProp[];
  landmarks: MapProp[];
  colliders: MapRect[];
  enemySpawns: Vector2[];
  lootSpawns: Vector2[];
}

const cover: MapProp[] = [
  {
    id: 'cover-plaza-west',
    kind: 'cover',
    position: { x: -2.75, z: -0.9 },
    width: 1.1,
    depth: 0.45,
    height: 0.55,
    color: 0x62715b
  },
  {
    id: 'cover-plaza-east',
    kind: 'cover',
    position: { x: 2.75, z: 0.95 },
    width: 1.1,
    depth: 0.45,
    height: 0.55,
    color: 0x62715b
  },
  {
    id: 'cover-north-alley',
    kind: 'cover',
    position: { x: -0.95, z: 4.15 },
    width: 0.45,
    depth: 1.25,
    height: 0.55,
    color: 0x697452
  },
  {
    id: 'cover-south-alley',
    kind: 'cover',
    position: { x: 0.95, z: -4.15 },
    width: 0.45,
    depth: 1.25,
    height: 0.55,
    color: 0x697452
  },
  {
    id: 'cover-market-stalls',
    kind: 'cover',
    position: { x: -5.45, z: 2.15 },
    width: 1.3,
    depth: 0.5,
    height: 0.62,
    color: 0x57706f
  },
  {
    id: 'cover-generator-bank',
    kind: 'cover',
    position: { x: 5.35, z: -2.25 },
    width: 1.3,
    depth: 0.5,
    height: 0.62,
    color: 0x735d65
  }
];

const buildings: MapProp[] = [
  {
    id: 'building-northwest',
    kind: 'building',
    position: { x: -6.4, z: 5.95 },
    width: 2.2,
    depth: 2.0,
    height: 2.9,
    color: 0x5f7482
  },
  {
    id: 'building-northeast',
    kind: 'building',
    position: { x: 6.3, z: 5.75 },
    width: 2.4,
    depth: 2.15,
    height: 3.35,
    color: 0x667c86
  },
  {
    id: 'building-southwest',
    kind: 'building',
    position: { x: -6.2, z: -5.85 },
    width: 2.45,
    depth: 2.15,
    height: 3.1,
    color: 0x6b727d
  },
  {
    id: 'building-southeast',
    kind: 'building',
    position: { x: 6.35, z: -5.8 },
    width: 2.25,
    depth: 2.2,
    height: 2.8,
    color: 0x60757d
  },
  {
    id: 'building-west-row',
    kind: 'building',
    position: { x: -7.25, z: 0 },
    width: 1.45,
    depth: 3.7,
    height: 2.15,
    color: 0x52666d
  },
  {
    id: 'building-east-row',
    kind: 'building',
    position: { x: 7.25, z: 0 },
    width: 1.45,
    depth: 3.7,
    height: 2.4,
    color: 0x52666d
  }
];

const landmarks: MapProp[] = [
  {
    id: 'landmark-neon-tower',
    kind: 'landmark',
    position: { x: -3.95, z: 2.95 },
    width: 0.65,
    depth: 0.65,
    height: 2.65,
    color: 0x38464e,
    emissive: 0x00ffd0
  },
  {
    id: 'landmark-data-kiosk',
    kind: 'landmark',
    position: { x: 3.95, z: -3.05 },
    width: 0.7,
    depth: 0.7,
    height: 1.65,
    color: 0x3f4b5c,
    emissive: 0xff4ed8
  }
];

export const neonDistrictMap: DistrictMap = {
  id: 'neon-district-alpha',
  name: 'Neon District Alpha',
  bounds: {
    minX: -8.35,
    maxX: 8.35,
    minZ: -8.35,
    maxZ: 8.35
  },
  plaza: {
    id: 'central-plaza',
    position: { x: 0, z: 0 },
    width: 5.2,
    depth: 4.6
  },
  streets: [
    {
      id: 'east-west-main',
      position: { x: 0, z: 0 },
      width: 15.2,
      depth: 2.15
    },
    {
      id: 'north-south-main',
      position: { x: 0, z: 0 },
      width: 2.15,
      depth: 15.2
    }
  ],
  alleys: [
    {
      id: 'northwest-alley',
      position: { x: -3.85, z: 4.45 },
      width: 1.25,
      depth: 4.1
    },
    {
      id: 'southeast-alley',
      position: { x: 3.85, z: -4.45 },
      width: 1.25,
      depth: 4.1
    },
    {
      id: 'west-service-lane',
      position: { x: -5.35, z: 0 },
      width: 1.1,
      depth: 5.2
    },
    {
      id: 'east-service-lane',
      position: { x: 5.35, z: 0 },
      width: 1.1,
      depth: 5.2
    }
  ],
  cover,
  buildings,
  landmarks,
  colliders: [...cover, ...buildings, ...landmarks],
  enemySpawns: [
    { x: -6.25, z: -1.6 },
    { x: -1.55, z: 6.35 },
    { x: 6.1, z: 1.7 },
    { x: 1.55, z: -6.35 },
    { x: -5.15, z: 3.45 },
    { x: 5.15, z: -3.45 }
  ],
  lootSpawns: [
    { x: -3.55, z: -2.85 },
    { x: 3.55, z: 2.85 },
    { x: -1.55, z: 5.45 },
    { x: 1.55, z: -5.45 }
  ]
};
