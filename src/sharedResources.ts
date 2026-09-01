import { exportsFromJson, type DensityExportMap } from "./graphFromJson";

/**
 * Shared density resources loaded from the user's own Hytale install.
 *
 * Hytale ships ~18 files under `Server/HytaleGenerator/Density/` defining
 * exports that community graphs reference by name — `World-River-Map`,
 * `World-Continent-Map`, `Biome-Map`, the `Base-Simplex-*` family and the cave
 * sets. Without them, `Imported` resolves to 0 and a graph can collapse to a
 * constant.
 *
 * These are Hytale's Licensed Assets. The lab therefore:
 *   - never bundles them, and never ships them in the repo or the deployed site;
 *   - never persists them (no localStorage, no upload) — they live in memory for
 *     the session only;
 *   - reads them only from files the user picks from their own installation.
 *
 * The user supplies their own copy; nothing is redistributed.
 */

let loaded: DensityExportMap = {};
let fileCount = 0;

export interface LoadResult {
  files: number;
  exports: string[];
  failed: string[];
}

export function loadedSharedExports(): DensityExportMap {
  return loaded;
}

export function loadedSharedFileCount(): number {
  return fileCount;
}

export function clearSharedExports(): void {
  loaded = {};
  fileCount = 0;
}

/** Parse picked JSON files and merge every `ExportAs` subtree they define. */
export async function loadSharedResourceFiles(files: File[]): Promise<LoadResult> {
  const next: DensityExportMap = { ...loaded };
  const failed: string[] = [];
  let added = 0;

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".json")) continue;
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>;
      const stem = file.name.replace(/\.json$/i, "");
      // A standalone density file is importable under its own filename, in
      // addition to any ExportAs subtrees nested inside it.
      Object.assign(next, exportsFromJson(json, `shared_${stem}`));
      if (typeof json.Type === "string" && !next[stem]) {
        Object.assign(next, exportsFromJson({ ...json, ExportAs: stem }, `shared_${stem}`));
      }
      added++;
    } catch {
      failed.push(file.name);
    }
  }

  loaded = next;
  fileCount += added;
  return { files: added, exports: Object.keys(next).sort(), failed };
}
