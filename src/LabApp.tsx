import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listBundledGraphs } from "./bundledGraphs";
import { graphFromJson, type LabGraph } from "./graphFromJson";
import { LabImportPanel } from "./LabImportPanel";
import { surfaceScan, type SurfaceScanResult } from "./surfaceScan";
import { surfaceStats, type SurfaceStats } from "./terrainPaint";
import { LabMap, LabMapLegend } from "./LabMap";

/** 128-block window centred on origin — matches the desktop preview default. */
const RANGE_MIN = -64;
const RANGE_MAX = 64;
const RESOLUTION = 80;

/** Y window to scan for a surface, and how finely. */
const Y_MIN = 0;
const Y_MAX = 128;
const Y_STEPS = 32;

/**
 * Hytale worldgen leans on these named heights. The desktop app discovers them
 * per-biome; the lab seeds the documented defaults so BaseHeight-driven graphs
 * evaluate to something meaningful rather than zero.
 */
const CONTENT_FIELDS: Record<string, number> = { Base: 64, Water: 64, Bedrock: 0 };
const SEA_LEVEL = CONTENT_FIELDS.Water;

export function LabApp() {
  const bundled = useMemo(() => listBundledGraphs(), []);
  const [pasted, setPasted] = useState<LabGraph | null>(null);
  const graphs = useMemo(() => (pasted ? [pasted, ...bundled] : bundled), [pasted, bundled]);
  const [selected, setSelected] = useState<string>("");
  const [scan, setScan] = useState<SurfaceScanResult | null>(null);
  const [stats, setStats] = useState<SurfaceStats | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runId = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);


  useEffect(() => {
    if (!selected && graphs.length > 0) setSelected(graphs[0].name);
  }, [graphs, selected]);

  const run = useCallback(
    async (name: string) => {
      const graph = graphs.find((g) => g.name === name);
      if (!graph) {
        setError(`No bundled graph named "${name}".`);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const id = ++runId.current;
      setBusy(true);
      setError(null);
      setProgress(0);
      setScan(null);
      setStats(null);
      try {
        const result = await surfaceScan(graph.nodes, graph.edges, {
          resolution: RESOLUTION,
          rangeMin: RANGE_MIN,
          rangeMax: RANGE_MAX,
          yMin: Y_MIN,
          yMax: Y_MAX,
          ySteps: Y_STEPS,
          rootNodeId: graph.rootNodeId,
          contentFields: CONTENT_FIELDS,
          externalDensityExports: graph.exports,
          signal: controller.signal,
          onPartial: (heights) => {
            if (id !== runId.current) return;
            setScan({ heights, resolution: RESOLUTION, yMin: Y_MIN, yMax: Y_MAX, ms: 0 });
            setStats(surfaceStats(heights, SEA_LEVEL));
          },
          onProgress: (f) => {
            if (id === runId.current) setProgress(f);
          },
        });
        if (id !== runId.current) return;
        setScan(result);
        setStats(surfaceStats(result.heights, SEA_LEVEL));
      } catch (e) {
        if (id === runId.current && e !== "cancelled") {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (id === runId.current) setBusy(false);
      }
    },
    [graphs],
  );

  useEffect(() => {
    if (selected) void run(selected);
  }, [selected, run]);

  const active = graphs.find((g) => g.name === selected);
  const missing = active?.missingImports ?? [];
  const unsupported = active?.unsupported ?? [];
  const approximated = active?.approximatedGraphs ?? 0;
  const cells = RESOLUTION * RESOLUTION;
  const pct = (n: number) => `${Math.round((n / cells) * 100)}%`;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", background: "var(--tn-bg-secondary)",
          borderBottom: "1px solid var(--tn-border)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500 }}>TerraNova Lab</span>
        <span
          style={{
            fontSize: 11, color: "var(--tn-accent)",
            border: "1px solid var(--tn-border)", borderRadius: 4, padding: "2px 8px",
          }}
        >
          alpha
        </span>
      </header>

      <main
        style={{
          flex: 1, minHeight: 0, display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
        }}
      >
        <section style={{ borderRight: "1px solid var(--tn-border)", padding: 16, overflow: "auto" }}>
          <h2 style={labelStyle}>Bundled graphs</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 16 }}>
            {graphs.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => setSelected(g.name)}
                style={{
                  textAlign: "left", padding: "6px 10px", minHeight: 28,
                  fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
                  borderRadius: 6, border: "1px solid transparent",
                  background: g.name === selected ? "rgba(181,146,76,.15)" : "transparent",
                  color: g.name === selected ? "var(--tn-accent)" : "var(--tn-text-secondary)",
                }}
              >
                {g.name}
                <span style={{ float: "right", color: "var(--tn-text-muted)" }}>{g.nodes.length} · {g.kind}</span>
              </button>
            ))}
            {graphs.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--tn-text-muted)" }}>
                No bundled graphs were found in the TerraNova submodule.
              </p>
            )}
          </div>

          <LabImportPanel
            onError={setError}
            onLoad={(json, name) => {
              try {
                const g = graphFromJson(json, name);
                setPasted(g);
                setSelected(g.name);
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        </section>

        <section style={{ padding: 16, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h2 style={labelStyle}>Surface</h2>
            <span style={{ flex: 1 }} />
            {busy && (
              <span style={{ fontSize: 11, color: "var(--tn-text-muted)" }}>
                scanning {Math.round(progress * 100)}%
              </span>
            )}
          </div>

          {missing.length > 0 && (
            <p
              role="status"
              style={{
                marginBottom: 12, padding: "8px 10px", fontSize: 11,
                borderRadius: 6, border: "1px solid var(--tn-border)",
                background: "rgba(181,146,76,.10)", color: "var(--tn-text-secondary)",
              }}
            >
              {missing.length === 1 ? "Needs a shared resource that only ships" : `Needs ${missing.length} shared resources that only ship`}
              {" "}with the game: <code style={{ fontFamily: "var(--font-mono)" }}>{missing.join(", ")}</code>.
              Unresolved imports evaluate to zero, so this map is not what the graph really generates.
            </p>
          )}

          {(unsupported.length > 0 || approximated > 0) && (
            <p role="status" style={noticeStyle}>
              {approximated > 0 && (
                <>
                  {approximated} <code style={codeStyle}>Graph</code> node
                  {approximated === 1 ? " was" : "s were"} stubbed out. TerraNova has no
                  network generator, so whatever this graph carved — roads, rivers, ravines —
                  is missing, and the terrain around it may be wrong too.{" "}
                </>
              )}
              {unsupported.length > 0 && (
                <>
                  Unsupported node types evaluate to zero:{" "}
                  <code style={codeStyle}>
                    {unsupported.map((u) => (u.count > 1 ? `${u.type}×${u.count}` : u.type)).join(", ")}
                  </code>.
                </>
              )}
            </p>
          )}

          <LabMap
            heights={scan?.heights ?? null}
            resolution={RESOLUTION}
            seaLevel={SEA_LEVEL}
            peak={stats?.peak ?? SEA_LEVEL}
          />

          <div style={{ marginTop: 12 }}>
            {missing.length > 0 && (
            <p
              role="status"
              style={{
                marginBottom: 12, padding: "8px 10px", fontSize: 11,
                borderRadius: 6, border: "1px solid var(--tn-border)",
                background: "rgba(181,146,76,.10)", color: "var(--tn-text-secondary)",
              }}
            >
              {missing.length === 1 ? "Needs a shared resource that only ships" : `Needs ${missing.length} shared resources that only ship`}
              {" "}with the game: <code style={{ fontFamily: "var(--font-mono)" }}>{missing.join(", ")}</code>.
              Unresolved imports evaluate to zero, so this map is not what the graph really generates.
            </p>
          )}

          {(unsupported.length > 0 || approximated > 0) && (
            <p role="status" style={noticeStyle}>
              {approximated > 0 && (
                <>
                  {approximated} <code style={codeStyle}>Graph</code> node
                  {approximated === 1 ? " was" : "s were"} stubbed out. TerraNova has no
                  network generator, so whatever this graph carved — roads, rivers, ravines —
                  is missing, and the terrain around it may be wrong too.{" "}
                </>
              )}
              {unsupported.length > 0 && (
                <>
                  Unsupported node types evaluate to zero:{" "}
                  <code style={codeStyle}>
                    {unsupported.map((u) => (u.count > 1 ? `${u.type}×${u.count}` : u.type)).join(", ")}
                  </code>.
                </>
              )}
            </p>
          )}

          <LabMapLegend />
          </div>

          <dl
            style={{
              marginTop: 24, display: "grid", gridTemplateColumns: "auto 1fr",
              gap: "8px 16px", fontSize: 11,
            }}
          >
            <dt style={dtStyle}>Coverage</dt>
            <dd style={ddStyle}>
              {stats
                ? `${pct(stats.land)} land, ${pct(stats.water)} water, ${pct(stats.air)} air`
                : "—"}
            </dd>
            <dt style={dtStyle}>Sea level</dt>
            <dd style={ddStyle}>Y {SEA_LEVEL}</dd>
            <dt style={dtStyle}>Highest point</dt>
            <dd style={ddStyle}>{stats ? `Y ${Math.round(stats.peak)}` : "—"}</dd>
            <dt style={dtStyle}>Scan</dt>
            <dd style={ddStyle}>
              {RESOLUTION}&times;{RESOLUTION} columns, Y {Y_MIN} to {Y_MAX} in {Y_STEPS} steps
            </dd>
            <dt style={dtStyle}>Took</dt>
            <dd style={{ ...ddStyle, fontFamily: "var(--font-mono)" }}>
              {scan ? `${(scan.ms / 1000).toFixed(2)} s` : busy ? "…" : "—"}
            </dd>
          </dl>

          {error && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#e2726f" }} role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: "var(--tn-text-muted)",
  textTransform: "uppercase", letterSpacing: ".08em", margin: 0,
};
const noticeStyle: React.CSSProperties = {
  marginBottom: 12, padding: "8px 10px", fontSize: 11, borderRadius: 6,
  border: "1px solid var(--tn-border)", background: "rgba(181,146,76,.10)",
  color: "var(--tn-text-secondary)", lineHeight: 1.6,
};
const codeStyle: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const dtStyle: React.CSSProperties = { color: "var(--tn-text-muted)" };
const ddStyle: React.CSSProperties = { color: "var(--tn-text)", margin: 0 };
