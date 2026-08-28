import type { Mirror, Vector2, Wall } from "../game/types";
import { add, cross, dot, normalize, scale, subtract } from "./vector";

export const RAY_EPSILON = 0.001;

export interface RayHit {
  point: Vector2;
  distance: number;
  normal?: Vector2;
}

const rotateAround = (point: Vector2, center: Vector2, angle: number): Vector2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
};

const rectangleCorners = (wall: Wall): Vector2[] => {
  const center = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
  const rotation = wall.rotation ?? 0;
  const corners = [
    { x: wall.x, y: wall.y },
    { x: wall.x + wall.width, y: wall.y },
    { x: wall.x + wall.width, y: wall.y + wall.height },
    { x: wall.x, y: wall.y + wall.height },
  ];
  return rotation === 0 ? corners : corners.map((corner) => rotateAround(corner, center, rotation));
};

export const raySegmentIntersection = (
  origin: Vector2,
  direction: Vector2,
  start: Vector2,
  end: Vector2,
): RayHit | null => {
  const segment = subtract(end, start);
  const denominator = cross(direction, segment);

  if (Math.abs(denominator) < RAY_EPSILON) {
    return null;
  }

  const offset = subtract(start, origin);
  const rayDistance = cross(offset, segment) / denominator;
  const segmentRatio = cross(offset, direction) / denominator;

  if (rayDistance <= RAY_EPSILON || segmentRatio < 0 || segmentRatio > 1) {
    return null;
  }

  return {
    point: add(origin, scale(direction, rayDistance)),
    distance: rayDistance,
  };
};

export const rayMirrorIntersection = (
  origin: Vector2,
  direction: Vector2,
  mirror: Mirror,
): RayHit | null => {
  const hit = raySegmentIntersection(origin, direction, mirror.start, mirror.end);
  if (!hit) return null;

  const segment = subtract(mirror.end, mirror.start);
  let normal = normalize({ x: -segment.y, y: segment.x });
  if (dot(direction, normal) > 0) normal = scale(normal, -1);

  return { ...hit, normal };
};

export const rayCircleIntersection = (
  origin: Vector2,
  direction: Vector2,
  center: Vector2,
  radius: number,
): RayHit | null => {
  const offset = subtract(origin, center);
  const b = 2 * dot(offset, direction);
  const c = dot(offset, offset) - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const first = (-b - root) / 2;
  const second = (-b + root) / 2;
  const rayDistance = first > RAY_EPSILON ? first : second > RAY_EPSILON ? second : null;

  if (rayDistance === null) return null;
  return {
    point: add(origin, scale(direction, rayDistance)),
    distance: rayDistance,
  };
};

export const rayRectangleIntersection = (
  origin: Vector2,
  direction: Vector2,
  wall: Wall,
): RayHit | null => {
  const [topLeft, topRight, bottomRight, bottomLeft] = rectangleCorners(wall);
  const edges: Array<[Vector2, Vector2]> = [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];

  let nearest: RayHit | null = null;
  for (const [start, end] of edges) {
    const hit = raySegmentIntersection(origin, direction, start, end);
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  }
  return nearest;
};

export const circleIntersectsRectangle = (
  center: Vector2,
  radius: number,
  wall: Wall,
): boolean => {
  const wallCenter = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
  const localCenter = rotateAround(center, wallCenter, -(wall.rotation ?? 0));
  const nearestX = Math.max(wall.x, Math.min(localCenter.x, wall.x + wall.width));
  const nearestY = Math.max(wall.y, Math.min(localCenter.y, wall.y + wall.height));
  const deltaX = localCenter.x - nearestX;
  const deltaY = localCenter.y - nearestY;
  return deltaX * deltaX + deltaY * deltaY < radius * radius;
};

export const circleIntersectsSegment = (
  center: Vector2,
  radius: number,
  start: Vector2,
  end: Vector2,
): boolean => {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  if (lengthSquared === 0) {
    const offset = subtract(center, start);
    return dot(offset, offset) < radius * radius;
  }
  const ratio = Math.max(0, Math.min(1, dot(subtract(center, start), segment) / lengthSquared));
  const nearest = add(start, scale(segment, ratio));
  const offset = subtract(center, nearest);
  return dot(offset, offset) < radius * radius;
};
