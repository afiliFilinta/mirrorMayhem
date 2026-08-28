import type { ArenaMap, ArenaSettings, Mirror, MirrorType, Vector2, Wall } from "./types";

const MIRROR_TYPES: MirrorType[] = ["STANDARD", "SPLITTER", "EXPLOSIVE"];
const randomBetween = (random: () => number, min: number, max: number): number => min + random() * (max - min);
const MIRROR_FURNITURE_CLEARANCE = 36;
const SPAWN_CLEARANCE = 72;

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  mirrorCount: 6,
  furnitureCount: 6,
  mirrorScale: 1,
  furnitureScale: 1,
  layoutSpread: 1,
  layout: "MAZE",
};

const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? { x: 0, y: 0 } : { x: vector.x / length, y: vector.y / length };
};

const mirrorForReflectionPath = (
  id: string,
  type: MirrorType,
  center: Vector2,
  source: Vector2,
  target: Vector2,
  length: number,
): Mirror => {
  const incoming = normalize({ x: center.x - source.x, y: center.y - source.y });
  const outgoing = normalize({ x: target.x - center.x, y: target.y - center.y });

  // The surface normal bisects the incoming ray and the inverse of the outgoing
  // ray. A ray aimed at the mirror's center therefore reflects toward the rival.
  const normal = normalize({ x: incoming.x - outgoing.x, y: incoming.y - outgoing.y });
  const tangent = { x: -normal.y, y: normal.x };
  const halfLength = length / 2;
  const offset = { x: tangent.x * halfLength, y: tangent.y * halfLength };

  return {
    id,
    type,
    start: { x: center.x - offset.x, y: center.y - offset.y },
    end: { x: center.x + offset.x, y: center.y + offset.y },
  };
};

const createMirrors = (
  template: Pick<ArenaMap, "width" | "height" | "playerSpawn" | "botSpawn">,
  settings: ArenaSettings,
): Mirror[] => {
  const requestedCount = Math.max(0, Math.round(settings.mirrorCount));
  if (requestedCount === 0) return [];
  const arenaCenter = { x: template.width / 2, y: template.height / 2 };
  const topCount = Math.ceil(requestedCount / 2);
  const bottomCount = Math.floor(requestedCount / 2);
  const spread = settings.layoutSpread;
  const horizontalRadius = template.width * 0.4 * spread;
  const verticalRadius = template.height * 0.3 * spread;
  const xOffsets = Array.from({ length: topCount }, (_, index) => {
    const ratio = topCount === 1 ? 0.5 : index / (topCount - 1);
    return (ratio - 0.5) * template.width * 0.48 * spread;
  });
  const mirrorLength = template.width * 0.12 * settings.mirrorScale;

  const topCenters = xOffsets.map((xOffset) => {
    const ellipseHeight = verticalRadius * Math.sqrt(1 - (xOffset * xOffset) / (horizontalRadius * horizontalRadius));
    return { x: arenaCenter.x + xOffset, y: arenaCenter.y - ellipseHeight };
  });
  const centers = [
    ...topCenters,
    ...(bottomCount === 0 ? [] : topCenters.slice(0, bottomCount).reverse().map((center) => ({ x: center.x, y: template.height - center.y }))),
  ];

  return centers.map((center, index) =>
    mirrorForReflectionPath(
      `mirror-${index}`,
      MIRROR_TYPES[index % MIRROR_TYPES.length],
      center,
      template.playerSpawn,
      template.botSpawn,
      mirrorLength,
    ),
  );
};

