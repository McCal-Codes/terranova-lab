import { useRef, useState } from "react";
import { MAX_JSON_BYTES } from "./graphFromJson";

interface LabImportPanelProps {
  onLoad: (json: unknown, name: string) => void;
  onError: (message: string) => void;
}

/**
 * Paste or drop a Hytale biome / density JSON.
 *
 * Input here is untrusted — it comes from a chat community — so it is size
 * capped and parsed defensively before anything reaches the evaluator.
 */
export function LabImportPanel({ onLoad, onError }: LabImportPanelProps) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function accept(raw: string, name: string) {
    if (raw.length > MAX_JSON_BYTES) {
      onError(`That file is ${(raw.length / 1e6).toFixed(1)} MB, over the 8 MB cap.`);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      onError(`That isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    onLoad(parsed, name);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={labelStyle}>Your own JSON</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='Paste a biome or density file, e.g. {"Name": "Curve", "Terrain": { … }}'
        spellCheck={false}
        aria-label="Paste a Hytale biome or density JSON"
        style={{
          width: "100%", height: 96, marginTop: 12, padding: 8, resize: "vertical",
          background: "var(--tn-surface)", color: "var(--tn-text)",
          border: "1px solid var(--tn-border)", borderRadius: 6,
          fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => (text.trim() ? accept(text, "Pasted graph") : onError("Paste some JSON first."))}
          style={buttonStyle}
        >
          Render pasted JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} style={buttonStyle}>
          Open a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > MAX_JSON_BYTES) {
              onError(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB, over the 8 MB cap.`);
              return;
            }
            accept(await file.text(), file.name.replace(/\.json$/i, ""));
          }}
        />
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: "var(--tn-text-muted)",
  textTransform: "uppercase", letterSpacing: ".08em", margin: 0,
};
const buttonStyle: React.CSSProperties = {
  minHeight: 28, padding: "0 12px", fontSize: 11, fontWeight: 500, cursor: "pointer",
  borderRadius: 6, border: "1px solid var(--tn-border)",
  background: "var(--tn-panel)", color: "var(--tn-text)",
};
