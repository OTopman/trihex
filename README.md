# TriHex

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

**TriHex** is an enterprise-grade discrete global spatial indexing library (DGGS) and decoupled mobility dispatch architecture built on the regular spherical icosahedron. It combines an **exact 1:4 hierarchical triangular quadtree** with a mathematically proven **spherical Voronoi dual** (hexagonal tiling with 12 pentagonal singularities).

---

## Architectural Separation & Boundaries

TriHex strictly enforces modular architecture:

1. **TriHex Core (`@trihex/core`)**:
   - Zero runtime dependencies (`dependencies: {}`).
   - Pure mathematical, geometric, and topological library.
   - Database-agnostic: does not import or require PostgreSQL, Redis, or any ORM.
2. **Mobility Dispatch Integration (`trihex/dispatch`)**:
   - Decoupled application architecture demonstrating high-recall candidate generation.
   - Storage-agnostic (`DriverSpatialStore` interface): works in-memory or with any backend.
   - Redis and PostgreSQL integrations are purely optional application examples.
3. **Turn-by-Turn Routing Engine**:
   - Decoupled from road network topology: Road graphs change dynamically and are never baked into spatial cell IDs.
   - Pluggable external routing providers (OSRM, Valhalla, GraphHopper).
   - Candidate pool optimality: The final routed candidate is optimal within the retained candidate pool generated in Tier 1.

---

## Key Capabilities

### 1. Database-Agnostic Spatial Core (Zero Runtime Dependencies)
- **Signed 63-Bit Positive Integers (`TriHexId`)**: Guaranteed non-negative signed 64-bit integer layout (`0x0000000000000000` to `0x7FFFFFFFFFFFFFFF`). 100% compatible with PostgreSQL `BIGINT`, MySQL `BIGINT`, SQLite `INTEGER`, and Prisma without sign inversion or integer overflow.
- **Strict Reserved-Bit Validation**: All public cell validation paths reject corrupt IDs with non-zero reserved/padding bits (primal bits $2R..53$ and dual bits $0..9$ and $42..52$).
- **Dense 1D B-Tree SQL Ranges**: Maps quadtree parent cells to exact 1D contiguous intervals (`cellToChildrenRange`) with **100% density** ($\text{end} - \text{start} + 1 = 4^{\Delta R}$) and **0% false positive rate**, enabling sub-millisecond range scans (`WHERE cell_id BETWEEN start AND end`) on standard B-Tree indexes without spatial extensions.
- **Hierarchical Compaction**: Reversibly compacts sets of cells by bottom-up 4:1 sibling merges and top-down ancestor deduplication.

### 2. Dual Graph Adjacency & Spherical Voronoi Geometry
- **Primal Triangular Adjacency (`getCellNeighbors`)**: Exact 3-edge shared spherical boundary adjacency with topological icosahedral seam crossing.
- **Genuine Spherical Voronoi Dual (`getHexDual`, `getHexNeighbors`, `hexRing`)**:
  - Dual cells centered at primal vertices with spherical circumcenter polygon boundaries.
  - Exactly **12 pentagonal singularities** (degree 5) at icosahedral vertices, and $10 \cdot 4^R - 10$ **regular hexagons** (degree 6) across the sphere (Euler characteristic $V = 10 \cdot 4^R + 2$).
  - **Shared Dual Edges**: Every reported neighbor shares exactly two spherical circumcenters.
  - **Reciprocal Symmetry**: $A \in \text{neighbors}(B) \iff B \in \text{neighbors}(A)$.
  - **Perpendicular Bisector Equidistance**: Independently verified against an external spherical Voronoi oracle; points on dual boundaries are equidistant to corresponding primal sites.
  - **Hexagonal Ring Expansion**: $1 + 3k(k+1) = 19$ cells at radius 2 for regular hexagonal regions.

### 3. Production Mobility Dispatch Engine
- **Intra-City Spatial Sharding**: Formats Redis keys as `{cityId:spatialShard}:cell:{cellId}` using coarse resolution 4 parent macro-cells (~5,120 worldwide), distributing megacity load across multiple Redis Cluster slots while maintaining locality for nearby cells.
- **Monotonic Sequence Enforcement**: Atomic Lua migration (`MIGRATE_DRIVER_LUA`) verifies `incomingVersion > existingVersion`, rejecting stale or out-of-order GPS telemetry packets.
- **Atomic Migration & Offline Tombstones**: Eliminates ghost driver duplication through atomic `SREM` + `SADD` + `SET ... EX`, and prevents delayed resurrection with authoritative tombstoning (`REMOVE_DRIVER_LUA`).
- **Multi-Tier Dispatch Pipeline**:
  - Tier 1: Concentric triangular disk retrieval (`cellDisk`) pre-filtering candidates by geodesic distance.
  - Tier 2: Turn-by-turn road network routing (OSRM / Valhalla) evaluating travel time (ETA).
  - Tier 3: Multi-objective candidate scoring and dispatch optimization.

