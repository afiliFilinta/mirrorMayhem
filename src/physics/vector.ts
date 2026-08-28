import type { Vector2 } from "../game/types";

export const add = (a: Vector2, b: Vector2): Vector2 => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const subtract = (a: Vector2, b: Vector2): Vector2 => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const scale = (vector: Vector2, amount: number): Vector2 => ({
  x: vector.x * amount,
  y: vector.y * amount,
});

export const dot = (a: Vector2, b: Vector2): number => a.x * b.x + a.y * b.y;

export const cross = (a: Vector2, b: Vector2): number => a.x * b.y - a.y * b.x;

export const length = (vector: Vector2): number => Math.hypot(vector.x, vector.y);

export const normalize = (vector: Vector2): Vector2 => {
  const magnitude = length(vector);
  return magnitude === 0 ? { x: 0, y: 0 } : scale(vector, 1 / magnitude);
};

export const distance = (a: Vector2, b: Vector2): number => length(subtract(a, b));

export const fromAngle = (angle: number): Vector2 => ({
  x: Math.cos(angle),
  y: Math.sin(angle),
});

export const reflect = (direction: Vector2, normal: Vector2): Vector2 =>
  normalize(subtract(direction, scale(normal, 2 * dot(direction, normal))));
