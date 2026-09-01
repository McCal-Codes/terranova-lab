/**
 * No-op stand-in for TerraNova's `@/utils/previewWorkerLog`, aliased in by
 * vite.config.ts.
 *
 * Why this exists: the real module reads a debug flag off `settingsStore`, and
 * that one import transitively drags the entire node registry and three.js into
 * the bundle:
 *
 *   densityWorkerClient -> previewWorkerLog -> settingsStore -> exportSvg
 *     -> editorStore -> biomeSectionsSlice -> materialSectionNodes
 *     -> nodes/index -> GenericNode -> BaseNode -> PrefabPreviewMini
 *     -> @react-three/fiber
 *
 * The lab has no debug-logging UI to toggle, so cutting the chain here costs
 * nothing and keeps densityWorkerClient itself shared verbatim with the app.
 * Note this stubs *plumbing*, never domain logic — the evaluator and the
 * import/export pipeline stay exactly as the desktop app ships them.
 */

export function isPreviewWorkerLoggingEnabled(): boolean {
  return false;
}

export function previewWorkerLog(): void {}

export function previewWorkerWarn(scope: string, ...args: unknown[]): void {
  console.warn(`[${scope}]`, ...args);
}

export function previewWorkerLogFromWorker(): void {}
