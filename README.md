# TerraNova Lab

An online, top-down visualizer for Hytale WorldGen V2 density graphs.
Open a graph, see what it generates — no install, no Hytale install, no asset sync.

Companion to [TerraNova](https://github.com/McCal-Codes/TerraNova), the offline
desktop studio.

## How it relates to TerraNova

TerraNova is vendored as a **git submodule** at `vendor/terranova`, and Vite
aliases `@` straight into its `src/`. The lab evaluates density with the exact
same code the desktop app ships — the evaluator, the node schema, and the
Hytale import/export pipeline are used verbatim. **Nothing is copied, so there
is nothing to drift.**

Two small browser stubs (`src/tauriStub.ts`, `src/previewWorkerLogStub.ts`)
replace desktop-only plumbing. Both stub transport and logging only, never
domain logic. See the comments in each for the exact import chains and why.

## Why 2D only

TerraNova's RAM/GPU cost lives in its **3D voxel preview** (three.js, SSAO,
voxel meshing). The 2D density preview is plain TypeScript in a Web Worker, so a
browser runs it at the same speed the desktop app does. Measured on a bundled
template:

| grid | evaluation |
| ---- | ---------- |
| 64×64 | ~52 ms (includes worker startup) |
| 128×128 | ~74 ms |
| 256×256 | ~285 ms |

The map is a top-down **surface view**: for each world column the scan walks Y
downward and records the first solid sample (density >= 0, the same rule the
desktop app's ThresholdedHeatmap uses), then classifies that height against sea
level — water, beach, land, peaks, or air where no terrain exists at all.

A single Y slice isn't enough for that: a heightfield density reads as one
filled square, not a coastline.

## Shared resources

Graphs reference vanilla resources by name — `World-River-Map`, `Biome-Map`,
`Base-Simplex-*` and friends. Unresolved, the evaluator returns `0` for the
import, which can silently flatten an entire graph, so the lab detects
unresolved imports up front and says so rather than drawing a confident, wrong
map.

Load them with **Shared resources → Load from my install**, pointing at
`Server/HytaleGenerator/Density/` in your own Hytale installation. They are
Hytale's Licensed Assets, so the lab:

- never bundles them, and never ships them in this repo or the deployed site;
- never persists or uploads them — they live in memory for the session only;
- reads only files you pick yourself.

You supply your own copy; nothing is redistributed.

## Unsupported nodes

TerraNova implements 129 density node types, but not Hytale's `Graph` network
generator (`Positions`, `ProximityConnector`, `NodeAction`, `EdgeAction`, ...),
which builds roads, rivers and cave systems. Graphs using it cannot render
correctly here — or in the desktop app, which has the same gap. The lab names
unsupported node types instead of pretending, and substitutes the neutral
element of a stubbed `Graph`'s consumer so the rest of the terrain still
evaluates.

## Develop

```bash
git clone --recurse-submodules https://github.com/McCal-Codes/terranova-lab.git
pnpm install
pnpm dev
```

Already cloned without submodules: `git submodule update --init --recursive`.

```bash
pnpm build     # production build to dist/
pnpm analyze   # bundle treemap at dist/stats.html
```

## Roadmap

- **M0 — done.** Bundled graphs render to a live 2D map, with timings.
- **M1** — interactive node canvas and palette.
- **M2** — paste your own Hytale JSON.
- **M3** — hover any node to see its own output.
- **M4** — shareable links (graph in the URL hash).

## Licence

TerraNova is LGPL-2.1; this repo consumes it as a submodule. See
`vendor/terranova/LICENSE` and `vendor/terranova/NOTICE`.