---

## Spatial Quantization vs Projection Precision

TriHex strictly distinguishes between projection numerical precision and cell geometric quantization:

- **Gnomonic Projection Numerical Precision**: Forward and inverse projection round-trip error is $< 0.0006\text{ mm}$ (mean $0.000001\text{ mm}$ across 10,000 global points).
- **Cell Quantization Extent**: The geometric size and maximum representative error (distance from coordinate to cell centroid) per resolution:

| Resolution | Number of Cells | Typical Cell Area | Edge Length (approx) | Circumradius | Max Quantization Error |
|:---|:---|:---|:---|:---|:---|
| 0 | 20 | 25,503,600 km² | 7,000.0 km | 4,041.5 km | 4,647.7 km |
| 1 | 80 | 6,375,900 km² | 3,500.0 km | 2,020.7 km | 2,323.8 km |
| 2 | 320 | 1,593,975 km² | 1,750.0 km | 1,010.4 km | 1,161.9 km |
| 3 | 1,280 | 398,493.8 km² | 875.0 km | 505.2 km | 581.0 km |
| 4 | 5,120 | 99,623.4 km² | 437.5 km | 252.6 km | 290.5 km |
| 5 | 20,480 | 24,905.9 km² | 218.7 km | 126.3 km | 145.2 km |
| 6 | 81,920 | 6,226.5 km² | 109.4 km | 63.1 km | 72.6 km |
| 7 | 327,680 | 1,556.6 km² | 54.7 km | 31.6 km | 36.3 km |
| 8 | 1,310,720 | 389.2 km² | 27.3 km | 15.8 km | 18.2 km |
| 9 | 5,242,880 | 97.3 km² | 13.7 km | 7.9 km | 9.1 km |
| 10 | 20,971,520 | 24.3 km² | 6.8 km | 3.9 km | 4.5 km |
| 11 | 83,886,080 | 6.1 km² | 3.4 km | 2.0 km | 2.3 km |
| 12 | 335,544,320 | 1.5 km² | 1.7 km | 986.7 m | 1.1 km |
| 13 | 1,342,177,280 | 380,033 m² | 854.5 m | 493.3 m | 567.3 m |
| 14 | 5,368,709,120 | 95,008 m² | 427.2 m | 246.7 m | 283.7 m |
| 15 | 21,474,836,480 | 23,752 m² | 213.6 m | 123.3 m | 141.8 m |

---

## Real Road-Network Candidate Recall (F-02 Verification)

Evaluated against an independent road-network routing ground truth (Dijkstra / Turn-by-Turn Engine) across **2 major metropolitan markets (Lagos Metropolis & San Francisco Bay Area)** with 18 realistic scenarios and 2,311 active drivers:

| Market | Scenario | Obstacle / Topology | Fleet Size | Recall@1 | Recall@5 | Recall@10 | Recall@25 | MRR | p95 Regret | Max Regret |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Lagos | 1. Marina Downtown Grid | High-density urban grid | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.1 s | 0.1 s |
| Lagos | 2. Island vs Mainland Detour | River water barrier | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 3. Third Mainland Bridge | 80 km/h expressway | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 4. Airport Express Corridor | Asymmetric one-way loop | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 5. Bridge Chokepoints | Limited crossing points | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 6. Airport Terminal Loop | Controlled access ramp | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 7. Stadium Event Surge | Concentrated hotspot | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 8. Ikeja CBD Suburban | Moderate density arterial | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 9. Rural Outskirts Sparse | 12 km distance sparse | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 10. Asymmetric Arterial Detour| Non-Euclidean road path | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| Lagos | 11. Long Detour vs Euclidean | Water-edge detour | 1,282 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| SF Bay | 12. Financial District Grid | High-density urban core | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| SF Bay | 13. Bay Bridge Water Barrier | SF to Oakland 15km detour | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.5 s | 0.5 s |
| SF Bay | 14. Golden Gate Marin Bottleneck| SF to Marin chokepoint | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.1 s | 0.1 s |
| SF Bay | 15. SFO Airport Access Corridor | Highway 101 arrival loop | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.5 s | 0.5 s |
| SF Bay | 16. Mission District One-Way | Directional flow grid | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.2 s | 0.2 s |
| SF Bay | 17. Presidio Park Restricted | Low speed / park roads | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| SF Bay | 18. Silicon Valley Highway | 105 km/h express corridor | 1,029 | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 0.0 s | 0.0 s |
| **TOTAL** | **All 18 Scenarios (2 Markets)**| **100% Real Topologies** | **2,311** | **100.0%** | **100.0%** | **100.0%** | **100.0%** | **1.000** | **0.5 s** | **0.5 s** |

