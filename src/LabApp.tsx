import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listBundledGraphs } from "./bundledGraphs";
import { createWorkerInstance, type EvalResult, type WorkerInstance } from "@/utils/densityWorkerClient";
import type { ColormapId } from "@/utils/colormaps";
import { LabMap } from "./LabMap";

/** Matches the desktop preview's default window: 128 blocks centred on origin. */
const RANGE_MIN = -64;
const RANGE_MAX = 64;
const Y_LEVEL = 64;
const RESOLUTION = 128;

/** M0 benchmark ladder — the numbers the Discord thread needs. */
const BENCH_STEPS = [64, 128, 256];

/**
 * Hytale worldgen leans on these named heights. The desktop app discovers them
 * per-biome; the lab seeds the documented defaults so BaseHeight-driven graphs
 * evaluate to something meaningful instead of zero.
 */
const CONTENT_FIELDS: Record<string, number> = { Base: 64, Water: 64, Bedrock: 0 };

interface Bench {
  resolution: number;
  ms: number;
}

export function LabApp() {
  const graphs = useMemo(() => listBundledGraphs(), []);
  const exportNames = useMemo(() => graphs.map((g) => g.name), [graphs]);
  const [selected, setSelected] = useState<string>("");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [bench, setBench] = useState<Bench[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<WorkerInstance | null>(null);

  if (!workerRef.current) workerRef.current = createWorkerInstance();

  useEffect(() => {
    if (!selected && exportNames.length > 0) setSelected(exportNames[0]);
  }, [exportNames, selected]);

  useEffect(() => () => workerRef.current?.cancel(), []);

  const run = useCallback(async (name: string) => {
    const graph = graphs.find((g) => g.name === name);
    if (!graph) {
      setError(`No bundled graph found for "${name}".`);
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const worker = workerRef.current!;
      const timings: Bench[] = [];
      let last: EvalResult | null = null;
      for (const resolution of BENCH_STEPS) {
        const t0 = performance.now();
        last = await worker.evaluate({
          nodes: graph.nodes,
          edges: graph.edges,
          resolution,
          rangeMin: RANGE_MIN,
          rangeMax: RANGE_MAX,
          yLevel: Y_LEVEL,
          options: { contentFields: CONTENT_FIELDS },
        });
        timings.push({ resolution, ms: performance.now() - t0 });
        if (resolution === RESOLUTION) setResult(last);
      }
      setBench(timings);
    } catch (e) {
      if (e !== "cancelled") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [graphs]);

  useEffect(() => {
    if (selected) void run(selected);
  }, [selected, run]);

  const colormap: ColormapId = "terrain";

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

      <main style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <section style={{ borderRight: "1px solid var(--tn-border)", padding: 16, overflow: "auto" }}>
          <h2 style={labelStyle}>Bundled graphs</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 16 }}>
            {exportNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelected(name)}
                style={{
                  textAlign: "left", padding: "6px 10px", minHeight: 28,
                  fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
                  borderRadius: 6, border: "1px solid transparent",
                  background: name === selected ? "rgba(181,146,76,.15)" : "transparent",
                  color: name === selected ? "var(--tn-accent)" : "var(--tn-text-secondary)",
                }}
              >
                {name}
              </button>
            ))}
            {exportNames.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--tn-text-muted)" }}>
                No bundled graphs were found in the TerraNova submodule.
              </p>
            )}
          </div>
        </section>

        <section style={{ padding: 16, overflow: "auto" }}>
          <h2 style={labelStyle}>Output</h2>
          <div style={{ marginTop: 8 }}>
            <LabMap
              values={result?.values ?? null}
              resolution={RESOLUTION}
              minValue={result?.minValue ?? 0}
              maxValue={result?.maxValue ?? 0}
              colormap={colormap}
            />
          </div>

          <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", fontSize: 11 }}>
            <dt style={dtStyle}>Slice</dt>
            <dd style={ddStyle}>
              X/Z at Y {Y_LEVEL}, {RANGE_MIN} to {RANGE_MAX}
            </dd>
            <dt style={dtStyle}>Range</dt>
            <dd style={ddStyle}>
              {result ? `${result.minValue.toFixed(2)} to ${result.maxValue.toFixed(2)}` : "—"}
            </dd>
          </dl>

          <div style={{ marginTop: 24 }}>
            <h2 style={labelStyle}>Evaluation time</h2>
            <table style={{ marginTop: 12, fontSize: 11, borderCollapse: "collapse" }}>
              <tbody>
                {bench.map((b) => (
                  <tr key={b.resolution}>
                    <td style={{ ...dtStyle, paddingRight: 16 }}>{b.resolution}&times;{b.resolution}</td>
                    <td style={{ ...ddStyle, fontFamily: "var(--font-mono)" }}>{b.ms.toFixed(1)} ms</td>
                  </tr>
                ))}
                {bench.length === 0 && (
                  <tr><td style={dtStyle}>{busy ? "measuring…" : "—"}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {error && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#e2726f" }} role="alert">{error}</p>
          )}
        </section>
      </main>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: "var(--tn-text-muted)",
  textTransform: "uppercase", letterSpacing: ".08em",
};
const dtStyle: React.CSSProperties = { color: "var(--tn-text-muted)" };
const ddStyle: React.CSSProperties = { color: "var(--tn-text)", margin: 0 };
