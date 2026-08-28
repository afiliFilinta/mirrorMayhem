import { describe, expect, it } from "vitest";
import { circleIntersectsRectangle, circleIntersectsSegment } from "../physics/collision";
import { traceShot } from "../physics/raycast";
import { PLAYER_RADIUS } from "./constants";
import { DEFAULT_ARENA_SETTINGS, generateArena } from "./arenaGenerator";
import type { ArenaMap, ArenaLayout, Vector2, Wall } from "./types";

const template = {
  width: 1200,
  height: 700,
  playerSpawn: { x: 140, y: 350 },
  botSpawn: { x: 1060, y: 350 },
};

const sequenceRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const segmentIntersectsRectangle = (start: Vector2, end: Vector2, wall: Wall, padding = 0): boolean => {
  const left = wall.x - padding;
  const right = wall.x + wall.width + padding;
  const top = wall.y - padding;
  const bottom = wall.y + wall.height + padding;
  const inside = (point: Vector2) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  if (inside(start) || inside(end)) return true;
  const direction = { x: end.x - start.x, y: end.y - start.y };
  const edges: Array<[Vector2, Vector2]> = [
    [{ x: left, y: top }, { x: right, y: top }],
    [{ x: right, y: top }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: left, y: bottom }],
    [{ x: left, y: bottom }, { x: left, y: top }],
  ];
  return edges.some(([edgeStart, edgeEnd]) => {
    const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
    const denominator = direction.x * edge.y - direction.y * edge.x;
    if (Math.abs(denominator) < 1e-9) return false;
    const offset = { x: edgeStart.x - start.x, y: edgeStart.y - start.y };
    const segmentRatio = (offset.x * edge.y - offset.y * edge.x) / denominator;
    const edgeRatio = (offset.x * direction.y - offset.y * direction.x) / denominator;
    return segmentRatio >= 0 && segmentRatio <= 1 && edgeRatio >= 0 && edgeRatio <= 1;
  });
};

const hasWalkableRoute = (arena: ArenaMap): boolean => {
  const step = 20;
  const key = (point: Vector2) => `${Math.round(point.x)},${Math.round(point.y)}`;
  const blocked = (point: Vector2) =>
    point.x < PLAYER_RADIUS || point.x > arena.width - PLAYER_RADIUS ||
    point.y < PLAYER_RADIUS || point.y > arena.height - PLAYER_RADIUS ||
    arena.walls.some((wall) => circleIntersectsRectangle(point, PLAYER_RADIUS, wall)) ||
    arena.mirrors.some((mirror) => circleIntersectsSegment(point, PLAYER_RADIUS + 4, mirror.start, mirror.end));
  const queue = [{ ...arena.playerSpawn }];
  const visited = new Set([key(arena.playerSpawn)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (Math.hypot(current.x - arena.botSpawn.x, current.y - arena.botSpawn.y) <= step) return true;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = key(next);
      if (!visited.has(nextKey) && !blocked(next)) {
        visited.add(nextKey);
        queue.push(next);
      }
    }
  }
  return false;
};