---

## Live Multi-Node Redis Cluster Verification (F-03 Verification)

Verified against a real 3-node Redis Cluster running in Docker:

- **16,384 Slots Covered**: `cluster_state: ok`, all slots assigned across 3 primary masters.
- **Intra-City Sharding**: Macro-shards distribute evenly across all 3 master nodes with zero single-slot city bottlenecks.
- **Cross-Slot Multi-Key Safety**: `KEYS[1]` (`newCellKey`) and `KEYS[2]` (`driverPosKey`) share identical `{cityId:shard}` hash tags, mapping to identical slots (e.g. slot 11641) with zero `CROSSSLOT` errors. Redis Cluster strictly rejects un-tagged keys.
- **Atomic Lua Monotonicity**: Duplicate updates rejected (`0`), stale out-of-order GPS updates rejected (`0`), newer updates accepted (`1`).
- **Offline Tombstones**: Drivers removed atomically; delayed GPS packets rejected; resurrection strictly prevented.
- **Extreme Hotspot Load Test (5,000 Drivers in Single Cell)**:
  - Ingested 5,000 drivers in 235 ms (21,242 updates/sec).
  - Bounded candidate retrieval (`SRANDMEMBER` limit 250): p50 = 0.68 ms, p95 = 1.07 ms, p99 = 1.26 ms.
  - Event-loop delay bounded with zero runaway memory.

---

## Concurrency Scaling & Fleet Capacity (F-04 Verification)

Measured across configurable concurrency worker pools:

| Concurrency | Core Index (latLngToCell) | In-Memory Dispatch | Live Redis Cluster (Lua) | Scaling Efficiency | Event-Loop Lag |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 492,185 ops/s (1.3 µs) | 126,481 ops/s (6.8 µs) | 2,619 ops/s (0.37 ms) | 100.0% | < 0.1 ms |
| 2 | 631,376 ops/s (2.6 µs) | 177,735 ops/s (10.1 µs) | 4,838 ops/s (0.39 ms) | 92.4% | < 0.1 ms |
| 4 | 698,900 ops/s (4.8 µs) | 179,786 ops/s (19.9 µs) | 8,011 ops/s (0.47 ms) | 76.5% | < 0.1 ms |
| 8 | 646,701 ops/s (10.4 µs) | 181,049 ops/s (40.3 µs) | 10,921 ops/s (0.69 ms) | 52.1% | < 0.1 ms |
| 16 | 635,513 ops/s (22.1 µs) | 178,876 ops/s (81.2 µs) | 12,555 ops/s (1.12 ms) | 30.0% | < 0.1 ms |
| 32 | 673,379 ops/s (43.1 µs) | 177,606 ops/s (164.7 µs) | 22,062 ops/s (1.35 ms) | 26.3% | < 0.1 ms |

> **Capacity Model Disclosure**: Single-process Node.js achieves ~125k-180k updates/sec (in-memory) and ~2.5k-22k updates/sec (networked Redis Cluster). The previous "1M updates/sec" claim represents a horizontally partitioned capacity model requiring ~7-10 independent worker processes or pods connected via pipelined Redis connections.

---

## Installation & Usage

```bash
npm install trihex
```

### 1. Spatial Indexing & B-Tree Ranges

```typescript
import { TriHex } from 'trihex';

// Index coordinate at resolution 9 (~7.9 km circumradius)
const cell = TriHex.latLngToCell(40.7128, -74.0060, 9);

// Parent cell at resolution 6 (~63 km circumradius)
const parent = TriHex.cellToParent(cell, 6);

// Exact 1D B-Tree range query interval for SQL
const range = TriHex.cellToChildrenRange(parent, 9);
// SQL: SELECT * FROM drivers WHERE cell_id BETWEEN range.start AND range.end;
```

### 2. Triangular Primal vs Spherical Voronoi Dual Adjacency

