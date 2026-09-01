import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

const TERRANOVA_SRC = path.resolve(__dirname, "./vendor/terranova/src");

/**
 * TerraNova Lab — standalone browser visualizer.
 *
 * TerraNova is vendored as a git submodule and consumed VERBATIM: the `@`
 * alias points straight into its `src/`, so the lab evaluates density with the
 * exact same code the desktop app ships. Nothing is copied, so there is nothing
 * to drift.
 *
 * `@tauri-apps/api/core` is stubbed because a few shared modules reach it
 * transitively (densityWorkerClient -> previewWorkerLog -> settingsStore ->
 * exportSvg). Stubbing at that boundary keeps `@tauri-apps` out of the bundle
 * without patching the submodule.
 */
/**
 * Redirect a few shared-module imports onto browser stubs.
 *
 * Matching happens on the specifier *shape*, not on an alias prefix, because
 * these are imported both as "@/utils/x" and as relative "./x" inside the
 * submodule — an alias keyed on "@/utils/x" silently misses the relative form.
 *
 *   @tauri-apps/*      -> desktop-only IPC; keeps Tauri out of the bundle.
 *   previewWorkerLog   -> reads a debug flag off settingsStore, and that single
 *                         import drags in the whole node registry and three.js:
 *                           densityWorkerClient -> previewWorkerLog
 *                             -> settingsStore -> exportSvg -> editorStore
 *                             -> biomeSectionsSlice -> materialSectionNodes
 *                             -> nodes/index -> ClampNode -> BaseNode
 *                             -> PrefabPreviewMini -> @react-three/fiber
 *
 * Both stub plumbing only. The evaluator, the node schema and the Hytale
 * import/export pipeline are used exactly as the desktop app ships them.
 */
function stubDesktopOnly(): Plugin {
  const tauri = path.resolve(__dirname, "./src/tauriStub.ts");
  const workerLog = path.resolve(__dirname, "./src/previewWorkerLogStub.ts");
  return {
    name: "terranova-lab:stub-desktop-only",
    enforce: "pre",
    resolveId(source) {
      if (source.startsWith("@tauri-apps/")) return tauri;
      if (/(^|[/\\])previewWorkerLog$/.test(source)) return workerLog;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    stubDesktopOnly(),
    react({ fastRefresh: false }),
    process.env.ANALYZE
      ? visualizer({ open: false, filename: "dist/stats.html", gzipSize: true })
      : null,
  ].filter(Boolean),
  define: {
    __APP_VERSION__: JSON.stringify("lab"),
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    minify: "esbuild",
    cssMinify: true,
  },
  resolve: {
    alias: [
      { find: "@", replacement: TERRANOVA_SRC },
    ],
  },
  server: { port: 5180, strictPort: true },
});
