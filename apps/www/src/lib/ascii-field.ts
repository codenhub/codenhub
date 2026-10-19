/** Glyphs from empty to dense; a cell's field value picks one. */
export const GLYPH_RAMP = " .,:;-=+*#%@";

/** A point in cell coordinates. */
export interface CellPoint {
  x: number;
  y: number;
}

/**
 * The field's value at one cell, in `[0, 1]`: three drifting waves plus a
 * ripple spreading from `origin`, so the pattern keeps moving without visibly
 * repeating.
 * @param x Column index.
 * @param y Row index.
 * @param time Seconds since the animation started.
 * @param origin Where the ripple spreads from.
 * @returns The field's value at that cell.
 */
export function fieldValue(x: number, y: number, time: number, origin: CellPoint): number {
  // A monospace cell is about twice as tall as it is wide, so rows count double
  // for the ripple to read as a circle rather than a wide ellipse.
  const ripple = Math.sin(Math.hypot(x - origin.x, (y - origin.y) * 2) * 0.18 - time * 1.4);
  const sum =
    Math.sin(x * 0.07 + time * 0.6) +
    Math.sin(y * 0.16 - time * 0.45) +
    Math.sin((x + y * 2) * 0.045 + time * 0.3) +
    ripple;

  return (sum + 4) / 8;
}

/**
 * The glyph that draws a field value.
 * @param value A field value; anything outside `[0, 1]` is clamped.
 * @returns One character of {@link GLYPH_RAMP}.
 */
export function glyphFor(value: number): string {
  const clamped = Math.min(Math.max(value, 0), 1);
  const index = Math.min(GLYPH_RAMP.length - 1, Math.floor(clamped * GLYPH_RAMP.length));

  return GLYPH_RAMP.charAt(index);
}

/** A ring spreading from where the visitor clicked, by when it started. */
export interface Ripple extends CellPoint {
  /** Field time, in seconds, when the ripple started. */
  start: number;
}

/** How long a ripple travels before it has faded out, in seconds. */
export const RIPPLE_LIFETIME = 1.6;

const RIPPLE_SPEED = 28;
const RIPPLE_WIDTH_SQUARED = 12;

/**
 * How much click ripples lift the field at one cell, in `[0, 1]`: a ring
 * travelling out from each click that fades as it goes.
 * @param x Column index.
 * @param y Row index.
 * @param time Field time, in seconds.
 * @param ripples Ripples still travelling.
 * @returns The lift at that cell.
 */
export function rippleLift(x: number, y: number, time: number, ripples: readonly Ripple[]): number {
  let lift = 0;

  for (const ripple of ripples) {
    const age = time - ripple.start;
    const offFront = Math.hypot(x - ripple.x, (y - ripple.y) * 2) - age * RIPPLE_SPEED;
    lift += Math.exp(-(offFront * offFront) / RIPPLE_WIDTH_SQUARED) * Math.max(0, 1 - age / RIPPLE_LIFETIME);
  }

  return Math.min(lift, 1);
}

/**
 * A water surface over the glyph grid, one height per cell. The pointer pushes
 * it and the disturbance spreads and settles like liquid, leaving a wake.
 */
export interface Waves {
  columns: number;
  rows: number;
  current: Float32Array;
  previous: Float32Array;
}

/**
 * A still surface of the given size.
 * @param columns Cells per row.
 * @param rows Rows of cells.
 * @returns The surface, flat.
 */
export function createWaves(columns: number, rows: number): Waves {
  const size = Math.max(columns, 0) * Math.max(rows, 0);

  return { columns, rows, current: new Float32Array(size), previous: new Float32Array(size) };
}

/**
 * Pushes the surface down around one point, with a soft edge.
 * @param waves The surface to disturb.
 * @param point Where, in cell coordinates; points off the grid are clipped.
 * @param amount How hard.
 * @param radius How far the push reaches, in cells.
 */
export function disturbWaves(waves: Waves, point: CellPoint, amount: number, radius = 2): void {
  const { columns, rows, current } = waves;
  const reach = Math.ceil(radius);

  for (let y = Math.round(point.y) - reach; y <= Math.round(point.y) + reach; y += 1) {
    for (let x = Math.round(point.x) - reach; x <= Math.round(point.x) + reach; x += 1) {
      if (x < 0 || y < 0 || x >= columns || y >= rows) {
        continue;
      }

      const distance = Math.hypot(x - point.x, y - point.y);
      if (distance <= radius) {
        current[y * columns + x] = (current[y * columns + x] ?? 0) + amount * (1 - distance / (radius + 1));
      }
    }
  }
}

/**
 * Advances the surface one step: each cell moves toward its neighbours'
 * average and keeps some of its momentum, losing a little to `damping`.
 * @param waves The surface, updated in place.
 * @param damping How much of the motion survives each step, below 1.
 */
export function stepWaves(waves: Waves, damping = 0.95): void {
  const { columns, rows, current, previous } = waves;

  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < columns - 1; x += 1) {
      const index = y * columns + x;
      const neighbours =
        (current[index - 1] ?? 0) +
        (current[index + 1] ?? 0) +
        (current[index - columns] ?? 0) +
        (current[index + columns] ?? 0);
      previous[index] = (neighbours / 2 - (previous[index] ?? 0)) * damping;
    }
  }

  waves.previous = current;
  waves.current = previous;
}

/**
 * How much the surface lifts the field at one cell, in `[0, 1)`.
 * @param waves The surface.
 * @param x Column index.
 * @param y Row index.
 * @returns The lift at that cell.
 */
export function waveLift(waves: Waves, x: number, y: number): number {
  // Eased rather than linear, so a wake shades the field instead of flooding it.
  const height = Math.abs(waves.current[y * waves.columns + x] ?? 0);

  return height / (height + 0.6);
}
