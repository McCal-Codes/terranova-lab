import { useEffect, useRef } from "react";
import { classifySurface } from "./terrainPaint";

interface LabMapProps {
  heights: Float32Array | null;
  resolution: number;
  seaLevel: number;
  peak: number;
}

/**
 * Top-down surface map: land, water and air.
 *
 * The canvas backing store is the scan grid itself and CSS scales it up, so
 * painting stays O(resolution^2) and the pixelated upscale stays honest about
 * how densely the volume was actually sampled.
 */
export function LabMap({ heights, resolution, seaLevel, peak }: LabMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heights) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = resolution;
    const image = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const [r, g, b] = classifySurface(heights[i], seaLevel, peak);
      const o = i * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [heights, resolution, seaLevel, peak]);

  return (
    <canvas
      ref={canvasRef}
      width={resolution}
      height={resolution}
      role="img"
      aria-label="Top-down surface map showing land, water and air"
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        display: "block",
        borderRadius: 4,
        border: "1px solid var(--tn-border)",
        background: "var(--tn-surface)",
        imageRendering: "pixelated",
      }}
    />
  );
}

const SWATCHES: { label: string; color: string }[] = [
  { label: "Water", color: "rgb(40,92,175)" },
  { label: "Beach", color: "rgb(226,214,168)" },
  { label: "Land", color: "rgb(74,122,54)" },
  { label: "Peaks", color: "rgb(190,182,170)" },
  { label: "Air", color: "rgb(22,20,18)" },
];

export function LabMapLegend() {
  return (
    <ul
      style={{
        display: "flex", flexWrap: "wrap", gap: 12,
        listStyle: "none", margin: 0, padding: 0, fontSize: 11,
        color: "var(--tn-text-muted)",
      }}
    >
      {SWATCHES.map((s) => (
        <li key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: 2,
              background: s.color, border: "1px solid var(--tn-border)",
            }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
