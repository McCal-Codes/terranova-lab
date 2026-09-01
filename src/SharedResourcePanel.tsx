import { useRef, useState } from "react";
import { loadSharedResourceFiles, loadedSharedFileCount, clearSharedExports } from "./sharedResources";

interface SharedResourcePanelProps {
  onChange: () => void;
  onError: (message: string) => void;
}

/**
 * Load shared density resources from the user's own Hytale install.
 *
 * These are Hytale's assets, so the lab never bundles or persists them — the
 * user points at their own copy and it lives in memory for the session.
 */
export function SharedResourcePanel({ onChange, onError }: SharedResourcePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={labelStyle}>Shared resources</h2>
      <p style={{ marginTop: 8, fontSize: 11, color: "var(--tn-text-muted)", lineHeight: 1.6 }}>
        Graphs that reference vanilla resources by name (<code style={mono}>World-River-Map</code>,{" "}
        <code style={mono}>Biome-Map</code>, …) need them loaded to evaluate. Pick the JSON files from
        your own install at <code style={mono}>Server/HytaleGenerator/Density/</code>. They stay in this
        tab for the session — nothing is uploaded, stored or shipped with the site.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => inputRef.current?.click()} style={buttonStyle}>
          Load from my install
        </button>
        {loadedSharedFileCount() > 0 && (
          <button
            type="button"
            onClick={() => {
              clearSharedExports();
              setStatus(null);
              onChange();
            }}
            style={buttonStyle}
          >
            Clear
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          style={{ display: "none" }}
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length === 0) return;
            try {
              const result = await loadSharedResourceFiles(files);
              setStatus(
                `${result.files} file${result.files === 1 ? "" : "s"}, ` +
                  `${result.exports.length} export${result.exports.length === 1 ? "" : "s"} available` +
                  (result.failed.length > 0 ? ` — ${result.failed.length} could not be parsed` : ""),
              );
              onChange();
            } catch (err) {
              onError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
      {status && (
        <p style={{ marginTop: 8, fontSize: 11, color: "var(--tn-highlight)" }} role="status">
          {status}
        </p>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: "var(--tn-text-muted)",
  textTransform: "uppercase", letterSpacing: ".08em", margin: 0,
};
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const buttonStyle: React.CSSProperties = {
  minHeight: 28, padding: "0 12px", fontSize: 11, fontWeight: 500, cursor: "pointer",
  borderRadius: 6, border: "1px solid var(--tn-border)",
  background: "var(--tn-panel)", color: "var(--tn-text)",
};
