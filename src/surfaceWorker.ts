import type { Edge, Node } from "@xyflow/react";
import { createEvaluationContext, enrichPreviewContentFields } from "@/utils/densityEvaluator";

/** Hytale V2: density >= 0 is solid. Matches ThresholdedHeatmap in the app. */
const SOLID = 0;

/** How often to ship a partial map back for painting. */
const PARTIAL_EVERY_ROWS = 6;

export interface SurfaceRequest {
  nodes: Node[];
  edges: Edge[];
  rootNodeId?: string;
  resolution: number;
  rangeMin: number;
  rangeMax: number;
  yMin: number;
  yMax: number;
  ySteps: number;
  contentFields: Record<string, number>;
  externalDensityExports?: Record<string, { nodes: Node[]; edges: Edge[] }>;
}

export type SurfaceResponse =
  | { type: "progress"; done: number; total: number; heights?: Float32Array }
  | { type: "done"; heights: Float32Array; ms: number }
  | { type: "error"; error: string };

/**
 * Column-wise surface scan.
 *
 * The shared `createEvaluationContext` is built ONCE and reused for every
 * sample. Driving this from the app's grid-at-a-time worker instead meant
 * rebuilding the context per Y slice — 32 rebuilds of a complex biome graph,
 * which dominated the runtime.
 *
 * Walking per column (rather than per slice) also lets each column stop at its
 * own surface, so flat terrain costs a couple of samples instead of the full
 * ladder.
 *
 * Only the loop lives here. Every density value still comes from the app's own
 * evaluator, unmodified.
 */
self.onmessage = (e: MessageEvent<SurfaceRequest>) => {
  const req = e.data;
  try {
    const ctx = createEvaluationContext(req.nodes, req.edges, req.rootNodeId, {
      contentFields: enrichPreviewContentFields(
        req.contentFields,
        req.rangeMin,
        req.rangeMax,
        req.yMax,
      ),
      ...(req.externalDensityExports ? { externalDensityExports: req.externalDensityExports } : {}),
    });
    if (!ctx) {
      (self as unknown as Worker).postMessage({ type: "error", error: "Graph produced no evaluable context." } satisfies SurfaceResponse);
      return;
    }

    const n = req.resolution;
    const heights = new Float32Array(n * n).fill(NaN);
    const step = n > 1 ? (req.rangeMax - req.rangeMin) / (n - 1) : 0;
    const yStep = req.ySteps > 1 ? (req.yMax - req.yMin) / (req.ySteps - 1) : 0;
    const started = performance.now();

    for (let row = 0; row < n; row++) {
      const z = req.rangeMin + row * step;
      for (let col = 0; col < n; col++) {
        const x = req.rangeMin + col * step;
        // Top down: the first solid sample is this column's surface.
        for (let s = 0; s < req.ySteps; s++) {
          const y = req.yMax - s * yStep;
          if (ctx.evaluate(ctx.rootId, x, y, z) >= SOLID) {
            heights[row * n + col] = y;
            break;
          }
        }
      }
      // Memo keys include (x, y, z), so it only grows. Nothing carries between
      // rows, so clearing here keeps memory flat without losing any reuse.
      ctx.clearMemo();

      // Ship partial rows so the map paints as it scans. A complex biome graph
      // can cost ~10x more per sample than a plain density file, and watching a
      // coastline resolve beats staring at an empty square.
      const emitRows = (row + 1) % PARTIAL_EVERY_ROWS === 0 || row === n - 1;
      (self as unknown as Worker).postMessage({
        type: "progress",
        done: row + 1,
        total: n,
        ...(emitRows ? { heights: heights.slice() } : {}),
      } satisfies SurfaceResponse);
    }

    (self as unknown as Worker).postMessage(
      { type: "done", heights, ms: performance.now() - started } satisfies SurfaceResponse,
      [heights.buffer],
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    } satisfies SurfaceResponse);
  }
};
