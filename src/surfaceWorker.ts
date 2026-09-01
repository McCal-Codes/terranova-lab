import type { Edge, Node } from "@xyflow/react";
import { createEvaluationContext, enrichPreviewContentFields } from "@/utils/densityEvaluator";

/** Hytale V2: density >= 0 is solid. Matches ThresholdedHeatmap in the app. */
const SOLID = 0;

/**
 * Coarse probe spacing, in blocks, and how many bisection steps refine a hit.
 *
 * A flat ladder wastes its whole budget on empty columns — HiveWorld is ~85%
 * air, and every one of those columns paid all 32 samples before giving up.
 * Probing coarsely and then bisecting costs less *and* lands more precisely:
 * ~20 samples worst case for 1-block precision, against 32 samples for
 * 4-block precision before.
 *
 * The trade: a solid layer thinner than COARSE_STEP, floating above the real
 * surface, can be stepped over. For terrain surfaces that is a good trade, and
 * it is why the coarse step is kept reasonably tight.
 */
const COARSE_STEP = 8;
const REFINE_STEPS = 3;

export interface SurfaceRequest {
  nodes: Node[];
  edges: Edge[];
  rootNodeId?: string;
  resolution: number;
  rangeMin: number;
  rangeMax: number;
  yMin: number;
  yMax: number;
  contentFields: Record<string, number>;
  externalDensityExports?: Record<string, { nodes: Node[]; edges: Edge[] }>;
  /** Contiguous row band this worker owns. Measured faster than striping rows
   *  across workers, despite striping balancing the bands better — adjacent
   *  rows share noise-cache locality that a stride of 7 throws away. */
  rowStart: number;
  rowEnd: number;
}

export type SurfaceResponse =
  | { type: "progress"; rowsDone: number; rowStart: number; heights: Float32Array }
  | { type: "done"; rowsDone: number; rowStart: number; heights: Float32Array; ms: number }
  | { type: "error"; error: string };

/** Rows between partial emissions. Small enough to feel live, large enough not to spam. */
const PARTIAL_EVERY_ROWS = 4;

/**
 * Scan one horizontal band of columns for the highest solid sample.
 *
 * The shared `createEvaluationContext` is built once per worker and reused for
 * every sample; building it per Y slice (the app's grid-at-a-time worker) cost
 * more than the sampling itself on complex graphs.
 *
 * Only the search loop lives here. Every density value comes from TerraNova's
 * evaluator, unmodified.
 */
self.onmessage = (e: MessageEvent<SurfaceRequest>) => {
  const req = e.data;
  const post = (m: SurfaceResponse, t?: Transferable[]) =>
    (self as unknown as Worker).postMessage(m, t ?? []);

  try {
    const ctx = createEvaluationContext(req.nodes, req.edges, req.rootNodeId, {
      contentFields: enrichPreviewContentFields(
        req.contentFields,
        req.rangeMin,
        req.rangeMax,
        req.yMax,
      ),
      ...(req.externalDensityExports
        ? { externalDensityExports: req.externalDensityExports }
        : {}),
    });
    if (!ctx) {
      post({ type: "error", error: "Graph produced no evaluable context." });
      return;
    }

    const n = req.resolution;
    const bandRows = req.rowEnd - req.rowStart;
    const heights = new Float32Array(Math.max(0, bandRows) * n).fill(NaN);
    const step = n > 1 ? (req.rangeMax - req.rangeMin) / (n - 1) : 0;
    const started = performance.now();

    const solidAt = (x: number, y: number, z: number) => ctx.evaluate(ctx.rootId, x, y, z) >= SOLID;

    let bandRow = 0;
    for (let row = req.rowStart; row < req.rowEnd; row++, bandRow++) {
      const z = req.rangeMin + row * step;
      const out = bandRow * n;

      for (let col = 0; col < n; col++) {
        const x = req.rangeMin + col * step;

        // Coarse probe downward for the first solid hit.
        let hi = req.yMax;      // known air (or untested at the very top)
        let hit = NaN;
        for (let y = req.yMax; y >= req.yMin; y -= COARSE_STEP) {
          if (solidAt(x, y, z)) { hit = y; break; }
          hi = y;
        }
        if (Number.isNaN(hit)) continue;

        // Bisect (hit, hi] to tighten the surface toward 1-block precision.
        let lo = hit;
        for (let i = 0; i < REFINE_STEPS; i++) {
          const mid = (lo + hi) / 2;
          if (solidAt(x, mid, z)) lo = mid;
          else hi = mid;
        }
        heights[out + col] = lo;
      }

      const done = bandRow + 1;
      if (done % PARTIAL_EVERY_ROWS === 0 || done === bandRows) {
        post({
          type: "progress",
          rowsDone: done,
          rowStart: req.rowStart,
          heights: heights.slice(),
        });
      }
      // Memo keys include (x, y, z) so the cache only grows; nothing carries
      // between rows, so clearing here keeps memory flat without losing reuse.
      ctx.clearMemo();
    }

    post(
      { type: "done", rowsDone: bandRow, rowStart: req.rowStart, heights, ms: performance.now() - started },
      [heights.buffer],
    );
  } catch (err) {
    post({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
