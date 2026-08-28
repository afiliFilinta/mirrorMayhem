import type { Mirror, ShotTrace, Target, Vector2, Wall } from "../game/types";
import {
  rayCircleIntersection,
  rayMirrorIntersection,
  rayRectangleIntersection,
  RAY_EPSILON,
  type RayHit,
} from "./collision";
import { add, normalize, reflect, scale } from "./vector";

type SceneHit = RayHit &
  (
    | { kind: "mirror"; mirror: Mirror }
    | { kind: "wall"; wall: Wall }
    | { kind: "target"; target: Target }
  );

const findNearestHit = (
  origin: Vector2,
  direction: Vector2,
  mirrors: Mirror[],
  walls: Wall[],
  targets: Target[],
): SceneHit | null => {
  let nearest: SceneHit | null = null;
  const consider = (hit: SceneHit | null) => {
    if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  };

  for (const mirror of mirrors) {
    const hit = rayMirrorIntersection(origin, direction, mirror);
    consider(hit ? { ...hit, kind: "mirror", mirror } : null);
  }
  for (const wall of walls) {
    const hit = rayRectangleIntersection(origin, direction, wall);
    consider(hit ? { ...hit, kind: "wall", wall } : null);
  }
  for (const target of targets) {
    const hit = rayCircleIntersection(origin, direction, target.center, target.radius);
    consider(hit ? { ...hit, kind: "target", target } : null);
  }

  return nearest;
};

export const traceShot = (
  origin: Vector2,
  rawDirection: Vector2,
  mirrors: Mirror[],
  walls: Wall[],
  targets: Target[],
  maxReflections: number,
  missDistance = 1800,
): ShotTrace => {
  let rayOrigin = { ...origin };
  let direction = normalize(rawDirection);
  const points: Vector2[] = [{ ...origin }];
  const mirrorImpacts: ShotTrace["mirrorImpacts"] = [];
  let bounceCount = 0;

  if (direction.x === 0 && direction.y === 0) {
    return { points, mirrorImpacts, bounceCount };
  }

  while (true) {
    const hit = findNearestHit(rayOrigin, direction, mirrors, walls, targets);
    if (!hit) {
      points.push(add(rayOrigin, scale(direction, missDistance)));
      return { points, mirrorImpacts, bounceCount };
    }

    points.push(hit.point);

    if (hit.kind === "target") {
      return {
        points,
        mirrorImpacts,
        bounceCount,
        hitTargetId: hit.target.id,
      };
    }

    if (hit.kind === "wall") {
      return { points, mirrorImpacts, bounceCount };
    }

    if (bounceCount >= maxReflections || !hit.normal) {
      return { points, mirrorImpacts, bounceCount };
    }

    bounceCount += 1;
    direction = reflect(direction, hit.normal);
    mirrorImpacts.push({
      point: hit.point,
      mirrorId: hit.mirror.id,
      type: hit.mirror.type,
      outgoingDirection: direction,
    });
    rayOrigin = add(hit.point, scale(direction, RAY_EPSILON * 10));
  }
};
