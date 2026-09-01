import { useEffect, useRef } from "react";
import { getColormap, type ColormapId } from "@/utils/colormaps";

interface LabMapProps {
  values: Float32Array | null;
  resolution: number;
  minValue: number;
  maxValue: number;
  colormap: ColormapId;
}

/**
 * Top-down (X/Z) slice of the evaluated density field.
 *
 * The canvas backing store is the evaluation grid itself; CSS scales it up.
 * That keeps painting O(resolution^2) rather than O(display pixels), and the
 * pixelated upscale is honest about the sample density.
 */
export function LabMap({ values, resolution, minValue, maxValue, colormap }: LabMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !values) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = resolution;
    const ramp = getColormap(colormap).ramp;
    const span = maxValue - minValue;
    const uniform = Math.abs(span) < 1e-8;
    const image = ctx.createImageData(n, n);

    for (let i = 0; i < n * n; i++) {
      const raw = values[i];
      const t = !Number.isFinite(raw) || uniform ? 0.5 : (raw - minValue) / span;
      const [r, g, b] = ramp(Math.max(0, Math.min(1, t)));
      const o = i * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [values, resolution, minValue, maxValue, colormap]);

  return (
    <canvas
      ref={canvasRef}
      width={resolution}
      height={resolution}
      aria-label="Top-down density slice of the current graph"
      role="img"
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