describe("generateArena", () => {
  it("uses a six-piece corridor layout by default", () => {
    const arena = generateArena(template, sequenceRandom(7));
    expect(DEFAULT_ARENA_SETTINGS.layout).toBe("MAZE");
    expect(arena.walls).toHaveLength(6);

    const columns = arena.walls.map((wall) => wall.x + wall.width / 2);
    expect(columns.filter((x) => x < template.width * 0.4)).toHaveLength(2);
    expect(columns.filter((x) => x >= template.width * 0.4 && x <= template.width * 0.6)).toHaveLength(2);
    expect(columns.filter((x) => x > template.width * 0.6)).toHaveLength(2);
  });

  it.each([7, 13, 29, 101])("keeps the maze layout traversable for seed %i", (seed) => {
    expect(hasWalkableRoute(generateArena(template, sequenceRandom(seed)))).toBe(true);
  });

  it("always includes all three mirror types", () => {
    const arena = generateArena(template, sequenceRandom(7));
    expect(new Set(arena.mirrors.map((mirror) => mirror.type))).toEqual(
      new Set(["STANDARD", "SPLITTER", "EXPLOSIVE"]),
    );
  });

  it("keeps mirrors intentional while varying furniture layouts", () => {
    const first = generateArena(template, sequenceRandom(7));
    const second = generateArena(template, sequenceRandom(13));
    expect(first.walls).not.toEqual(second.walls);
    expect(first.mirrors).toEqual(second.mirrors);
  });

  it("places mirrors symmetrically across the arena", () => {
    const { mirrors } = generateArena(template, sequenceRandom(7));

    for (let index = 0; index < mirrors.length / 2; index += 1) {
      const top = mirrors[index];
      const bottom = mirrors[mirrors.length - 1 - index];
      const topCenter = { x: (top.start.x + top.end.x) / 2, y: (top.start.y + top.end.y) / 2 };
      const bottomCenter = { x: (bottom.start.x + bottom.end.x) / 2, y: (bottom.start.y + bottom.end.y) / 2 };

      expect(bottomCenter.x).toBeCloseTo(topCenter.x);
      expect(bottomCenter.y).toBeCloseTo(template.height - topCenter.y);
    }
  });

  it("angles every mirror to create a player-to-bot reflection path", () => {
    const { mirrors } = generateArena(template, sequenceRandom(7));

    for (const mirror of mirrors) {
      const center = {
        x: (mirror.start.x + mirror.end.x) / 2,
        y: (mirror.start.y + mirror.end.y) / 2,
      };
      const trace = traceShot(
        template.playerSpawn,
        { x: center.x - template.playerSpawn.x, y: center.y - template.playerSpawn.y },
        [mirror],
        [],
        [{ id: "bot", center: template.botSpawn, radius: 20 }],
        1,
      );

      expect(trace.bounceCount).toBe(1);
      expect(trace.hitTargetId).toBe("bot");
    }
  });

  it("honors configurable element counts", () => {
    const arena = generateArena(template, sequenceRandom(7), {
      mirrorCount: 10,
      furnitureCount: 6,
    });

    expect(arena.mirrors).toHaveLength(10);
    expect(arena.walls).toHaveLength(6);
  });

  it("supports odd counts and an empty editable arena", () => {
    const odd = generateArena(template, sequenceRandom(7), { mirrorCount: 5, furnitureCount: 10 });
    const empty = generateArena(template, sequenceRandom(7), { mirrorCount: 0, furnitureCount: 0 });

    expect(odd.mirrors).toHaveLength(5);
    expect(odd.walls).toHaveLength(10);
    expect(empty.mirrors).toHaveLength(0);
    expect(empty.walls).toHaveLength(0);
  });

  it("scales both mirror geometry and furniture collision bounds", () => {
    const normal = generateArena(template, sequenceRandom(7));
    const large = generateArena(template, sequenceRandom(7), {
      mirrorScale: 1.25,
      furnitureScale: 1.25,
    });

    const mirrorLength = (arena: typeof normal) => Math.hypot(
      arena.mirrors[0].end.x - arena.mirrors[0].start.x,
      arena.mirrors[0].end.y - arena.mirrors[0].start.y,
    );
    expect(mirrorLength(large)).toBeCloseTo(mirrorLength(normal) * 1.25);
    expect(large.walls[0].width).toBeCloseTo(normal.walls[0].width * 1.25);
    expect(large.walls[0].height).toBeCloseTo(normal.walls[0].height * 1.25);
  });

  it("keeps every supported layout clear and walkable", () => {
    const layouts: ArenaLayout[] = ["MAZE", "BALANCED", "OPEN", "CHAOTIC"];
    for (const layout of layouts) {
      for (const seed of [1, 7, 19, 71]) {
        const arena = generateArena(template, sequenceRandom(seed), {
          layout,
          mirrorCount: 10,
          furnitureCount: 6,
          mirrorScale: 1.35,
          furnitureScale: 1.35,
          layoutSpread: 1.15,
        });

        for (const wall of arena.walls) {
          expect(arena.mirrors.some((mirror) => segmentIntersectsRectangle(mirror.start, mirror.end, wall, 34))).toBe(false);
        }
        for (let first = 0; first < arena.walls.length; first += 1) {
          for (let second = first + 1; second < arena.walls.length; second += 1) {
            const a = arena.walls[first];
            const b = arena.walls[second];
            const overlap = a.x < b.x + b.width + 20
              && a.x + a.width + 20 > b.x
              && a.y < b.y + b.height + 20
              && a.y + a.height + 20 > b.y;
            expect(overlap).toBe(false);
          }
        }
        expect(hasWalkableRoute(arena)).toBe(true);
      }
    }
  });
});