```typescript
// Primal triangular grid: 3 edge-adjacent triangles sharing great-circle boundaries
const triNeighbors = TriHex.getCellNeighbors(cell); // length = 3
const triDisk = TriHex.getCellDisk(cell, 2);        // 10 cells (alias: cellDisk)
const triBoundary = TriHex.getCellBoundary(cell);   // 3 spherical coordinates

// Spherical Voronoi Dual: 6 edge-sharing hexagonal dual cells (or 5 for pentagons)
const hexDual = TriHex.getHexDual(cell);
const dualNeighbors = TriHex.getDualNeighbors(cell); // length = 6 (5 for pentagons)
const dualDisk = TriHex.getDualDisk(cell, 2);        // 19 cells (alias: hexRing)
const dualBoundary = TriHex.getDualBoundary(cell);   // 6 (or 5) spherical coordinates
```

---

## Benchmark Disclosure

Measured on: **Intel(R) Core(TM) i7-8569U CPU @ 2.80GHz (8 logical cores, macOS x64, Node v23.6.0)**. Results are hardware and runtime dependent:

| Operation | Throughput | Median (p50) | 95th % (p95) | 99th % (p99) | 99.9th % (p99.9) | Heap Alloc |
|:---|---:|---:|---:|---:|---:|---:|
| `latLngToCell (Res 9)` | 632,901 ops/sec | 1.24 µs | 1.74 µs | 2.15 µs | 27.74 µs | 0.00 MB |
| `latLngToCell (Res 14)` | 529,632 ops/sec | 1.50 µs | 2.13 µs | 2.57 µs | 29.19 µs | 1.50 MB |
| `cellToLatLng (Centroid)` | 552,434 ops/sec | 1.44 µs | 1.79 µs | 2.82 µs | 50.83 µs | 0.00 MB |
| `cellToParent (ΔRes 3)` | 1,268,193 ops/sec | 0.56 µs | 0.70 µs | 1.05 µs | 28.24 µs | 0.00 MB |
| `cellToChildrenRange (B-Tree)` | 1,150,269 ops/sec | 0.70 µs | 0.93 µs | 1.13 µs | 17.42 µs | 6.09 MB |
| `cellToString (Hex)` | 1,900,774 ops/sec | 0.37 µs | 0.46 µs | 0.64 µs | 17.18 µs | 0.00 MB |
| `getCellNeighbors (3-Edge)` | 211,203 ops/sec | 4.08 µs | 5.02 µs | 19.55 µs | 66.57 µs | 7.51 MB |
| `getHexDual (Spherical Voronoi)`| 37,318 ops/sec | 23.98 µs | 40.66 µs | 67.69 µs | 374.97 µs | 3.36 MB |
| `updateDriverPosition` | 124,433 ops/sec | 6.37 µs | 8.48 µs | 28.61 µs | 154.64 µs | 5.92 MB |

---

## Verification Test Commands

```bash
# Core Unit & Proof Suites
npm test

# Independent Spherical Voronoi Geometry Oracle
npm run test:voronoi-oracle

# Realistic Road Network Candidate Recall (11 Scenarios)
npm run test:real-road-recall

# Live Multi-Node Redis Cluster Integration
npm run test:redis-integration

# Concurrency Scaling, Race Lifecycles & Capacity Harness
npm run test:concurrency-scaling

# Independent Performance Microbenchmark
npm run benchmark:independent
```

---

## Interactive 3D Globe & 2D Map Visualizer

TriHex includes an interactive dark-mode WebGL visualizer for exploring the discrete global grid system:

- **3D Globe Mode**: Three.js WebGL canvas displaying the spherical icosahedron (20 faces, 30 geodesics, 12 pentagonal singularities).
- **2D Street Map Mode**: Leaflet map integrated with CartoDB Dark Matter tiles, rendering cell polygon overlays over real cities.
- **Split View**: Synchronized side-by-side display with coordinated cell inspection and SQL B-Tree range scans.

```bash
npm run visualizer
# Open http://localhost:3000
```

---

## Streaming Reference Architecture

A turnkey production reference architecture for real-time fleet telemetry and mobility dispatch is available in [`examples/streaming-fleet-dispatch`](examples/streaming-fleet-dispatch):

- **Event Streaming Broker**: Redpanda / Kafka pipeline ingesting GPS telemetry pings.
- **Redis Cluster Macro-Sharding**: Resolution 4 spatial partitioning eliminating single-slot city hotspots.
- **Ghost Elimination**: Monotonic sequence protection via atomic `MIGRATE_DRIVER_LUA`.
- **Two-Tier Dispatch API**: Geodesic pre-filtering + turn-by-turn road network routing with physical barrier awareness.

```bash
# Run standalone benchmark simulation (zero external dependencies)
npm run example:streaming

# Run turnkey Docker Compose stack (Redpanda + 3-node Redis Cluster + Worker + API)
cd examples/streaming-fleet-dispatch && docker compose up -d
```

---

## License

MIT © Deebezt Technologies
