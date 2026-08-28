import p5 from "p5";
import arenaTemplateData from "../maps/arena-01.json";
import {
  BOT_MAX_REFLECTIONS,
  BOT_REACTION_MAX,
  BOT_REACTION_MIN,
  BOT_SPEED,
  EXPLOSION_DELAY,
  EXPLOSION_DAMAGE_MULTIPLIER,
  EXPLOSION_RADIUS,
  EXPLOSION_VISIBLE_TIME,
  HIT_FLASH_TIME,
  LASER_SPEED,
  LASER_TRAIL_LENGTH,
  MAX_HP,
  MAX_REFLECTIONS,
  MIRROR_COLLISION_PADDING,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SHOT_COOLDOWN,
  SHOT_DAMAGE,
  SHOT_LINGER_TIME,
  SPLIT_ANGLE,
  SPLIT_DAMAGE_MULTIPLIER,
} from "./constants";
import type { ArenaMap, ArenaSettings, Combatant, GameStatus, MirrorType, ShotTrace, Vector2, VisibleShot, Wall } from "./types";
import { DEFAULT_ARENA_SETTINGS, generateArena } from "./arenaGenerator";
import { circleIntersectsRectangle, circleIntersectsSegment } from "../physics/collision";
import { traceShot } from "../physics/raycast";
import { add, distance, fromAngle, normalize, scale, subtract } from "../physics/vector";
import { AudioDirector } from "../audio/AudioDirector";

const template = arenaTemplateData as ArenaMap;
const mirrorColors: Record<MirrorType, string> = {
  STANDARD: "#b9d3c2",
  SPLITTER: "#d8a53b",
  EXPLOSIVE: "#8f729d",
};

const COMBATANT_ART_WIDTH = 44;
const COMBATANT_ART_HEIGHT = 63;
const FIRE_ANIMATION_TIME = 0.28;
const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

type CombatantAnimation = {
  movement: number;
  stepPhase: number;
  fireRemaining: number;
};

type EditorSelection =
  | { kind: "wall"; id: string; offset: Vector2 }
  | { kind: "mirror"; id: string; offset: Vector2 };

export class Game {
  private arena!: ArenaMap;
  private rayWalls: Wall[] = [];
  private player!: Combatant;
  private bot!: Combatant;
  private status: GameStatus = "PLAYING";
  private shots: VisibleShot[] = [];
  private botDecisionRemaining = 0;
  private botDestination: Vector2 = { x: 0, y: 0 };
  private botDestinationRemaining = 0;
  private botAimAngle = Math.PI;
  private botMirrorTurnRemaining = 2.8;
  private debug = false;
  private previousF1 = false;
  private playerArt!: p5.Image;
  private botArt!: p5.Image;
  private assetsReady = false;
  private soundedImpacts = new WeakMap<VisibleShot, Set<string>>();
  private readonly pressedMovementKeys = new Set<string>();
  private started = false;
  private arenaSettings: ArenaSettings = {
    ...DEFAULT_ARENA_SETTINGS,
    mirrorCount: 3,
    furnitureCount: 6,
    layout: "BALANCED",
  };
  private arenaSeed = Math.floor(Math.random() * 2147483646) + 1;
  private editorSelection: EditorSelection | null = null;
  private editorDragging = false;
  private editorObjectSequence = 0;
  private mirrorTurnFlashes = new Map<string, number>();
  private combatantAnimations: Record<Combatant["id"], CombatantAnimation> = {
    player: { movement: 0, stepPhase: 0, fireRemaining: 0 },
    bot: { movement: 0, stepPhase: Math.PI, fireRemaining: 0 },
  };

