import type { Edge, Node } from "@xyflow/react";
import type { SurfaceRequest, SurfaceResponse } from "./surfaceWorker";

export interface SurfaceScanOptions {
  resolution: number;
  rangeMin: number;
  rangeMax: number;
  yMin: number;
  yMax: number;
  rootNodeId?: string;
  contentFields: Record<string, number>;
  externalDensityExports?: Record<string, { nodes: Node[]; edges: Edge[] }>;
  onProgress?: (fraction: number) => void;
  /** Partial map, emitted as bands fill in, so the UI can paint mid-scan. */
  onPartial?: (heights: Float32Array) => void;
  signal?: AbortSignal;
}

export interface SurfaceScanResult {
  heights: Float32Array;
  resolution: number;
  yMin: number;
  yMax: number;
  ms: number;
  workers: number;
  /** Slowest single band — wall-clock should approach this if bands truly run in parallel. */
  slowestBandMs: number;
}

/**
 * Leave a core for the UI thread, and don't spin up more workers than there is
 * work. `hardwareConcurrency` is absent on some browsers, hence the fallback.
 */
function workerCount(rows: number): number {
  const override = Number(new URLSearchParams(location.search).get("workers"));
  if (Number.isFinite(override) && override > 0) return Math.min(override, rows);
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(cores - 1, 8, rows));
}

/**
 * Scan the surface across several workers, one horizontal band each.
 *
 * The scan is embarrassingly parallel by row — bands share no state, and each
 * worker builds its own evaluation context. Splitting it is close to a linear
 * speedup on the graphs that actually hurt, which are the ones where resolving
 * shared resources pulled in a lot more nodes.
 */
export function surfaceScan(
  nodes: Node[],
  edges: Edge[],
  opts: SurfaceScanOptions,
): Promise<SurfaceScanResult> {
  const n = opts.resolution;
  const count = workerCount(n);
  const heights = new Float32Array(n * n).fill(NaN);
  const started = performance.now();

  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    let settled = false;
    let finished = 0;
    const progressByBand = new Map<number, number>();
    const bandMs: number[] = [];

    const cleanup = () => {
      for (const w of workers) w.terminate();
      workers.length = 0;
      opts.signal?.removeEventListener("abort", onAbort);
    };
    function onAbort() {
      if (settled) return;
      settled = true;
      cleanup();
      reject("cancelled");
    }
    function fail(err: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener("abort", onAbort);

    /** Copy a band's rows into the shared map at their absolute offset. */
    const merge = (rowStart: number, band: Float32Array) => {
      heights.set(band, rowStart * n);
    };

    const reportProgress = () => {
      let done = 0;
      for (const rows of progressByBand.values()) done += rows;
      opts.onProgress?.(done / n);
    };

    // Contiguous bands, deliberately. Per-row cost is very uneven (a row of sky
    // exits on one coarse probe; a row of terrain runs the full bisect), so
    // striping rows across workers balances the bands far better — and measured
    // SLOWER on HiveWorld: 15.8s striped vs 11.9s contiguous, against 26.1s on a
    // single worker. Adjacent rows share noise-cache locality inside the
    // evaluator that a stride of 7 throws away, and that costs more than the
    // imbalance does.
    const rowsPerBand = Math.ceil(n / count);
    for (let i = 0; i < count; i++) {
      const rowStart = i * rowsPerBand;
      const rowEnd = Math.min(n, rowStart + rowsPerBand);
      if (rowStart >= rowEnd) break;

      const worker = new Worker(new URL("./surfaceWorker.ts", import.meta.url), { type: "module" });
      workers.push(worker);

      worker.onmessage = (e: MessageEvent<SurfaceResponse>) => {
        const msg = e.data;
        if (settled) return;

        if (msg.type === "error") return fail(new Error(msg.error));

        if (msg.type === "progress") {
          merge(msg.rowStart, msg.heights);
          progressByBand.set(msg.rowStart, msg.rowsDone);
          reportProgress();
          opts.onPartial?.(heights.slice());
          return;
        }

        merge(msg.rowStart, msg.heights);
        bandMs.push(msg.ms);
        progressByBand.set(msg.rowStart, msg.rowsDone);
        reportProgress();
        finished++;
        if (finished === workers.length) {
          settled = true;
          cleanup();
          resolve({
            heights,
            resolution: n,
            yMin: opts.yMin,
            yMax: opts.yMax,
            ms: performance.now() - started,
            workers: count,
            slowestBandMs: Math.max(...bandMs),
          });
        }
      };
      worker.onerror = (err) => fail(new Error(err.message || "Surface worker failed."));

      const req: SurfaceRequest = {
        nodes,
        edges,
        rootNodeId: opts.rootNodeId,
        resolution: n,
        rangeMin: opts.rangeMin,
        rangeMax: opts.rangeMax,
        yMin: opts.yMin,
        yMax: opts.yMax,
        contentFields: opts.contentFields,
        externalDensityExports: opts.externalDensityExports,
        rowStart,
        rowEnd,
      };
      worker.postMessage(req);
    }
  });
}
