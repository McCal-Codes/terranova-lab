import type { Edge, Node } from "@xyflow/react";
import { normalizeImport } from "@/utils/fileTypeDetection";
import { jsonToGraph } from "@/utils/jsonToGraph";

/**
 * Bundled example graphs, read from the TerraNova submodule's `templates/`.
 *
 * TerraNova's own densityExportRegistry globs `../../../templates/**` relative
 * to its own file. Vendoring it under `vendor/terranova/` changes that relative
 * depth, so the glob finds nothing here — hence discovery happens lab-side.
 *
 * Only *discovery* is local. Every file still goes through the unmodified
 * `normalizeImport` -> `jsonToGraph` path the desktop app uses, so what renders
 * here is what the app would render. Nothing about the translation is forked.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  [
    "../vendor/terranova/templates/**/HytaleGenerator/Density/**/*.json",
    "../vendor/terranova/templates/references/**/*.json",
  ],
  { eager: true, import: "default" },
);

export interface BundledGraph {
  name: string;
  nodes: Node[];
  edges: Edge[];
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

function build(): BundledGraph[] {
  const out: BundledGraph[] = [];
  for (const [filePath, json] of Object.entries(modules)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    const name = filePath.split("/").pop()?.replace(/\.json$/i, "") ?? filePath;
    try {
      const body = unwrapExported(json as Record<string, unknown>);
      const internal = normalizeImport(body) as Parameters<typeof jsonToGraph>[0];
      const { nodes, edges } = jsonToGraph(internal, 0, 0, `bundled_${name}`);
      if (nodes.length > 0) out.push({ name, nodes, edges });
    } catch {
      // A template the shared pipeline can't read is a real signal, but it
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
