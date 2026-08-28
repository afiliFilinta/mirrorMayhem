export interface Vector2 {
  x: number;
  y: number;
}

export interface Mirror {
  id: string;
  start: Vector2;
  end: Vector2;
  type: MirrorType;
}

export type MirrorType = "STANDARD" | "SPLITTER" | "EXPLOSIVE";

export interface Wall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation around the rectangle center, in radians. */
  rotation?: number;
}

export interface Target {
  id: string;
  center: Vector2;
  radius: number;
}

export interface ArenaMap {
  width: number;
  height: number;
  playerSpawn: Vector2;
  botSpawn: Vector2;
  walls: Wall[];
  mirrors: Mirror[];
}

export type ArenaLayout = "MAZE" | "BALANCED" | "OPEN" | "CHAOTIC";

export interface ArenaSettings {
  mirrorCount: number;
  furnitureCount: number;
  mirrorScale: number;
  furnitureScale: number;
  layoutSpread: number;
  layout: ArenaLayout;
}

export type GameStatus = "PLAYING" | "WON" | "LOST";

export interface Combatant {
  id: "player" | "bot";
  position: Vector2;
  radius: number;
  hp: number;
  cooldownRemaining: number;
  flashRemaining: number;
}

export interface ShotTrace {
  points: Vector2[];
  mirrorImpacts: Array<{
    point: Vector2;
    mirrorId: string;
    type: MirrorType;
    outgoingDirection: Vector2;
  }>;
  hitTargetId?: string;
  bounceCount: number;
}

export interface VisibleShot extends ShotTrace {
  ownerId: Combatant["id"];
  targetId?: Combatant["id"];
  damage: number;
  age: number;
  totalLength: number;
  resolved: boolean;
  explosive: boolean;
  explosionTriggerAge?: number;
  explosionCenter?: Vector2;
  explosionRemaining: number;
  explosionDuration: number;
}
