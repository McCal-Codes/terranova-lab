import type { Edge, Node } from "@xyflow/react";
import { isBiomeFile, normalizeImport } from "@/utils/fileTypeDetection";
import { terrainGraphFromBiome } from "@/utils/biomePreviewGraph";
import { jsonToGraph } from "@/utils/jsonToGraph";
import { collectExternalImportedNames } from "@/utils/densityExportRegistry";
import { approximateGraphNodes, findUnsupported, type UnsupportedUse } from "./unsupported";

export type DensityExportMap = Record<string, { nodes: Node[]; edges: Edge[] }>;

export interface LabGraph {
  name: string;
  nodes: Node[];
  edges: Edge[];
  /** Evaluation root. Without it the evaluator picks its own, rarely the terrain. */
  rootNodeId: string | undefined;
  kind: "biome" | "density";
  /** `ExportAs` subtrees defined by this file, so it can resolve its own imports. */
  exports: DensityExportMap;
  /** Every external `Imported` name this graph references. */
  importNames: string[];
  /** Node types the evaluator has no handler for. */
  unsupported: UnsupportedUse[];
  /** How many `Graph` nodes were swapped for their BackgroundValue. */
  approximatedGraphs: number;
}

/**
 * Guard rails for pasted input. The evaluator is pure and sandboxed, so the
 * risk is a hung tab rather than anything worse — but a hang reads as "broken".
 */
export const MAX_NODES = 4000;
export const MAX_JSON_BYTES = 8 * 1024 * 1024;

/** Unwrap `{ Type: "Exported", Input: … }` down to the body worth previewing. */
export function unwrapExported(record: Record<string, unknown>): Record<string, unknown> {
  if (record.Type !== "Exported") return record;
  const input =
    record.Input ??
    (Array.isArray(record.Inputs) && record.Inputs.length > 0 ? record.Inputs[0] : null);
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : record;
}

/** Collect every `ExportAs`-tagged subtree, at any depth. */
export function collectExports(value: unknown, out: Map<string, Record<string, unknown>>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectExports(item, out);
    return;
  }
  const record = value as Record<string, unknown>;
  const exportAs = typeof record.ExportAs === "string" ? record.ExportAs.trim() : "";
  if (exportAs && typeof record.Type === "string") out.set(exportAs, unwrapExported(record));
  for (const child of Object.values(record)) collectExports(child, out);
}

export function exportsFromJson(json: unknown, idPrefix = "ext"): DensityExportMap {
  const bodies = new Map<string, Record<string, unknown>>();
  collectExports(json, bodies);
  const out: DensityExportMap = {};
  for (const [name, body] of bodies) {
    try {
      const internal = normalizeImport(body) as Parameters<typeof jsonToGraph>[0];
      const { nodes, edges } = jsonToGraph(internal, 0, 0, `${idPrefix}_${name}`);
      if (nodes.length > 0) out[name] = { nodes, edges };
    } catch {
      // Skip an export the shared pipeline can't read; the rest still resolve.
    }
  }
  return out;
}

/** Root = the node nothing downstream consumes. Mirrors findRootNodes in the app. */
function lastRoot(nodes: Node[], edges: Edge[]): string | undefined {
  const consumed = new Set(edges.map((e) => e.source));
  const roots = nodes.filter((n) => !consumed.has(n.id));
  return (roots[0] ?? nodes[nodes.length - 1])?.id;
}

/**
 * Convert one Hytale JSON file into a previewable graph.
 *
 * Biome wrappers and standalone density files need different treatment: the
 * interesting part of a biome is `Terrain.Density`, not the wrapper, and
 * converting the whole file yields a root that isn't a density at all — which
 * evaluates as solid everywhere. `terrainGraphFromBiome` is the app's own
 * extractor for that case.
 *
 * Everything here delegates to TerraNova's unmodified functions, so a file that
 * imports correctly in the desktop app imports correctly here.
 */
export function graphFromJson(
  json: unknown,
  name: string,
  filePath = "",
  ambientExports: DensityExportMap = {},
): LabGraph {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Expected a JSON object at the top level.");
  }
  const record = json as Record<string, unknown>;
  const ownExports = exportsFromJson(record, `own_${name}`);
  const exports = { ...ambientExports, ...ownExports };

  let nodes: Node[];
  let edges: Edge[];
  let rootNodeId: string | undefined;
  let kind: LabGraph["kind"];

  if (isBiomeFile(record, filePath)) {
    const g = terrainGraphFromBiome(record);
    if (g.nodes.length === 0) throw new Error("Biome produced an empty terrain graph.");
    nodes = g.nodes;
    edges = g.edges;
    rootNodeId = g.outputNodeId ?? lastRoot(g.nodes, g.edges);
    kind = "biome";
  } else {
    const internal = normalizeImport(unwrapExported(record)) as Parameters<typeof jsonToGraph>[0];
    const g = jsonToGraph(internal, 0, 0, `paste_${name}`);
    if (g.nodes.length === 0) throw new Error("File produced an empty density graph.");
    nodes = g.nodes;
    edges = g.edges;
    rootNodeId = lastRoot(g.nodes, g.edges);
    kind = "density";
  }

  const unsupported = findUnsupported(nodes, edges);
  const approx = approximateGraphNodes(nodes, edges);
  nodes = approx.nodes;

  if (nodes.length > MAX_NODES) {
    throw new Error(`Graph has ${nodes.length} nodes, over the ${MAX_NODES} cap.`);
  }

  return {
    name,
    nodes,
    edges,
    rootNodeId,
    kind,
    exports,
    importNames: collectExternalImportedNames(nodes, edges),
    unsupported,
    approximatedGraphs: approx.replaced,
  };
}

/**
 * Imports nothing can satisfy, given what is currently loaded.
 *
 * Recomputed rather than baked in at conversion time: the user can load shared
 * resources from their Hytale install after a graph is already on screen, and
 * previously-missing names should stop being missing.
 */
export function unresolvedImports(graph: LabGraph, ambient: DensityExportMap): string[] {
  return graph.importNames.filter((name) => !graph.exports[name] && !ambient[name]);
}

/** Everything available to a graph: its own exports win over ambient ones. */
export function mergedExports(graph: LabGraph, ambient: DensityExportMap): DensityExportMap {
  return { ...ambient, ...graph.exports };
}
