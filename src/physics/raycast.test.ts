import { describe, expect, it } from "vitest";
import type { Mirror, Wall } from "../game/types";
import {
  rayCircleIntersection,
  rayRectangleIntersection,
  raySegmentIntersection,
  circleIntersectsRectangle,
  circleIntersectsSegment,
} from "./collision";
import { traceShot } from "./raycast";
import { reflect } from "./vector";

describe("geometry primitives", () => {
  it("reflects a diagonal ray across a horizontal normal", () => {
    const result = reflect({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }, { x: 0, y: 1 });
    expect(result.x).toBeCloseTo(Math.SQRT1_2);
    expect(result.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("finds ray and segment intersection", () => {
    const hit = raySegmentIntersection(
      { x: 0, y: 5 },
      { x: 1, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    );
    expect(hit?.point).toEqual({ x: 10, y: 5 });
  });

  it("finds the near side of a circle", () => {
    const hit = rayCircleIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }, 2);
    expect(hit?.distance).toBeCloseTo(8);
  });

  it("finds the near side of a rectangle", () => {
    const wall: Wall = { id: "wall", x: 10, y: -5, width: 4, height: 10 };
    const hit = rayRectangleIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, wall);
    expect(hit?.point.x).toBeCloseTo(10);
  });

  it("uses rotated furniture bounds for rays and movement", () => {
    const wall: Wall = { id: "wall", x: 10, y: -5, width: 4, height: 10, rotation: Math.PI / 2 };
    const hit = rayRectangleIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, wall);

    expect(hit?.point.x).toBeCloseTo(7);
    expect(circleIntersectsRectangle({ x: 8, y: 0 }, 1.5, wall)).toBe(true);
    expect(circleIntersectsRectangle({ x: 11, y: 5 }, 1, wall)).toBe(false);
  });

  it("treats a mirror segment as a circular movement obstacle", () => {
    expect(circleIntersectsSegment({ x: 5, y: 2 }, 3, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
    expect(circleIntersectsSegment({ x: 5, y: 5 }, 3, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
  });
});

describe("traceShot", () => {
  it("stops at a wall before a target", () => {
    const result = traceShot(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [],
      [{ id: "wall", x: 5, y: -2, width: 2, height: 4 }],
      [{ id: "target", center: { x: 12, y: 0 }, radius: 1 }],
      3,
    );
    expect(result.hitTargetId).toBeUndefined();
    expect(result.points.at(-1)?.x).toBeCloseTo(5);
  });

  it("reflects from a mirror and hits a target", () => {
    const mirror: Mirror = {
      id: "mirror",
      type: "STANDARD",
      start: { x: 5, y: -5 },
      end: { x: 10, y: 0 },
    };
    const result = traceShot(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [mirror],
      [],
      [{ id: "target", center: { x: 10, y: 5 }, radius: 1 }],
      3,
    );
    expect(result.hitTargetId).toBe("target");
    expect(result.bounceCount).toBe(1);
    expect(result.mirrorImpacts).toHaveLength(1);
    expect(result.mirrorImpacts[0].outgoingDirection.y).toBeGreaterThan(0);
  });

  it("honors the reflection limit", () => {
    const result = traceShot(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [{ id: "mirror", type: "STANDARD", start: { x: 5, y: -5 }, end: { x: 10, y: 0 } }],
      [],
      [],
      0,
    );
    expect(result.bounceCount).toBe(0);
    expect(result.points).toHaveLength(2);
  });

  it("records splitter mirror behavior for the game layer", () => {
    const result = traceShot(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      [{ id: "split", type: "SPLITTER", start: { x: 5, y: -5 }, end: { x: 10, y: 0 } }],
      [],
      [{ id: "target", center: { x: 10, y: 5 }, radius: 1 }],
      3,
    );
    expect(result.hitTargetId).toBe("target");
    expect(result.mirrorImpacts[0].type).toBe("SPLITTER");
  });
});