const createFurniture = (
  template: Pick<ArenaMap, "width" | "height" | "playerSpawn" | "botSpawn">,
  mirrors: Mirror[],
  random: () => number,
  settings: ArenaSettings,
): Wall[] => {
  const baseSizes = [
    { name: "sofa", width: 142, height: 66 },
    { name: "round-table", width: 78, height: 78 },
    { name: "luggage-cart", width: 104, height: 62 },
  ];
  const anchors: Record<ArenaSettings["layout"], Vector2[]> = {
    MAZE: [
      { x: .29, y: .36 }, { x: .29, y: .64 }, { x: .5, y: .64 },
      { x: .5, y: .36 }, { x: .71, y: .36 }, { x: .71, y: .64 },
    ],
    BALANCED: [
      { x: .39, y: .36 }, { x: .61, y: .64 },
      { x: .61, y: .36 }, { x: .39, y: .64 },
      { x: .5, y: .36 }, { x: .5, y: .64 },
    ],
    OPEN: [
      { x: .5, y: .36 }, { x: .5, y: .64 }, { x: .3, y: .5 },
      { x: .7, y: .5 }, { x: .34, y: .66 }, { x: .66, y: .34 },
    ],
    CHAOTIC: [
      { x: .46, y: .52 }, { x: .27, y: .37 }, { x: .74, y: .63 },
      { x: .64, y: .38 }, { x: .35, y: .65 }, { x: .8, y: .48 },
    ],
  };
  const jitter = settings.layout === "CHAOTIC" ? 18 : 3;

  const placed: Wall[] = [];
  Array.from({ length: Math.max(0, Math.round(settings.furnitureCount)) }, (_, index) =>
    anchors[settings.layout][index % anchors[settings.layout].length]
  ).forEach((anchor, index) => {
    const base = settings.layout === "BALANCED"
      ? baseSizes[Math.floor(index / 2) % baseSizes.length]
      : baseSizes[index % baseSizes.length];
    const width = base.width * settings.furnitureScale;
    const height = base.height * settings.furnitureScale;
    const spreadX = (anchor.x - .5) * settings.layoutSpread + .5;
    const spreadY = (anchor.y - .5) * settings.layoutSpread + .5;
    const centerX = template.width * spreadX + randomBetween(random, -jitter, jitter);
    const centerY = template.height * spreadY + randomBetween(random, -jitter, jitter);
    const candidates = [{ x: centerX, y: centerY }];
    const fallbackCandidates: Vector2[] = [];
    for (let y = 150; y <= template.height - 150; y += 25) {
      for (let x = 100; x <= template.width - 100; x += 35) fallbackCandidates.push({ x, y });
    }
    fallbackCandidates.sort((a, b) =>
      Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY),
    );
    candidates.push(...fallbackCandidates);
    const position = candidates.find((candidate) => {
      const wall: Wall = { id: "candidate", x: candidate.x - width / 2, y: candidate.y - height / 2, width, height };
      const hitsMirror = mirrors.some((mirror) =>
        segmentIntersectsExpandedRectangle(mirror.start, mirror.end, wall, MIRROR_FURNITURE_CLEARANCE),
      );
      const hitsSpawn = [template.playerSpawn, template.botSpawn].some((spawn) =>
        circleIntersectsExpandedRectangle(spawn, SPAWN_CLEARANCE, wall),
      );
      const hitsFurniture = placed.some((other) => rectanglesOverlap(wall, other, 20));
      return !hitsMirror && !hitsSpawn && !hitsFurniture;
    }) ?? candidates[0];
    placed.push({
      id: `${base.name}-${index}`,
      x: position.x - width / 2,
      y: position.y - height / 2,
      width,
      height,
      rotation: 0,
    });
  });
  return placed;
};

const rectanglesOverlap = (a: Wall, b: Wall, padding: number): boolean =>
  a.x < b.x + b.width + padding && a.x + a.width + padding > b.x
  && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;

const circleIntersectsExpandedRectangle = (center: Vector2, radius: number, wall: Wall): boolean => {
  const nearestX = Math.max(wall.x, Math.min(center.x, wall.x + wall.width));
  const nearestY = Math.max(wall.y, Math.min(center.y, wall.y + wall.height));
  return (center.x - nearestX) ** 2 + (center.y - nearestY) ** 2 < radius ** 2;
};

const segmentIntersectsExpandedRectangle = (start: Vector2, end: Vector2, wall: Wall, padding: number): boolean => {
  const left = wall.x - padding; const right = wall.x + wall.width + padding;
  const top = wall.y - padding; const bottom = wall.y + wall.height + padding;
  const inside = (point: Vector2): boolean => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  if (inside(start) || inside(end)) return true;
  const edges: Array<[Vector2, Vector2]> = [
    [{ x: left, y: top }, { x: right, y: top }],
    [{ x: right, y: top }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: left, y: bottom }],
    [{ x: left, y: bottom }, { x: left, y: top }],
  ];
  return edges.some(([edgeStart, edgeEnd]) => {
    const direction = { x: end.x - start.x, y: end.y - start.y };
    const edge = { x: edgeEnd.x - edgeStart.x, y: edgeEnd.y - edgeStart.y };
    const denominator = direction.x * edge.y - direction.y * edge.x;
    if (Math.abs(denominator) < 1e-9) return false;
    const offset = { x: edgeStart.x - start.x, y: edgeStart.y - start.y };
    const segmentRatio = (offset.x * edge.y - offset.y * edge.x) / denominator;
    const edgeRatio = (offset.x * direction.y - offset.y * direction.x) / denominator;
    return segmentRatio >= 0 && segmentRatio <= 1 && edgeRatio >= 0 && edgeRatio <= 1;
  });
};

export const generateArena = (
  template: Pick<ArenaMap, "width" | "height" | "playerSpawn" | "botSpawn">,
  random: () => number = Math.random,
  options: Partial<ArenaSettings> = {},
): ArenaMap => {
  const settings = { ...DEFAULT_ARENA_SETTINGS, ...options };
  const mirrors = createMirrors(template, settings);
  const walls = createFurniture(template, mirrors, random, settings);

  return {
    ...template,
    walls,
    mirrors,
    playerSpawn: { ...template.playerSpawn },
    botSpawn: { ...template.botSpawn },
  };
};
