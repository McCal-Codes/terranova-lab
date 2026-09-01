/**
 * No-op stand-ins for TerraNova's prop-preview components, aliased in by
 * vite.config.ts.
 *
 * `BaseNode` imports `PrefabPreviewMini` and `PropPlacementMiniCanvas`, and the
 * first pulls `PrefabPreview3D` -> `@react-three/fiber`, i.e. all of three.js.
 * They only ever render inside a Props editing context, which the lab does not
 * have — it is density-only — so stubbing them keeps the real node components
 * (and the real category colours, handles and layout) without the 3D bundle.
 */
// Props mirror the real components' so BaseNode's call sites still typecheck.
export function PrefabPreviewMini(_props: { fields: Record<string, unknown> }) {
  return null;
}

export function PropPlacementMiniCanvas(_props: { nodeId: string }) {
  return null;
}