  private readonly handleNativeKeyDown = (event: KeyboardEvent): void => {
    if (!this.started) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
      this.pressedMovementKeys.add(event.code);
    }
  };

  private readonly handleNativeKeyUp = (event: KeyboardEvent): void => {
    this.pressedMovementKeys.delete(event.code);
  };

  constructor(private readonly p: p5, private readonly audio: AudioDirector) {
    this.reset(false);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.audio.unlock();
    this.prepareRound(true);
  }

  configureArena(settings: Partial<ArenaSettings>): void {
    if (this.started) return;
    this.arenaSettings = { ...this.arenaSettings, ...settings };
    this.reset(false);
  }

  rerollArena(): void {
    if (this.started) return;
    this.arenaSeed = Math.floor(Math.random() * 2147483646) + 1;
    this.reset(false);
  }

  rotateEditorSelection(direction: -1 | 1): void {
    if (!this.started) this.rotateSelectedObject(direction * Math.PI / 36);
  }

  getArenaCounts(): Pick<ArenaSettings, "mirrorCount" | "furnitureCount"> {
    return { mirrorCount: this.arena.mirrors.length, furnitureCount: this.arena.walls.length };
  }

  addEditorObject(kind: EditorSelection["kind"]): void {
    if (this.started) return;
    const index = kind === "mirror" ? this.arena.mirrors.length : this.arena.walls.length;
    const limit = kind === "mirror" ? 12 : 10;
    if (index >= limit) return;
    const point = this.editorInsertionPoint(index);
    this.editorObjectSequence += 1;

    if (kind === "mirror") {
      const mirrorTypes: MirrorType[] = ["STANDARD", "SPLITTER", "EXPLOSIVE"];
      const length = Math.min(this.arena.width, this.arena.height) * 0.115 * this.arenaSettings.mirrorScale;
      const angle = (index % 6) * Math.PI / 6;
      const half = scale(fromAngle(angle), length / 2);
      const mirror: ArenaMap["mirrors"][number] = {
        id: `mirror-custom-${this.editorObjectSequence}`,
        type: mirrorTypes[index % mirrorTypes.length],
        start: subtract(point, half),
        end: add(point, half),
      };
      this.keepMirrorInsideArena(mirror);
      this.arena.mirrors.push(mirror);
      this.editorSelection = { kind: "mirror", id: mirror.id, offset: { x: 0, y: 0 } };
    } else {
      const furniture = [
        { name: "sofa", width: 142, height: 66 },
        { name: "round-table", width: 78, height: 78 },
        { name: "luggage-cart", width: 104, height: 62 },
      ][index % 3];
      const wall: Wall = {
        id: `${furniture.name}-custom-${this.editorObjectSequence}`,
        x: point.x - furniture.width * this.arenaSettings.furnitureScale / 2,
        y: point.y - furniture.height * this.arenaSettings.furnitureScale / 2,
        width: furniture.width * this.arenaSettings.furnitureScale,
        height: furniture.height * this.arenaSettings.furnitureScale,
        rotation: 0,
      };
      this.keepWallInsideArena(wall);
      this.arena.walls.push(wall);
      this.editorSelection = { kind: "wall", id: wall.id, offset: { x: 0, y: 0 } };
    }
    this.editorDragging = false;
    this.arenaSettings.mirrorCount = this.arena.mirrors.length;
    this.arenaSettings.furnitureCount = this.arena.walls.length;
  }

  deleteEditorSelection(): void {
    if (this.started || !this.editorSelection) return;
    if (this.editorSelection.kind === "mirror") {
      this.arena.mirrors = this.arena.mirrors.filter((item) => item.id !== this.editorSelection?.id);
    } else {
      this.arena.walls = this.arena.walls.filter((item) => item.id !== this.editorSelection?.id);
    }
    this.editorSelection = null;
    this.editorDragging = false;
    this.arenaSettings.mirrorCount = this.arena.mirrors.length;
    this.arenaSettings.furnitureCount = this.arena.walls.length;
  }

  private editorInsertionPoint(index: number): Vector2 {
    const columns = 4;
    return {
      x: this.arena.width * (0.38 + (index % columns) * 0.12),
      y: this.arena.height * (0.42 + (Math.floor(index / columns) % 2) * 0.18),
    };
  }

  setup(): void {
    const canvas = this.p.createCanvas(template.width, template.height);
    canvas.parent("canvas-wrap");
    void this.loadAssets();
    this.p.frameRate(60);
    this.p.strokeCap(this.p.ROUND);
    window.addEventListener("keydown", this.handleNativeKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleNativeKeyUp);
    window.addEventListener("blur", () => this.pressedMovementKeys.clear());
  }

  reset(playSound = true): void {
    this.arena = generateArena(template, this.seededRandom(this.arenaSeed), this.arenaSettings);
    this.editorSelection = null;
    this.prepareRound(playSound);
  }

  private prepareRound(playSound: boolean): void {
    this.rayWalls = [
      ...this.arena.walls,
      { id: "edge-top", x: 0, y: -2, width: this.arena.width, height: 2 },
      { id: "edge-right", x: this.arena.width, y: 0, width: 2, height: this.arena.height },
      { id: "edge-bottom", x: 0, y: this.arena.height, width: this.arena.width, height: 2 },
      { id: "edge-left", x: -2, y: 0, width: 2, height: this.arena.height },
    ];
    this.player = this.createCombatant("player", this.arena.playerSpawn);
    this.bot = this.createCombatant("bot", this.arena.botSpawn);
    this.status = "PLAYING";
    this.shots = [];
    this.botDecisionRemaining = 1.2;
    this.botDestination = this.pickBotDestination();
    this.botDestinationRemaining = this.p.random(1.8, 3.8);
    this.botMirrorTurnRemaining = this.p.random(2.4, 3.8);
    this.mirrorTurnFlashes.clear();
    this.combatantAnimations = {
      player: { movement: 0, stepPhase: 0, fireRemaining: 0 },
      bot: { movement: 0, stepPhase: Math.PI, fireRemaining: 0 },
    };
    if (playSound) this.audio.roundStart();
  }

  updateAndDraw(): void {
    if (!this.assetsReady) {
      this.drawLoading();
      return;
    }
    const dt = Math.min(this.p.deltaTime / 1000, 0.05);
    this.handleDebugToggle();
    if (this.started && this.status === "PLAYING") this.update(dt);
    const lowestHealth = Math.min(this.player.hp, this.bot.hp) / MAX_HP;
    this.audio.update(1 - lowestHealth, this.status === "PLAYING");
    this.draw();
  }

  private async loadAssets(): Promise<void> {
    [this.playerArt, this.botArt] = await Promise.all([
      this.p.loadImage(assetUrl("assets/manor/magician-player.png")),
      this.p.loadImage(assetUrl("assets/manor/magician-bot.png")),
    ]);
    this.assetsReady = true;
  }

  private drawLoading(): void {
    this.p.background("#e9c979");
    this.p.noStroke(); this.p.fill("#573b32"); this.p.textFont("Georgia");
    this.p.textAlign(this.p.CENTER, this.p.CENTER); this.p.textSize(18);
    this.p.text("OYUN HAZIRLANIYOR…", template.width / 2, template.height / 2);
  }

  handleMousePressed(event?: Event): boolean {
    // Returning false here makes p5 cancel native clicks and range dragging.
    if (!this.started) {
      if (!(event?.target instanceof HTMLCanvasElement)) return true;
      this.selectEditorObject();
      return false;
    }
    this.audio.unlock();
    if (this.status !== "PLAYING") {
      this.reset();
      return false;
    }
    this.tryPlayerFire();
    return false;
  }

  handleMouseDragged(): boolean {
    if (this.started || !this.editorSelection || !this.editorDragging) return true;
    const mouse = {
      x: this.p.constrain(this.p.mouseX, 0, this.arena.width),
      y: this.p.constrain(this.p.mouseY, 0, this.arena.height),
    };
    const target = subtract(mouse, this.editorSelection.offset);
    if (this.editorSelection.kind === "wall") {
      const wall = this.arena.walls.find((item) => item.id === this.editorSelection?.id);
      if (!wall) return false;
      const rotation = wall.rotation ?? 0;
      const extentX = Math.abs(Math.cos(rotation)) * wall.width / 2 + Math.abs(Math.sin(rotation)) * wall.height / 2;
      const extentY = Math.abs(Math.sin(rotation)) * wall.width / 2 + Math.abs(Math.cos(rotation)) * wall.height / 2;
      const centerX = this.p.constrain(target.x, 28 + extentX, this.arena.width - 28 - extentX);
      const centerY = this.p.constrain(target.y, 42 + extentY, this.arena.height - 28 - extentY);
      wall.x = centerX - wall.width / 2;
      wall.y = centerY - wall.height / 2;
    } else {
      const mirror = this.arena.mirrors.find((item) => item.id === this.editorSelection?.id);
      if (!mirror) return false;
      const center = this.mirrorCenter(mirror);
      const delta = subtract(target, center);
      mirror.start = add(mirror.start, delta);
      mirror.end = add(mirror.end, delta);
      this.keepMirrorInsideArena(mirror);
    }
    return false;
  }

  handleMouseReleased(): boolean {
    this.editorDragging = false;
    return !this.started;
  }

  handleKeyPressed(): boolean {
    // Let native setup controls (range/select) handle arrows, Space and Enter
    // before the duel starts. Returning false makes p5 preventDefault globally.
    if (!this.started) {
      const key = this.p.key.toLowerCase();
      if ((key === "q" || key === "e") && this.editorSelection) {
        this.rotateSelectedObject(key === "q" ? -Math.PI / 36 : Math.PI / 36);
        return false;
      }
      return true;
    }
    this.audio.unlock();
    if ([37, 38, 39, 40].includes(this.p.keyCode)) {
      return false;
    }
    if (this.p.keyCode === 32) {
      if (this.status === "PLAYING") this.tryPlayerFire();
      else this.reset();
      return false;
    }
    const key = this.p.key.toLowerCase();
    if (this.status === "PLAYING" && (key === "q" || key === "e")) {
      this.rotateNearbyMirror(this.player, key === "q" ? -1 : 1);
      return false;
    }
    return true;
  }

  private tryPlayerFire(): void {
    if (this.player.cooldownRemaining > 0 || !this.isMouseInsideArena()) return;
    const direction = normalize(subtract({ x: this.p.mouseX, y: this.p.mouseY }, this.player.position));
    this.fire(this.player, this.bot, direction, MAX_REFLECTIONS);
  }

  private createCombatant(id: Combatant["id"], position: Vector2): Combatant {
    return { id, position: { ...position }, radius: PLAYER_RADIUS, hp: MAX_HP, cooldownRemaining: 0, flashRemaining: 0 };
  }

  private update(dt: number): void {
    const playerBefore = { ...this.player.position };
    this.updatePlayerMovement(dt);
    const botBefore = { ...this.bot.position };
    this.updateBot(dt);
    this.updateCombatantAnimation("player", distance(playerBefore, this.player.position), PLAYER_SPEED, dt);
    this.updateCombatantAnimation("bot", distance(botBefore, this.bot.position), BOT_SPEED, dt);
    for (const combatant of [this.player, this.bot]) {
      combatant.cooldownRemaining = Math.max(0, combatant.cooldownRemaining - dt);
      combatant.flashRemaining = Math.max(0, combatant.flashRemaining - dt);
    }
    for (const [id, remaining] of this.mirrorTurnFlashes) {
      const next = remaining - dt;
      if (next <= 0) this.mirrorTurnFlashes.delete(id);
      else this.mirrorTurnFlashes.set(id, next);
    }

    for (const shot of this.shots) {
      const previousDistance = Math.max(0, Math.min(shot.age * LASER_SPEED, shot.totalLength));
      shot.age += dt;
      shot.explosionRemaining = Math.max(0, shot.explosionRemaining - dt);
      if (shot.age < 0 || shot.resolved) continue;

      const currentDistance = Math.min(shot.age * LASER_SPEED, shot.totalLength);
      this.soundMirrorImpacts(shot, previousDistance, currentDistance);
      const explosionArmed = shot.explosionTriggerAge !== undefined
        && shot.age >= shot.explosionTriggerAge - EXPLOSION_DELAY;

      if (shot.explosive && explosionArmed) {
        if (this.shotHitsMovingTarget(shot, previousDistance, currentDistance)) {
          shot.totalLength = currentDistance;
        }
        if (shot.explosionTriggerAge !== undefined && shot.age >= shot.explosionTriggerAge) {
          const explosionDistance = Math.min(shot.explosionTriggerAge * LASER_SPEED, shot.totalLength);
          shot.totalLength = explosionDistance;
          this.resolveShot(shot, false);
        }
      } else if (this.shotHitsMovingTarget(shot, previousDistance, currentDistance)) {
        shot.totalLength = currentDistance;
        this.resolveShot(shot, true);
      } else if (currentDistance >= shot.totalLength) {
        this.resolveShot(shot, false);
      }
    }
    this.shots = this.shots.filter((shot) => {
      if (shot.age < 0) return true;
      if (!shot.resolved) return true;
      return shot.explosionRemaining > 0 || shot.age <= shot.totalLength / LASER_SPEED + SHOT_LINGER_TIME;
    });
  }

  private updatePlayerMovement(dt: number): void {
    const horizontal = Number(this.pressedMovementKeys.has("KeyD") || this.pressedMovementKeys.has("ArrowRight")) - Number(this.pressedMovementKeys.has("KeyA") || this.pressedMovementKeys.has("ArrowLeft"));
    const vertical = Number(this.pressedMovementKeys.has("KeyS") || this.pressedMovementKeys.has("ArrowDown")) - Number(this.pressedMovementKeys.has("KeyW") || this.pressedMovementKeys.has("ArrowUp"));
    const direction = normalize({ x: horizontal, y: vertical });
    this.moveCombatant(this.player, scale(direction, PLAYER_SPEED * dt));
  }

  private updateBot(dt: number): void {
    this.botDestinationRemaining -= dt;
    if (distance(this.bot.position, this.botDestination) < 28 || this.botDestinationRemaining <= 0) {
      this.botDestination = this.pickBotDestination();
      this.botDestinationRemaining = this.p.random(1.8, 4.2);
    }
    const moveDirection = normalize(subtract(this.botDestination, this.bot.position));
    const before = { ...this.bot.position };
    this.moveCombatant(this.bot, scale(moveDirection, BOT_SPEED * dt));
    if (distance(before, this.bot.position) < 0.2) this.botDestinationRemaining = 0;

    this.botMirrorTurnRemaining -= dt;
    if (this.botMirrorTurnRemaining <= 0) {
      const mirror = this.nearestMirror(this.bot, 112);
      if (mirror) {
        this.turnMirror(mirror, this.p.random() < 0.5 ? -1 : 1);
        this.botMirrorTurnRemaining = this.p.random(2.8, 4.5);
        this.botDestinationRemaining = 0;
      } else {
        this.botMirrorTurnRemaining = 0.55;
      }
    }

    this.botDecisionRemaining -= dt;
    if (this.botDecisionRemaining > 0) return;
    this.botDecisionRemaining = this.p.random(BOT_REACTION_MIN, BOT_REACTION_MAX);
    if (this.bot.cooldownRemaining > 0 || this.p.random() < 0.35) return;

    const candidate = this.findBotShot();
    if (!candidate) return;
    this.botAimAngle = candidate.angle;
    const aimError = this.p.random(-0.045, 0.045);
    this.fire(this.bot, this.player, fromAngle(candidate.angle + aimError), BOT_MAX_REFLECTIONS);
  }

  private updateCombatantAnimation(id: Combatant["id"], travelled: number, speed: number, dt: number): void {
    const animation = this.combatantAnimations[id];
    const targetMovement = dt > 0 ? this.p.constrain(travelled / (speed * dt), 0, 1) : 0;
    const response = targetMovement > animation.movement ? 16 : 8;
    animation.movement += (targetMovement - animation.movement) * (1 - Math.exp(-response * dt));
    animation.stepPhase += dt * (7 + animation.movement * 6);
    animation.fireRemaining = Math.max(0, animation.fireRemaining - dt);
  }

  private pickBotDestination(): Vector2 {
    if (this.arena?.mirrors.length > 0 && this.p.random() < 0.42) {
      const mirror = this.arena.mirrors[Math.floor(this.p.random(this.arena.mirrors.length))];
      const center = this.mirrorCenter(mirror);
      const tangent = normalize(subtract(mirror.end, mirror.start));
      const normal = { x: -tangent.y, y: tangent.x };
      const side = this.p.random() < 0.5 ? -1 : 1;
      const candidate = add(center, scale(normal, side * 78));
      if (!this.positionBlocked(candidate, this.bot?.radius ?? PLAYER_RADIUS)) return candidate;
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = {
        x: this.p.random(90, this.arena.width - 90),
        y: this.p.random(100, this.arena.height - 70),
      };
      if (!this.positionBlocked(candidate, this.bot?.radius ?? PLAYER_RADIUS)) return candidate;
    }
    return { ...this.arena.botSpawn };
  }

  private findBotShot(): { angle: number; trace: ShotTrace } | null {
    if (this.p.random() < 0.18) {
      const angle = this.p.random(0, Math.PI * 2);
      return { angle, trace: this.traceAimFor(this.bot, this.player, fromAngle(angle), BOT_MAX_REFLECTIONS) };
    }

    const directAngle = Math.atan2(this.player.position.y - this.bot.position.y, this.player.position.x - this.bot.position.x);
    const directTrace = this.traceAimFor(this.bot, this.player, fromAngle(directAngle), BOT_MAX_REFLECTIONS);
    if (directTrace.hitTargetId === this.player.id) return { angle: directAngle, trace: directTrace };

    const candidates: Array<{ angle: number; trace: ShotTrace }> = [];
    for (let degrees = 0; degrees < 360; degrees += 6) {
      const angle = (degrees * Math.PI) / 180;
      const trace = this.traceAimFor(this.bot, this.player, fromAngle(angle), BOT_MAX_REFLECTIONS);
      if (trace.hitTargetId === this.player.id && trace.bounceCount > 0) candidates.push({ angle, trace });
    }
    return candidates.length > 0 ? candidates[Math.floor(this.p.random(candidates.length))] : null;
  }

  private moveCombatant(combatant: Combatant, delta: Vector2): void {
    const nextX = { x: this.p.constrain(combatant.position.x + delta.x, combatant.radius, this.arena.width - combatant.radius), y: combatant.position.y };
    if (!this.positionBlocked(nextX, combatant.radius)) combatant.position.x = nextX.x;
    const nextY = { x: combatant.position.x, y: this.p.constrain(combatant.position.y + delta.y, combatant.radius, this.arena.height - combatant.radius) };
    if (!this.positionBlocked(nextY, combatant.radius)) combatant.position.y = nextY.y;
  }

  private positionBlocked(position: Vector2, radius: number): boolean {
    if (this.arena.walls.some((wall) => circleIntersectsRectangle(position, radius, wall))) return true;
    return this.arena.mirrors.some((mirror) =>
      circleIntersectsSegment(
        position,
        radius + MIRROR_COLLISION_PADDING,
        mirror.start,
        mirror.end,
      ),
    );
  }

  private shotHitsMovingTarget(shot: VisibleShot, startDistance: number, endDistance: number): boolean {
    if (endDistance <= startDistance) return false;
    const target = shot.targetId === "player" ? this.player : this.bot;
    const travelledPath = this.pathSlice(shot.points, startDistance, endDistance);
    for (let index = 1; index < travelledPath.length; index += 1) {
      if (
        circleIntersectsSegment(
          target.position,
          target.radius,
          travelledPath[index - 1],
          travelledPath[index],
        )
      ) return true;
    }
    return false;
  }

  private fire(shooter: Combatant, target: Combatant, direction: Vector2, maxReflections: number): void {
    const trace = this.traceGeometry(shooter.position, direction, maxReflections);
    shooter.cooldownRemaining = SHOT_COOLDOWN;
    this.combatantAnimations[shooter.id].fireRemaining = FIRE_ANIMATION_TIME;
    this.audio.fire(shooter.id);
    this.shots.push(this.createVisibleShot(trace, shooter.id, target.id, SHOT_DAMAGE, 0));

    for (const impact of trace.mirrorImpacts.filter((item) => item.type === "SPLITTER")) {
      const delay = this.distanceAlongPath(trace.points, impact.point) / LASER_SPEED;
      for (const angleOffset of [-SPLIT_ANGLE, SPLIT_ANGLE]) {
        const direction = this.rotate(impact.outgoingDirection, angleOffset);
        const branchOrigin = add(impact.point, scale(direction, 0.02));
        const branchTrace = this.traceGeometry(branchOrigin, direction, Math.max(0, maxReflections - 1));
        this.shots.push(
          this.createVisibleShot(
            branchTrace,
            shooter.id,
            target.id,
            SHOT_DAMAGE * SPLIT_DAMAGE_MULTIPLIER,
            -delay,
          ),
        );
      }
    }
  }

  private createVisibleShot(
    trace: ShotTrace,
    ownerId: Combatant["id"],
    targetId: Combatant["id"],
    damage: number,
    age: number,
  ): VisibleShot {
    const explosiveImpact = trace.mirrorImpacts.find((impact) => impact.type === "EXPLOSIVE");
    return {
      ...trace,
      ownerId,
      targetId,
      damage: Math.round(damage),
      age,
      totalLength: this.pathLength(trace.points),
      resolved: false,
      explosive: explosiveImpact !== undefined,
      explosionTriggerAge: explosiveImpact
        ? this.distanceAlongPath(trace.points, explosiveImpact.point) / LASER_SPEED + EXPLOSION_DELAY
        : undefined,
      explosionRemaining: 0,
      explosionDuration: EXPLOSION_VISIBLE_TIME,
    };
  }

  private resolveShot(shot: VisibleShot, hitTarget: boolean): void {
    shot.resolved = true;
    const explosionArmed = shot.explosionTriggerAge !== undefined
      && shot.age >= shot.explosionTriggerAge - EXPLOSION_DELAY;
    if (shot.explosive && explosionArmed) {
      const center = this.pointAtDistance(shot.points, shot.totalLength);
      shot.explosionCenter = center;
      this.audio.explosion(this.panFor(center.x));
      shot.explosionRemaining = EXPLOSION_VISIBLE_TIME;
      const target = shot.targetId === "player" ? this.player : this.bot;
      if (distance(center, target.position) <= EXPLOSION_RADIUS + target.radius) {
        this.applyDamage(target, Math.round(shot.damage * EXPLOSION_DAMAGE_MULTIPLIER));
      }
      return;
    }
    if (!hitTarget) {
      this.audio.wallImpact();
      return;
    }
    const target = shot.targetId === "player" ? this.player : this.bot;
    this.applyDamage(target, shot.damage);
  }

  private applyDamage(target: Combatant, damage: number): void {
    const previousStatus = this.status;
    target.hp = Math.max(0, target.hp - damage);
    target.flashRemaining = HIT_FLASH_TIME;
    this.audio.hit(target.id);
    if (target.hp === 0) this.status = target.id === "bot" ? "WON" : "LOST";
    if (previousStatus === "PLAYING" && this.status !== "PLAYING") this.audio.end(this.status === "WON");
  }

  private soundMirrorImpacts(shot: VisibleShot, previousDistance: number, currentDistance: number): void {
    let sounded = this.soundedImpacts.get(shot);
    if (!sounded) {
      sounded = new Set();
      this.soundedImpacts.set(shot, sounded);
    }
    for (const impact of shot.mirrorImpacts) {
      const impactDistance = this.distanceAlongPath(shot.points, impact.point);
      if (impactDistance > previousDistance && impactDistance <= currentDistance && !sounded.has(impact.mirrorId)) {
        sounded.add(impact.mirrorId);
        this.audio.ricochet(impact.type, this.panFor(impact.point.x));
      }
    }
  }

  private panFor(x: number): number {
    return this.p.constrain((x / this.arena.width) * 2 - 1, -0.8, 0.8);
  }

  private traceAimFor(shooter: Combatant, target: Combatant, direction: Vector2, maxReflections: number): ShotTrace {
    return traceShot(shooter.position, direction, this.arena.mirrors, this.rayWalls, [{ id: target.id, center: target.position, radius: target.radius }], maxReflections);
  }

  private traceGeometry(origin: Vector2, direction: Vector2, maxReflections: number): ShotTrace {
    return traceShot(origin, direction, this.arena.mirrors, this.rayWalls, [], maxReflections);
  }

  private handleDebugToggle(): void {
    const pressed = this.p.keyIsDown(112);
    if (pressed && !this.previousF1) this.debug = !this.debug;
    this.previousF1 = pressed;
  }

  private draw(): void {
    this.drawBackground();
    this.drawWalls();
    this.drawMirrors();
    if (this.started && this.status === "PLAYING" && this.isMouseInsideArena()) this.drawPreview();
    for (const shot of this.shots) this.drawShot(shot);
    this.drawCombatant(this.player, this.mouseAimAngle(), this.playerArt);
    this.drawCombatant(this.bot, this.botAimAngle, this.botArt);
    if (this.started && this.status === "PLAYING") this.drawMirrorInteractionHint();
    if (this.started) this.drawHud();
    else this.drawEditorOverlay();
    if (this.debug) this.drawDebug();
    if (this.status !== "PLAYING") this.drawEndScreen();
  }

  private selectEditorObject(): void {
    if (!this.isMouseInsideArena()) return;
    const point = { x: this.p.mouseX, y: this.p.mouseY };
    const mirror = [...this.arena.mirrors].reverse().find((item) =>
      circleIntersectsSegment(point, 30, item.start, item.end),
    );
    if (mirror) {
      this.editorSelection = { kind: "mirror", id: mirror.id, offset: subtract(point, this.mirrorCenter(mirror)) };
      this.editorDragging = true;
      return;
    }
    const wall = [...this.arena.walls].reverse().find((item) => circleIntersectsRectangle(point, 12, item));
    this.editorSelection = wall
      ? { kind: "wall", id: wall.id, offset: subtract(point, { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 }) }
      : null;
    this.editorDragging = wall !== undefined;
  }

  private rotateSelectedObject(angle: number): void {
    if (!this.editorSelection) return;
    if (this.editorSelection.kind === "wall") {
      const wall = this.arena.walls.find((item) => item.id === this.editorSelection?.id);
      if (!wall) return;
      wall.rotation = (wall.rotation ?? 0) + angle;
      this.keepWallInsideArena(wall);
      return;
    }
    const mirror = this.arena.mirrors.find((item) => item.id === this.editorSelection?.id);
    if (!mirror) return;
    this.rotateMirrorGeometry(mirror, angle);
  }

  private nearestMirror(combatant: Combatant, maximumDistance: number): ArenaMap["mirrors"][number] | undefined {
    return this.arena.mirrors
      .map((mirror) => ({ mirror, proximity: distance(combatant.position, this.mirrorCenter(mirror)) }))
      .filter(({ proximity }) => proximity <= maximumDistance)
      .sort((a, b) => a.proximity - b.proximity)[0]?.mirror;
  }

  private rotateNearbyMirror(combatant: Combatant, direction: -1 | 1): void {
    const mirror = this.nearestMirror(combatant, 118);
    if (!mirror) return;
    this.turnMirror(mirror, direction);
  }

  private turnMirror(mirror: ArenaMap["mirrors"][number], direction: -1 | 1): void {
    this.rotateMirrorGeometry(mirror, direction * Math.PI / 12);
    this.mirrorTurnFlashes.set(mirror.id, 0.38);
    this.audio.ricochet(mirror.type, this.panFor(this.mirrorCenter(mirror).x));
  }

  private rotateMirrorGeometry(mirror: ArenaMap["mirrors"][number], angle: number): void {
    const center = this.mirrorCenter(mirror);
    const half = scale(subtract(mirror.end, mirror.start), 0.5);
    const rotated = this.rotate(half, angle);
    mirror.start = subtract(center, rotated);
    mirror.end = add(center, rotated);
    this.keepMirrorInsideArena(mirror);
  }

  private keepWallInsideArena(wall: Wall): void {
    const rotation = wall.rotation ?? 0;
    const extentX = Math.abs(Math.cos(rotation)) * wall.width / 2 + Math.abs(Math.sin(rotation)) * wall.height / 2;
    const extentY = Math.abs(Math.sin(rotation)) * wall.width / 2 + Math.abs(Math.cos(rotation)) * wall.height / 2;
    const centerX = this.p.constrain(wall.x + wall.width / 2, 28 + extentX, this.arena.width - 28 - extentX);
    const centerY = this.p.constrain(wall.y + wall.height / 2, 42 + extentY, this.arena.height - 28 - extentY);
    wall.x = centerX - wall.width / 2;
    wall.y = centerY - wall.height / 2;
  }

  private keepMirrorInsideArena(mirror: ArenaMap["mirrors"][number]): void {
    const padding = 28;
    const minX = Math.min(mirror.start.x, mirror.end.x);
    const maxX = Math.max(mirror.start.x, mirror.end.x);
    const minY = Math.min(mirror.start.y, mirror.end.y);
    const maxY = Math.max(mirror.start.y, mirror.end.y);
    const dx = minX < padding ? padding - minX : maxX > this.arena.width - padding ? this.arena.width - padding - maxX : 0;
    const dy = minY < padding ? padding - minY : maxY > this.arena.height - padding ? this.arena.height - padding - maxY : 0;
    mirror.start.x += dx; mirror.end.x += dx;
    mirror.start.y += dy; mirror.end.y += dy;
  }

  private mirrorCenter(mirror: ArenaMap["mirrors"][number]): Vector2 {
    return { x: (mirror.start.x + mirror.end.x) / 2, y: (mirror.start.y + mirror.end.y) / 2 };
  }

  private drawEditorOverlay(): void {
    if (!this.editorSelection) return;
    this.p.push();
    this.p.noFill(); this.p.stroke(255, 224, 143, 235); this.p.strokeWeight(3);
    const wall = this.editorSelection.kind === "wall"
      ? this.arena.walls.find((item) => item.id === this.editorSelection?.id)
      : undefined;
    const mirror = this.editorSelection.kind === "mirror"
      ? this.arena.mirrors.find((item) => item.id === this.editorSelection?.id)
      : undefined;
    if (wall) {
      this.p.push();
      this.p.translate(wall.x + wall.width / 2, wall.y + wall.height / 2);
      this.p.rotate(wall.rotation ?? 0);
      this.p.rect(-wall.width / 2 - 8, -wall.height / 2 - 8, wall.width + 16, wall.height + 16, 8);
      this.p.pop();
    }
    if (mirror) {
      this.p.strokeWeight(4);
      this.p.line(mirror.start.x, mirror.start.y, mirror.end.x, mirror.end.y);
      for (const point of [mirror.start, mirror.end]) {
        this.p.fill(255, 224, 143); this.p.noStroke(); this.p.circle(point.x, point.y, 11);
      }
    }
    this.p.pop();
  }

  private drawBackground(): void {
    this.p.push();
    this.p.background("#e9c979");
    this.p.noStroke();
    this.p.fill("#d98f7a"); this.p.rect(0, 0, this.arena.width, 118);
    this.p.fill("#f2dfad"); this.p.rect(0, 118, this.arena.width, this.arena.height - 118);
    this.p.fill("#6d9b8f"); this.p.rect(0, 118, this.arena.width, 11);

    const tile = 100;
    for (let row = 0, y = 129; y < this.arena.height; row += 1, y += tile) {
      for (let column = 0, x = 0; x < this.arena.width; column += 1, x += tile) {
        this.p.fill((column + row) % 2 === 0 ? "#efd9a3" : "#e5cc92");
        this.p.rect(x, y, tile, tile);
      }
    }
    this.p.stroke("#d1ad72"); this.p.strokeWeight(1);
    for (let x = 0; x <= this.arena.width; x += tile) this.p.line(x, 129, x, this.arena.height);
    for (let y = 129; y <= this.arena.height; y += tile) this.p.line(0, y, this.arena.width, y);

    this.p.noStroke(); this.p.fill("#c76f67"); this.p.rect(455, 26, 290, 82, 42, 42, 0, 0);
    this.p.fill("#573b32"); this.p.rect(480, 46, 240, 62, 30, 30, 0, 0);
    this.p.fill("#f1d589"); this.p.circle(600, 72, 30);
    this.p.fill("#d98f7a"); this.p.circle(600, 72, 13);
    for (const x of [68, 1052]) {
      this.p.fill("#6d9b8f"); this.p.rect(x, 34, 80, 74, 5, 5, 0, 0);
      this.p.fill("#2e5c59"); this.p.rect(x + 12, 47, 56, 61, 3, 3, 0, 0);
      this.p.fill("#f2dfad"); this.p.circle(x + (x < 600 ? 62 : 18), 80, 7);
    }

    this.p.noFill(); this.p.stroke("#573b32"); this.p.strokeWeight(4);
    this.p.rect(20, 20, this.arena.width - 40, this.arena.height - 40, 8);
    this.p.stroke("#fff1c7"); this.p.strokeWeight(2);
    this.p.rect(29, 29, this.arena.width - 58, this.arena.height - 58, 6);
    this.p.pop();
  }

  private drawWalls(): void {
    for (const wall of this.arena.walls) {
      this.drawFurniture(wall);
    }
  }

  private drawFurniture(wall: Wall): void {
    this.p.push();
    this.p.translate(wall.x + wall.width / 2, wall.y + wall.height / 2);
    this.p.rotate(wall.rotation ?? 0);
    this.p.noStroke(); this.p.fill(87, 59, 50, 42);
    this.p.ellipse(7, wall.height * .43, wall.width + 18, 17);

    if (wall.id.includes("round-table")) {
      const diameter = Math.min(wall.width, wall.height);
      this.p.stroke("#573b32"); this.p.strokeWeight(4); this.p.fill("#f4dda0");
      this.p.circle(0, 0, diameter - 3);
      this.p.stroke("#d98f7a"); this.p.strokeWeight(7); this.p.noFill();
      this.p.circle(0, 0, diameter * .66);
      this.p.noStroke(); this.p.fill("#6d9b8f"); this.p.circle(0, 0, diameter * .28);
      this.p.fill("#f7e9bd");
      for (let index = 0; index < 6; index += 1) {
        const angle = index * Math.PI / 3;
        this.p.circle(Math.cos(angle) * diameter * .25, Math.sin(angle) * diameter * .25, 6);
      }
    } else if (wall.id.includes("luggage-cart")) {
      this.p.stroke("#573b32"); this.p.strokeWeight(4); this.p.fill("#e3b85f");
      this.p.rect(-wall.width / 2, -wall.height / 2, wall.width, wall.height, 16);
      this.p.stroke("#f7e9bd"); this.p.strokeWeight(3); this.p.noFill();
      this.p.arc(0, -wall.height * .04, wall.width * .62, wall.height * 1.05, Math.PI, Math.PI * 2);
      this.p.line(-wall.width * .31, 2, -wall.width * .31, wall.height * .3);
      this.p.line(wall.width * .31, 2, wall.width * .31, wall.height * .3);
      this.p.noStroke();
      const cases = [
        { x: -wall.width * .22, y: wall.height * .12, w: wall.width * .32, h: wall.height * .34, color: "#6d9b8f" },
        { x: wall.width * .12, y: wall.height * .08, w: wall.width * .29, h: wall.height * .42, color: "#c76f67" },
      ];
      for (const suitcase of cases) {
        this.p.fill("#573b32"); this.p.rect(suitcase.x - suitcase.w / 2 - 2, suitcase.y - suitcase.h / 2 - 2, suitcase.w + 4, suitcase.h + 4, 4);
        this.p.fill(suitcase.color); this.p.rect(suitcase.x - suitcase.w / 2, suitcase.y - suitcase.h / 2, suitcase.w, suitcase.h, 3);
      }
      this.p.fill("#573b32"); this.p.circle(-wall.width * .31, wall.height * .45, 10); this.p.circle(wall.width * .31, wall.height * .45, 10);
    } else {
      this.p.stroke("#573b32"); this.p.strokeWeight(4); this.p.fill("#d98f7a");
      this.p.rect(-wall.width / 2, -wall.height / 2, wall.width, wall.height, 18);
      this.p.fill("#c76f67");
      this.p.rect(-wall.width * .37, -wall.height * .34, wall.width * .74, wall.height * .42, 11);
      this.p.stroke("#f7e9bd"); this.p.strokeWeight(2); this.p.noFill();
      this.p.line(0, -wall.height * .3, 0, wall.height * .32);
      for (const x of [-wall.width * .28, wall.width * .28]) this.p.arc(x, 4, wall.width * .22, wall.height * .42, Math.PI, Math.PI * 2);
      this.p.noStroke(); this.p.fill("#573b32");
      this.p.rect(-wall.width * .42, wall.height * .34, wall.width * .08, wall.height * .13, 2);
      this.p.rect(wall.width * .34, wall.height * .34, wall.width * .08, wall.height * .13, 2);
    }
    this.p.pop();
  }

  private drawMirrors(): void {
    for (const mirror of this.arena.mirrors) {
      const color = mirrorColors[mirror.type];
      const center = { x: (mirror.start.x + mirror.end.x) / 2, y: (mirror.start.y + mirror.end.y) / 2 };
      const length = distance(mirror.start, mirror.end);
      const angle = Math.atan2(mirror.end.y - mirror.start.y, mirror.end.x - mirror.start.x);
      const frameWidth = this.p.constrain(length * 0.24, 30, 42);
      const turning = this.mirrorTurnFlashes.get(mirror.id) ?? 0;
      const glow = this.p.color(color); glow.setAlpha(48 + turning * 380);
      this.p.stroke(glow); this.p.strokeWeight(frameWidth + 21 + turning * 15); this.p.line(mirror.start.x, mirror.start.y, mirror.end.x, mirror.end.y);
      this.p.push(); this.p.translate(center.x, center.y); this.p.rotate(angle - Math.PI / 2);
      this.p.rectMode(this.p.CENTER);
      this.p.noStroke(); this.p.fill(87, 59, 50, 55); this.p.ellipse(5, length * .51, frameWidth + 24, 13);
      this.p.fill("#573b32"); this.p.rect(0, 0, frameWidth + 13, length + 22, 18);
      this.p.fill("#e3b85f"); this.p.rect(0, 0, frameWidth + 7, length + 16, 16);
      this.p.fill(color); this.p.rect(0, 0, frameWidth - 1, length + 8, 13);
      this.p.fill(mirror.type === "STANDARD" ? "#cfe7df" : mirror.type === "SPLITTER" ? "#f5df9e" : "#d7c7de");
      this.p.rect(0, 0, frameWidth - 10, length - 3, 10);

      // Brass pivots make the mirror's new gameplay role visible at a glance.
      this.p.fill("#573b32"); this.p.circle(-frameWidth * .63, 0, 12); this.p.circle(frameWidth * .63, 0, 12);
      this.p.fill("#f4d88c"); this.p.circle(-frameWidth * .63, 0, 6); this.p.circle(frameWidth * .63, 0, 6);
      this.p.fill(255, 255, 255, 125);
      this.p.quad(-frameWidth * .22, -length * .38, frameWidth * .02, -length * .44, frameWidth * .18, length * .17, -frameWidth * .09, length * .27);
      if (mirror.type === "SPLITTER") {
        this.p.stroke("#8b622e"); this.p.strokeWeight(3); this.p.noFill();
        this.p.line(0, -18, 0, -2); this.p.line(0, -2, -9, 13); this.p.line(0, -2, 9, 13);
        this.p.line(-9, 13, -10, 6); this.p.line(-9, 13, -3, 11);
        this.p.line(9, 13, 10, 6); this.p.line(9, 13, 3, 11);
      } else if (mirror.type === "EXPLOSIVE") {
        const pulse = 22 + Math.sin(this.p.millis() * 0.006) * 4;
        this.p.noFill(); this.p.stroke("#8f729d"); this.p.strokeWeight(3); this.p.circle(0, 0, pulse);
        this.p.stroke("#684a70"); this.p.strokeWeight(2);
        for (let ray = 0; ray < 6; ray += 1) {
          const rayAngle = ray * Math.PI / 3;
          this.p.line(Math.cos(rayAngle) * 3, Math.sin(rayAngle) * 3, Math.cos(rayAngle) * 12, Math.sin(rayAngle) * 12);
        }
        this.p.noStroke(); this.p.fill("#573b32"); this.p.circle(0, 0, 6);
      } else {
        this.p.stroke("#6d9b8f"); this.p.strokeWeight(2); this.p.noFill();
        this.p.arc(0, 0, 18, 18, -.7, 2.2);
      }
      this.p.pop();
    }
  }

  private drawMirrorInteractionHint(): void {
    const mirror = this.nearestMirror(this.player, 118);
    if (!mirror) return;
    const center = this.mirrorCenter(mirror);
    const pulse = 1 + Math.sin(this.p.millis() * 0.008) * .08;
    this.p.push();
    this.p.noFill(); this.p.stroke("#fff1c7"); this.p.strokeWeight(3);
    this.p.circle(center.x, center.y, 62 * pulse);
    this.p.noStroke(); this.p.fill(87, 59, 50, 225);
    this.p.rectMode(this.p.CENTER); this.p.rect(center.x, center.y + 48, 142, 25, 4);
    this.p.fill("#fff1c7"); this.p.textFont("Georgia"); this.p.textStyle(this.p.BOLD);
    this.p.textAlign(this.p.CENTER, this.p.CENTER); this.p.textSize(10);
    this.p.text("Q  ↶   AYNAYI ÇEVİR   ↷  E", center.x, center.y + 48);
    this.p.pop();
  }

  private drawPreview(): void {
    const direction = normalize(subtract({ x: this.p.mouseX, y: this.p.mouseY }, this.player.position));
    const trace = this.traceAimFor(this.player, this.bot, direction, MAX_REFLECTIONS);
    const context = this.p.drawingContext as CanvasRenderingContext2D;
    context.save(); context.setLineDash([8, 9]);
    this.p.noFill(); this.p.stroke(255, 244, 210, 125); this.p.strokeWeight(2); this.drawPolyline(trace.points);
    context.restore();
  }

  private drawShot(shot: VisibleShot): void {
    if (shot.age < 0) return;
    const travelled = Math.min(shot.age * LASER_SPEED, shot.totalLength);
    const trailStart = Math.max(0, travelled - LASER_TRAIL_LENGTH);
    const visiblePath = this.pathSlice(shot.points, trailStart, travelled);
    const color = shot.ownerId === "player" ? [125, 218, 190] : [239, 132, 139];
    this.p.noFill(); this.p.stroke(color[0], color[1], color[2], 60); this.p.strokeWeight(16); this.drawPolyline(visiblePath);
    this.p.stroke(255, 247, 218, 245); this.p.strokeWeight(4); this.drawPolyline(visiblePath);
    const head = visiblePath.at(-1);
    if (head) { this.p.noStroke(); this.p.fill(255); this.p.circle(head.x, head.y, 11); }
    for (const impact of shot.mirrorImpacts) {
      const impactDistance = this.distanceAlongPath(shot.points, impact.point);
      if (impactDistance <= travelled && impactDistance >= trailStart - 30) {
        this.p.noStroke(); this.p.fill(mirrorColors[impact.type]); this.p.circle(impact.point.x, impact.point.y, 15);
      }
    }
    if (shot.explosionRemaining > 0) {
      const center = shot.explosionCenter ?? this.pointAtDistance(shot.points, shot.totalLength);
      const progress = 1 - shot.explosionRemaining / shot.explosionDuration;
      this.p.noFill(); this.p.stroke(143, 114, 157, 220 * (1 - progress)); this.p.strokeWeight(7 * (1 - progress) + 2);
      this.p.circle(center.x, center.y, EXPLOSION_RADIUS * 2 * progress);
      this.p.noStroke(); this.p.fill(245, 209, 142, 155 * (1 - progress)); this.p.circle(center.x, center.y, 34 * (1 - progress));
    }
  }

  private drawPolyline(points: Vector2[]): void {
    if (points.length < 2) return;
    this.p.beginShape(); for (const point of points) this.p.vertex(point.x, point.y); this.p.endShape();
  }

  private drawCombatant(combatant: Combatant, aimAngle: number, art: p5.Image): void {
    const animation = this.combatantAnimations[combatant.id];
    const idleOffset = combatant.id === "player" ? 0 : Math.PI;
    const idleWave = Math.sin(this.p.millis() * 0.0028 + idleOffset);
    const stepWave = Math.sin(animation.stepPhase);
    const stepBounce = Math.abs(stepWave) * 3 * animation.movement;
    const bodySway = stepWave * 0.05 * animation.movement + idleWave * 0.008;
    const squash = Math.sin(animation.stepPhase * 2) * 0.035 * animation.movement;
    const breathing = idleWave * 0.008 * (1 - animation.movement);
    const fireProgress = animation.fireRemaining > 0
      ? 1 - animation.fireRemaining / FIRE_ANIMATION_TIME
      : 1;
    const fireKick = animation.fireRemaining > 0 ? Math.sin(fireProgress * Math.PI) : 0;
    const fireFlash = animation.fireRemaining > 0 ? Math.pow(1 - fireProgress, 2) : 0;
    const scaleX = 1 + squash + breathing + fireKick * 0.035;
    const scaleY = 1 - squash - breathing * 0.6 - fireKick * 0.055;

    this.p.push();
    this.p.translate(combatant.position.x, combatant.position.y - stepBounce);
    const ringColor = combatant.id === "player" ? [92, 153, 137] : [178, 91, 101];
    const auraPulse = 1 + idleWave * 0.025;
    this.p.noStroke(); this.p.fill(ringColor[0], ringColor[1], ringColor[2], 28); this.p.circle(0, stepBounce, 47 * auraPulse);
    this.p.noFill(); this.p.stroke(ringColor[0], ringColor[1], ringColor[2], 155); this.p.strokeWeight(1.5); this.p.circle(0, stepBounce, 44 * auraPulse);
    this.p.noStroke(); this.p.fill(48, 31, 24, 82); this.p.ellipse(3, 14 + stepBounce, 39 + animation.movement * 3, 14 - animation.movement * 2);
    if (animation.movement > 0.08) {
      const dustAlpha = 82 * animation.movement * (0.45 + Math.abs(stepWave) * 0.55);
      this.p.noFill(); this.p.stroke(225, 204, 163, dustAlpha); this.p.strokeWeight(1.4);
      this.p.arc(-12 - stepWave * 3, 18 + stepBounce, 11, 5, Math.PI, Math.PI * 2);
      this.p.arc(11 - stepWave * 3, 18 + stepBounce, 8, 4, Math.PI, Math.PI * 2);
    }
    this.p.rotate(aimAngle - Math.PI / 2 + bodySway);
    this.p.translate(0, -fireKick * 6.5);
    this.p.rotate(stepWave * 0.024 * animation.movement + Math.sin(fireProgress * Math.PI * 2) * 0.035 * fireKick);
    this.p.scale(scaleX, scaleY);
    this.p.imageMode(this.p.CENTER);
    this.p.image(art, 0, 0, COMBATANT_ART_WIDTH, COMBATANT_ART_HEIGHT);
    const magicPulse = 2.5 + Math.sin(this.p.millis() * 0.008) * 0.7;
    this.p.noStroke(); this.p.fill(255, 235, 169, 160); this.p.circle(0, 34, magicPulse);
    if (animation.fireRemaining > 0) {
      const flashStrength = Math.max(fireFlash, fireKick * 0.72);
      const flashSize = 11 + flashStrength * 16;
      this.p.fill(255, 247, 207, 245 * flashStrength); this.p.circle(0, 35 + fireKick * 5, flashSize);
      this.p.noFill(); this.p.stroke(ringColor[0], ringColor[1], ringColor[2], 225 * flashStrength); this.p.strokeWeight(2.4);
      this.p.circle(0, 36 + fireKick * 6, flashSize + 11);
      for (let spark = -1; spark <= 1; spark += 1) {
        const spread = spark * 0.42;
        const sparkLength = 17 + flashStrength * 12;
        this.p.line(0, 38, Math.sin(spread) * sparkLength, 38 + Math.cos(spread) * sparkLength);
      }
    }
    if (combatant.flashRemaining > 0) {
      this.p.fill(255, 248, 218, 145);
      this.p.circle(0, 0, 48);
    }
    this.p.pop();

    if (animation.fireRemaining > 0) {
      this.drawFireEmote(combatant, aimAngle, fireProgress, ringColor);
    }
  }

  private drawFireEmote(
    combatant: Combatant,
    aimAngle: number,
    progress: number,
    color: number[],
  ): void {
    const pop = Math.sin(Math.min(1, progress * 1.35) * Math.PI);
    const fade = 1 - Math.pow(progress, 2);
    const forward = fromAngle(aimAngle);
    const side = { x: -forward.y, y: forward.x };
    const origin = add(combatant.position, scale(forward, 38 + pop * 7));

    this.p.push();
    this.p.translate(origin.x, origin.y);
    this.p.noStroke();
    this.p.fill(255, 244, 188, 220 * fade);
    this.p.circle(0, 0, 9 + pop * 10);

    for (let index = 0; index < 3; index += 1) {
      const direction = index - 1;
      const starCenter = add(
        scale(forward, 10 + pop * (12 + index * 3)),
        scale(side, direction * (12 + pop * 8)),
      );
      const starSize = (3.5 + index) * pop;
      this.p.push();
      this.p.translate(starCenter.x, starCenter.y);
      this.p.rotate(progress * 4 + index);
      this.p.fill(color[0], color[1], color[2], 235 * fade);
      this.drawStar(0, 0, starSize * 0.45, starSize, 4);
      this.p.pop();
    }

    const labelPosition = add(scale(forward, 18 + pop * 12), scale(side, -24 - pop * 5));
    this.p.translate(labelPosition.x, labelPosition.y - pop * 5);
    this.p.rotate(-0.12 + Math.sin(progress * Math.PI * 2) * 0.08);
    this.p.textFont("Georgia");
    this.p.textStyle(this.p.BOLD);
    this.p.textAlign(this.p.CENTER, this.p.CENTER);
    this.p.textSize(9 + pop * 7);
    this.p.stroke(57, 39, 29, 220 * fade);
    this.p.strokeWeight(3);
    this.p.fill(255, 232, 154, 255 * fade);
    this.p.text(combatant.id === "player" ? "PİF!" : "ZAP!", 0, 0);
    this.p.pop();
  }

  private drawStar(x: number, y: number, innerRadius: number, outerRadius: number, points: number): void {
    this.p.beginShape();
    for (let index = 0; index < points * 2; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / points;
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      this.p.vertex(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    this.p.endShape(this.p.CLOSE);
  }

  private drawHud(): void {
    this.p.noStroke(); this.p.textFont("Georgia");
    this.drawHealthBar(42, 38, this.player.hp, "#547e71", false);
    this.drawHealthBar(this.arena.width - 42, 38, this.bot.hp, "#a95e63", true);
    const cooldownProgress = 1 - this.player.cooldownRemaining / SHOT_COOLDOWN;
    this.p.noFill(); this.p.stroke(43, 32, 25, 180); this.p.strokeWeight(7); this.p.circle(this.arena.width / 2, 48, 29);
    this.p.stroke("#d8ae5d"); this.p.arc(this.arena.width / 2, 48, 29, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cooldownProgress);
    if (this.player.cooldownRemaining <= 0) { this.p.noStroke(); this.p.fill("#fff0b5"); this.p.circle(this.arena.width / 2, 48, 8); }
  }

  private drawHealthBar(x: number, y: number, hp: number, color: string, alignRight: boolean): void {
    const width = 240; const left = alignRight ? x - width : x;
    this.p.stroke("#9b7845"); this.p.strokeWeight(1); this.p.fill(49, 37, 28, 180); this.p.rect(left - 5, y - 5, width + 10, 23, 4);
    this.p.noStroke();
    this.p.fill(56, 43, 31, 220); this.p.rect(left, y, width, 13, 2);
    this.p.fill("#d9c59b"); this.p.rect(left + 3, y + 3, width - 6, 7, 1);
    this.p.fill(color); this.p.rect(left + 3, y + 3, (width - 6) * (hp / MAX_HP), 7, 1);
  }

  private drawDebug(): void {
    this.p.noFill(); this.p.stroke(255, 219, 92, 180); this.p.strokeWeight(1);
    for (const combatant of [this.player, this.bot]) this.p.circle(combatant.position.x, combatant.position.y, combatant.radius * 2);
    this.p.line(this.bot.position.x, this.bot.position.y, this.botDestination.x, this.botDestination.y);
    this.p.fill(82, 57, 38); this.p.noStroke(); this.p.textAlign(this.p.LEFT, this.p.BOTTOM); this.p.textSize(12); this.p.text(`DEBUG  FPS ${Math.round(this.p.frameRate())}`, 18, this.arena.height - 16);
  }

  private drawEndScreen(): void {
    this.p.noStroke(); this.p.fill(55, 39, 31, 205); this.p.rect(0, 0, this.arena.width, this.arena.height);
    const cx = this.arena.width / 2; const cy = this.arena.height / 2;
    this.p.fill("#e6d4ad"); this.p.stroke("#c09349"); this.p.strokeWeight(7); this.p.rect(cx - 290, cy - 125, 580, 250, 12);
    this.p.stroke("#725334"); this.p.strokeWeight(2); this.p.noFill(); this.p.rect(cx - 276, cy - 111, 552, 222, 8);
    this.p.noStroke(); this.p.textFont("Georgia"); this.p.textAlign(this.p.CENTER, this.p.CENTER); this.p.fill(this.status === "WON" ? "#426f64" : "#9a4f58"); this.p.textSize(54); this.p.textStyle(this.p.BOLD);
    this.p.text(this.status === "WON" ? "KAZANDIN" : "KAYBETTİN", cx, cy - 34);
    this.p.textStyle(this.p.NORMAL); this.p.fill("#5c4632"); this.p.textSize(18); this.p.text("Tekrar oynamak için tıkla veya Space'e bas", cx, cy + 42);
  }

  private pathLength(points: Vector2[]): number {
    let total = 0; for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]); return total;
  }

  private distanceAlongPath(points: Vector2[], target: Vector2): number {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const segmentLength = distance(points[index - 1], points[index]);
      if (distance(points[index], target) < 0.1) return total + segmentLength;
      total += segmentLength;
    }
    return total;
  }

  private pointAtDistance(points: Vector2[], targetDistance: number): Vector2 {
    let traversed = 0;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]; const end = points[index]; const segmentLength = distance(start, end);
      if (traversed + segmentLength >= targetDistance) {
        const ratio = segmentLength === 0 ? 0 : (targetDistance - traversed) / segmentLength;
        return add(start, scale(subtract(end, start), ratio));
      }
      traversed += segmentLength;
    }
    return { ...points[points.length - 1] };
  }

  private pathSlice(points: Vector2[], startDistance: number, endDistance: number): Vector2[] {
    const result = [this.pointAtDistance(points, startDistance)];
    let traversed = 0;
    for (let index = 1; index < points.length; index += 1) {
      traversed += distance(points[index - 1], points[index]);
      if (traversed > startDistance && traversed < endDistance) result.push(points[index]);
    }
    result.push(this.pointAtDistance(points, endDistance));
    return result;
  }

  private rotate(vector: Vector2, angle: number): Vector2 {
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine };
  }

  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
  }

  private mouseAimAngle(): number { return Math.atan2(this.p.mouseY - this.player.position.y, this.p.mouseX - this.player.position.x); }
  private isMouseInsideArena(): boolean { return this.p.mouseX >= 0 && this.p.mouseX <= this.arena.width && this.p.mouseY >= 0 && this.p.mouseY <= this.arena.height; }
}
