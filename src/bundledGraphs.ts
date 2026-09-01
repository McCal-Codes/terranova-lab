import type { Edge, Node } from "@xyflow/react";
import { isBiomeFile, normalizeImport } from "@/utils/fileTypeDetection";
import { terrainGraphFromBiome } from "@/utils/biomePreviewGraph";
import { jsonToGraph } from "@/utils/jsonToGraph";
import { collectExternalImportedNames } from "@/utils/densityExportRegistry";

/**
 * Bundled example graphs, read from the TerraNova submodule's `templates/`.
 *
 * TerraNova's densityExportRegistry globs `../../../templates/**` relative to
 * its own file; vendoring it under `vendor/terranova/` changes that relative
 * depth, so discovery has to happen lab-side. Only discovery is local — the
 * conversion below uses the app's own functions unmodified.
 *
 * Two shapes live in `templates/`, and they need different treatment:
 *   - Biome wrappers (templates/references/*.json) — the interesting terrain is
 *     `Terrain.Density`, not the wrapper. Converting the whole file yields a
 *     graph whose root isn't a density at all, which evaluates as solid
 *     everywhere. `terrainGraphFromBiome` is the app's own extractor for this.
 *   - Standalone density files (Density/*.json) — converted directly.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  [
    "../vendor/terranova/templates/**/HytaleGenerator/Density/**/*.json",
    "../vendor/terranova/templates/references/**/*.json",
  ],
  { eager: true, import: "default" },
);

/**
 * Shared resources: any subtree tagged `ExportAs`, keyed by that name.
 *
 * Hytale graphs reference each other with `{ "Type": "Imported", "Name": … }`.
 * The evaluator resolves those through `externalDensityExports`; without it,
 * handleImported returns 0 and a graph that leans on shared resources collapses
 * to a constant. Tropical_Pirate_Islands does exactly that — it evaluated to a
 * flat 0.485 everywhere until this index was supplied.
 */
export type DensityExportMap = Record<string, { nodes: Node[]; edges: Edge[] }>;

export interface BundledGraph {
  name: string;
  nodes: Node[];
  edges: Edge[];
  /** Evaluation root. Without this the evaluator picks its own, which is rarely the terrain. */
  rootNodeId: string | undefined;
  kind: "biome" | "density";
  /**
   * `Imported` names this graph needs that aren't in the bundled set — almost
   * always vanilla Hytale shared resources, which live in the game's synced
   * assets and are unreadable from a browser. The evaluator resolves an
   * unknown import to 0, which silently flattens the whole graph, so these are
   * surfaced rather than swallowed.
   */
  missingImports: string[];
}

/** Unwrap `{ Type: "Exported", Input: … }` down to the body worth previewing. */
function unwrapExported(record: Record<string, unknown>): Record<string, unknown> {
  if (record.Type !== "Exported") return record;
  const input =
    record.Input ??
    (Array.isArray(record.Inputs) && record.Inputs.length > 0 ? record.Inputs[0] : null);
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : record;
}

/** Root = the node nothing downstream consumes. Mirrors findRootNodes in the app. */
function lastRoot(nodes: Node[], edges: Edge[]): string | undefined {
  const consumed = new Set(edges.map((e) => e.source));
  const roots = nodes.filter((n) => !consumed.has(n.id));
  return (roots[0] ?? nodes[nodes.length - 1])?.id;
}

/** Collect every `ExportAs`-tagged subtree, at any depth. */
function collectExports(value: unknown, out: Map<string, Record<string, unknown>>): void {
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

function buildExports(): DensityExportMap {
  const bodies = new Map<string, Record<string, unknown>>();
  for (const [filePath, json] of Object.entries(modules)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    collectExports(json, bodies);
    // A standalone Density file is itself importable under its filename.
    const record = json as Record<string, unknown>;
    const stem = filePath.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (stem && typeof record.Type === "string" && !bodies.has(stem)) {
      bodies.set(stem, unwrapExported(record));
    }
  }

  const out: DensityExportMap = {};
  for (const [name, body] of bodies) {
    try {
      const internal = normalizeImport(body) as Parameters<typeof jsonToGraph>[0];
      const { nodes, edges } = jsonToGraph(internal, 0, 0, `ext_${name}`);
      if (nodes.length > 0) out[name] = { nodes, edges };
    } catch {
      // Skip an export the shared pipeline can't read; the rest still resolve.
    }
  }
  return out;
}

let exportCache: DensityExportMap | null = null;

export function bundledDensityExports(): DensityExportMap {
  if (!exportCache) exportCache = buildExports();
  return exportCache;
}

function unresolved(nodes: Node[], edges: Edge[], exports: DensityExportMap): string[] {
  return collectExternalImportedNames(nodes, edges).filter((n) => !exports[n]);
}

function build(): BundledGraph[] {
  const out: BundledGraph[] = [];
  const exports = bundledDensityExports();

  for (const [filePath, json] of Object.entries(modules)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    const record = json as Record<string, unknown>;
    const name = filePath.split("/").pop()?.replace(/\.json$/i, "") ?? filePath;

    try {
      if (isBiomeFile(record, filePath)) {
        const g = terrainGraphFromBiome(record);
        if (g.nodes.length > 0) {
          out.push({
            name,
            nodes: g.nodes,
            edges: g.edges,
            rootNodeId: g.outputNodeId ?? lastRoot(g.nodes, g.edges),
            kind: "biome",
            missingImports: unresolved(g.nodes, g.edges, exports),
          });
        }
        continue;
      }

      const body = unwrapExported(record);
      const internal = normalizeImport(body) as Parameters<typeof jsonToGraph>[0];
      const { nodes, edges } = jsonToGraph(internal, 0, 0, `bundled_${name}`);
      if (nodes.length > 0) {
        out.push({
          name, nodes, edges,
          rootNodeId: lastRoot(nodes, edges),
          kind: "density",
          missingImports: unresolved(nodes, edges, exports),
        });
      }
    } catch {
      // A template the shared pipeline can't read is worth knowing about, but it
      // shouldn't take the whole list down — skip it and show the rest.
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

let cache: BundledGraph[] | null = null;

export function listBundledGraphs(): BundledGraph[] {
  if (!cache) cache = build();
  return cache;
}
