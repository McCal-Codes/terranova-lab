import type { Edge, Node } from "@xyflow/react";
import { DENSITY_TYPES, getNodeType } from "@/utils/density/evalTypes";

/**
 * Node types the evaluator has no handler for, which it silently resolves to 0.
 *
 * A zero in the wrong place is not a small error: `Min(terrain, 0)` pins the
 * whole field to 0, and 0 counts as solid, so one unsupported node can turn a
 * detailed biome into a flat slab. Better to name them than to draw that map
 * and call it the terrain.
 *
 * Curve types (`Manual`, `SquareBump`, …) are excluded: they attach to a
 * CurveMapper as a field rather than evaluating as density nodes.
 */
const CURVE_TYPES = new Set([
  "Manual", "SquareBump", "InverseLerp", "Linear", "Smoothstep",
  "Constant.Curve", "Sine", "Exponential", "Logarithmic", "Step",
]);

export interface UnsupportedUse {
  type: string;
  count: number;
}

export function findUnsupported(nodes: Node[], _edges: Edge[]): UnsupportedUse[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const type = getNodeType(node);
    if (!type || CURVE_TYPES.has(type) || DENSITY_TYPES.has(type)) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

/**
 * Replace unevaluable `Graph` nodes with their own declared `BackgroundValue`.
 *
 * `Graph` renders distance to a generated network (roads, rivers, cave systems)
 * built by its `GraphGenerator` passes — a subsystem TerraNova does not
 * implement, so the node evaluates to 0 and drags everything under a `Min` down
 * with it. `BackgroundValue` is the node's own stated value away from the
 * network, so substituting it renders the terrain as if the network were
 * absent. That is an approximation, and the UI says so — but it beats a slab.
 */
const NEUTRAL_MAGNITUDE = 1e6;

/**
 * The value that makes a node invisible to its consumer.
 *
 * `BackgroundValue` alone is not it. In Curve.json the Graph node declares
 * `BackgroundValue: 0` and feeds a `Max`, and `Max(terrain, 0)` lifts every
 * negative (air) sample to 0 — which counts as solid, turning the whole biome
 * into a slab. The neutral element depends on the consumer: -big for `Max`,
 * +big for `Min`. Finite sentinels rather than Infinity, so downstream
 * arithmetic can't produce NaN.
 */
function neutralFor(consumerType: string | undefined, background: number): number {
  if (consumerType === "Max" || consumerType === "SmoothMax") return -NEUTRAL_MAGNITUDE;
  if (consumerType === "Min" || consumerType === "SmoothMin") return NEUTRAL_MAGNITUDE;
  return background;
}

export function approximateGraphNodes(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; replaced: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const consumerOf = new Map<string, string>();
  for (const edge of edges) {
    const target = byId.get(edge.target);
    if (target) consumerOf.set(edge.source, getNodeType(target));
  }

  let replaced = 0;
  const next = nodes.map((node) => {
    if (getNodeType(node) !== "Graph") return node;
    replaced++;
    const data = (node.data ?? {}) as Record<string, unknown>;
    const fields = (data.fields ?? {}) as Record<string, unknown>;
    const raw = Number(fields.BackgroundValue ?? 0);
    const background = Number.isFinite(raw) ? raw : 0;
    return {
      ...node,
      type: "Constant",
      data: {
        ...data,
        type: "Constant",
        label: "Graph (approximated)",
        fields: { Value: neutralFor(consumerOf.get(node.id), background) },
      },
    } as Node;
  });
  return { nodes: next, replaced };
}
