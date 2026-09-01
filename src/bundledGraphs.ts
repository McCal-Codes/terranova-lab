import {
  collectExports,
  exportsFromJson,
  graphFromJson,
  type DensityExportMap,
  type LabGraph,
} from "./graphFromJson";

/**
 * Bundled example graphs from the TerraNova submodule's `templates/`.
 *
 * TerraNova's densityExportRegistry globs `../../../templates/**` relative to
 * its own file; vendoring it under `vendor/terranova/` changes that relative
 * depth, so discovery happens lab-side. Only discovery is local — conversion
 * runs through the app's own functions unmodified.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  [
    "../vendor/terranova/templates/**/HytaleGenerator/Density/**/*.json",
    "../vendor/terranova/templates/references/**/*.json",
  ],
  { eager: true, import: "default" },
);

function stemOf(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.json$/i, "") ?? filePath;
}

let exportCache: DensityExportMap | null = null;

/** Every `ExportAs` subtree across the bundled templates, keyed by name. */
export function bundledDensityExports(): DensityExportMap {
  if (exportCache) return exportCache;
  const out: DensityExportMap = {};
  for (const [filePath, json] of Object.entries(modules)) {
    if (!json || typeof json !== "object" || Array.isArray(json)) continue;
    Object.assign(out, exportsFromJson(json, `bundled_${stemOf(filePath)}`));
    // A standalone Density file is itself importable under its filename.
    const record = json as Record<string, unknown>;
    const stem = stemOf(filePath);
    if (stem && typeof record.Type === "string" && !out[stem]) {
      const bodies = new Map<string, Record<string, unknown>>();
      collectExports({ ...record, ExportAs: stem }, bodies);
      Object.assign(out, exportsFromJson({ ...record, ExportAs: stem }, `bundled_${stem}`));
    }
  }
  exportCache = out;
  return out;
}

let cache: LabGraph[] | null = null;

export function listBundledGraphs(): LabGraph[] {
  if (cache) return cache;
  const ambient = bundledDensityExports();
  const out: LabGraph[] = [];
  for (const [filePath, json] of Object.entries(modules)) {
    try {
      out.push(graphFromJson(json, stemOf(filePath), filePath, ambient));
    } catch {
      // A template the shared pipeline can't read shouldn't take the list down.
    }
  }
  cache = out.sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}
