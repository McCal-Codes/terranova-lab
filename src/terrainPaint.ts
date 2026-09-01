type RGB = [number, number, number];

/** Void — no solid anywhere in the column. Reads as "nothing generated here". */
const AIR: RGB = [22, 20, 18];

const DEEP_WATER: RGB = [16, 44, 96];
const SHALLOW_WATER: RGB = [58, 123, 213];
const SAND: RGB = [226, 214, 168];
const GRASS_LOW: RGB = [74, 122, 54];
const GRASS_HIGH: RGB = [108, 138, 60];
const ROCK: RGB = [130, 120, 104];
const SNOW: RGB = [232, 228, 220];

/** Blocks above sea level still painted as beach. */
const BEACH_BAND = 2;
/** Depth at which water reaches its darkest tone. */
const DEEP_AT = 24;

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/**
 * Classify one column's surface height into land / water / air.
 *
 * Bands are discrete (water, beach, grass, rock, snow) with a ramp inside each,
 * so coastlines read as edges rather than dissolving into a gradient — the
 * point of the view is telling the three states apart at a glance.
 */
export function classifySurface(height: number, seaLevel: number, peak: number): RGB {
  if (Number.isNaN(height)) return AIR;

  const above = height - seaLevel;

  if (above < 0) {
    return mix(SHALLOW_WATER, DEEP_WATER, Math.min(1, -above / DEEP_AT));
  }
  if (above <= BEACH_BAND) return SAND;

  const span = Math.max(1, peak - seaLevel);
  const t = (above - BEACH_BAND) / span;
  if (t < 0.35) return mix(GRASS_LOW, GRASS_HIGH, t / 0.35);
  if (t < 0.7) return mix(GRASS_HIGH, ROCK, (t - 0.35) / 0.35);
  return mix(ROCK, SNOW, Math.min(1, (t - 0.7) / 0.3));
}

export interface SurfaceStats {
  land: number;
  water: number;
  air: number;
  peak: number;
}

export function surfaceStats(heights: Float32Array, seaLevel: number): SurfaceStats {
  let land = 0;
  let water = 0;
  let air = 0;
  let peak = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i];
    if (Number.isNaN(h)) air++;
    else if (h < seaLevel) water++;
    else {
      land++;
      if (h > peak) peak = h;
    }
  }
  return {
    land, water, air,
    peak: Number.isFinite(peak) ? peak : seaLevel,
  };
}
