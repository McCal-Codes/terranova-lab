import type { Edge, Node } from "@xyflow/react";
import type { SurfaceRequest, SurfaceResponse } from "./surfaceWorker";

export interface SurfaceScanOptions {
  resolution: number;
  rangeMin: number;
  rangeMax: number;
  yMin: number;
  yMax: number;
  ySteps: number;
  rootNodeId?: string;
  contentFields: Record<string, number>;
  externalDensityExports?: Record<string, { nodes: Node[]; edges: Edge[] }>;
  onProgress?: (fraction: number) => void;
  /** Partial map, emitted every few rows so the UI can paint mid-scan. */
  onPartial?: (heights: Float32Array) => void;
  signal?: AbortSignal;
}

export interface SurfaceScanResult {
  heights: Float32Array;
  resolution: number;
  yMin: number;
  yMax: number;
  ms: number;
}

/** Runs one surface scan in a dedicated worker. Rejects with "cancelled" if aborted. */
export function surfaceScan(
  nodes: Node[],
  edges: Edge[],
  opts: SurfaceScanOptions,
): Promise<SurfaceScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./surfaceWorker.ts", import.meta.url), { type: "module" });

    const cleanup = () => {
      worker.terminate();
      opts.signal?.removeEventListener("abort", onAbort);
    };
    function onAbort() {
      cleanup();
      reject("cancelled");
    }
    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener("abort", onAbort);

    worker.onmessage = (e: MessageEvent<SurfaceResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        opts.onProgress?.(msg.done / msg.total);
        if (msg.heights) opts.onPartial?.(msg.heights);
        return;
      }
      cleanup();
      if (msg.type === "error") reject(new Error(msg.error));
      else {
        resolve({
          heights: msg.heights,
          resolution: opts.resolution,
          yMin: opts.yMin,
          yMax: opts.yMax,
          ms: msg.ms,
        });
      }
    };
    worker.onerror = (err) => {
      cleanup();
      reject(new Error(err.message || "Surface worker failed."));
    };

    const req: SurfaceRequest = {
      nodes,
      edges,
      rootNodeId: opts.rootNodeId,
      resolution: opts.resolution,
      rangeMin: opts.rangeMin,
      rangeMax: opts.rangeMax,
      yMin: opts.yMin,
      yMax: opts.yMax,
      ySteps: opts.ySteps,
      contentFields: opts.contentFields,
      externalDensityExports: opts.externalDensityExports,
    };
    worker.postMessage(req);
  });
}
