import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "@/nodes";
import { autoLayout } from "@/utils/autoLayout";

interface LabGraphCanvasProps {
  nodes: Node[];
  edges: Edge[];
  /** Changes when the source graph changes, to re-run layout. */
  graphKey: string;
}

/**
 * The pasted / selected graph, rendered with TerraNova's own node components.
 *
 * Using the app's real `nodeTypes` rather than a lab-specific renderer means
 * category colours, handle placement and node chrome match the desktop editor
 * exactly — the same reason the evaluator is shared rather than reimplemented.
 */
function Canvas({ nodes, edges, graphKey }: LabGraphCanvasProps) {
  const [laidOut, setLaidOut] = useState<Node[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLaidOut(null);
    // Imported graphs carry tree positions from jsonToGraph, not dagre ones,
    // so they overlap badly until laid out.
    autoLayout(nodes, edges, "LR")
      .then((next) => {
        if (!cancelled) setLaidOut(next);
      })
      .catch(() => {
        if (!cancelled) setLaidOut(nodes);
      });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges, graphKey]);

  const shown = laidOut ?? nodes;
  const fitViewOptions = useMemo(() => ({ padding: 0.15, maxZoom: 1 }), []);

  return (
    <ReactFlow
      key={graphKey}
      nodes={shown}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={fitViewOptions}
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#4a4438" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(28,26,23,.7)"
        style={{ background: "#242119", border: "1px solid #4a4438" }}
      />
    </ReactFlow>
  );
}

export function LabGraphCanvas(props: LabGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
