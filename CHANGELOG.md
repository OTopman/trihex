# Changelog

All notable changes to the **TriHex** Discrete Global Grid System (DGGS) and spatial indexing engine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-19

### Added

#### Core DGGS & Discrete Global Index
- **1:4 Hierarchical Triangular Quadtree**: Hierarchical subdivision on a regular spherical icosahedron (20 triangular faces).
- **Canonical 64-Bit BigInt Cell Encoding**:
  - Bit 63: Mode flag (`0` for primal triangular, `1` for dual hexagonal).
  - Bits 58–62: Face index ($0..19$).
  - Bits 54–57: Resolution level ($0..15$).
  - Bits 22–53: Morton / Z-order interleaved spatial coordinates ($(I, J)$).
  - Bits 0–21: Reserved padding bits.
- **Bijective Coordinates**: Exact forward/inverse spherical gnomonic projection between $(Lat, Lng)$ and discrete cell IDs.
- **1D Database B-Tree Range Search**: `cellToChildrenRange` computing dense `[minChild, maxChild]` intervals for SQL `BETWEEN` queries with 100% density and zero false-positive leakage.
- **Hierarchical Navigation**: `cellToParent` (bit-shift bitmasking in $<0.5\,\mu\text{s}$), `cellToChildren`, and `compactCells`.
- **Zero Runtime Dependencies**: `@trihex/core` maintains an empty `dependencies: {}` footprint.

#### Genuine Spherical Voronoi Dual (Hexagonal Mesh)
- **Spherical Voronoi Constructor (`getHexDual`)**: Exact spherical circumcenters forming the vertices of the hexagonal dual cells.
- **Euler Characteristic Verification**: Strictly satisfies $V = 10 \cdot 4^R + 2$ dual cells across the sphere (e.g. 42 cells at $R=1$), comprising exactly 12 pentagonal singularities and $(10 \cdot 4^R - 10)$ regular hexagons.
- **Hexagonal Ring Expansion (`hexRing`)**: Concentric $k$-ring BFS traversal for hexagonal neighborhoods ($1 + 3k(k+1)$ cells).
- **RFC 7946 GeoJSON Export (`hexDualToGeoJson`)**: Standard polygon export with closed coordinate rings.

#### Advanced Spatial Analytics Primitives
- **Canonical 63-Bit Directed Edges**:
  - BigInt representation encoding origin cell ID, 3-bit neighbor index ($0..5$), and directed edge indicator bit.
  - Full API: `getDirectedEdge`, `getDirectedEdgeOrigin`, `getDirectedEdgeDestination`, `getDirectedEdgeBoundary`, `isDirectedEdge`, and `validateDirectedEdge`.
- **Hierarchical Quadtree Polyfill (`polygonToCellsHierarchical`)**:
  - Accelerated polygon rasterization via top-down parent containment tests, pruning interior boundary checks.
- **Bottom-Up Quad Compaction (`polygonToCompactedCells`)**:
  - Automatically collapses complete sets of 4 sibling cells into their common parent.

#### Distributed Mobility & Ride Dispatch
- **Two-Tier Ride Dispatch Pipeline (`TwoTierDispatchPipeline`)**:
  - Tier 1: Low-latency geodesic spatial culling via triangular disks (`cellDisk`).
  - Tier 2: Turn-by-turn routing with physical barrier detour penalties (e.g., bridge vs. water crossings).
- **Atomic Lua Driver Migration (`MIGRATE_DRIVER_LUA`)**:
  - Single atomic Redis operation to update cell membership, driver state, and purge previous cell references, eliminating ghost drivers.
  - Monotonic sequence numbers protecting against delayed, out-of-order UDP/GPS packets.
- **Macro-Shard Geographic Hashing (`getSpatialShard`)**:
  - Derives Resolution 4 partition keys (`{city:shard}`) to distribute hot cells evenly across Redis Cluster slots.

#### Interactive Web Visualizer (3D Globe + 2D Street Map + Split View)
- **WebGL 3D Globe (Three.js)**:
  - Interactive spherical icosahedron with glowing cyan cells, ruby singularities, and atmospheric glow.
  - OrbitControls with geodesic mouse raycasting and click-to-inspect telemetry.
- **2D Street Map (Leaflet)**:
  - High-performance street cartography with zoom-adaptive Level-of-Detail (**Auto-LOD**) from $R=1$ to $R=11$.
  - Viewport-adaptive regular grid sampling with 1-ring neighbor expansions, guaranteeing 15–80 crisp, glowing cells at any zoom level.
- **Synchronized Split View**:
  - Side-by-side display of 3D spherical geodesic and 2D Mercator street map with bi-directional camera synchronization.
- **Floating Glass Map Toolbar (`#map-toolbar`)**:
  - Basemap switcher: Carto Dark Matter, Esri Satellite Hybrid, Voyager Streets, and Midnight Minimal.
  - Auto-LOD status pill, Centroid markers, and Simulated Fleet Heatmap overlay.
  - Quick Geocoder search for global hubs (Tokyo, London, SF, Lagos, Paris, Dubai, etc.) and arbitrary `lat, lng` coordinates with smooth camera `flyTo`.
  - GPS Locate Me button.
- **Collapsible HUD Panels & Floating Mini-Docks**:
  - Slide panels off-screen with one click (`#btn-collapse-left`, `#btn-collapse-right`, `#btn-toggle-hud`), freeing 100% of the canvas.
  - Accessible floating mini-docks (`⚙ Controls`, `📋 Inspector`).
- **Floating Cursor Hover Tooltip (`#cell-hover-tooltip`)**:
  - Tracks mouse to display cell type (`HEX DUAL`, `PRIMAL TRI`, `PENTAGON DUAL`), resolution, BigInt ID, and coordinates.

#### Production Streaming Fleet Dispatch Reference Architecture
- Located in [`examples/streaming-fleet-dispatch`](examples/streaming-fleet-dispatch):
  - Autonomous fleet telemetry simulator generating realistic urban vehicle trajectories with heading, speed, and network jitter.
  - Streaming ingestion worker processing Kafka/Redpanda events into Redis Cluster with atomic Lua scripts.
  - Two-tier ride-dispatch Express API with resilient fallback routing.
  - Complete `docker-compose.yml` and Kubernetes (`k8s/`) deployment manifests with HPA.

#### Build, Packaging & CI/CD
- **Dual CJS & ESM Distribution**:
  - Modern conditional exports in `package.json` for `.` and `./dispatch`.
  - Native ESM bundles in `dist/esm/` and CJS in `dist/`.
- **Automated CI/CD Release Workflows**:
  - [`.github/workflows/ci.yml`](.github/workflows/ci.yml): Matrix verification across Node.js 18.x and 20.x, running all 10 test suites and benchmarks.
  - [`.github/workflows/release.yml`](.github/workflows/release.yml): Automated packaging, testing, and npm publication with provenance on `v*` tags.
  - [`.github/workflows/tag-version.yml`](.github/workflows/tag-version.yml): Automatic SemVer git tag generation from `package.json` without overwriting existing tags.

### Security & Reliability Fixes
- **F-01**: Strict validation and rejection of non-zero reserved padding bits (bits 48..62) in cell IDs.
- **F-02**: Denial-of-Service bounds enforcement on `cellDisk` and `hexRing` radius ($k \le 50$) and coordinate bounds ($[-90, 90]$ lat, $[-180, 180]$ lng).
- **F-03**: PostgreSQL compatibility ensuring signed 64-bit integer sign bit is never inverted.
- **F-04**: Antimeridian ($\pm 180^\circ$) bounding-box wrap-around rasterization without planetary leakage.
