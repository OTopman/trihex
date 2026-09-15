# TriHex

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)

**TriHex** is an enterprise-grade discrete global spatial indexing library (DGGS) and decoupled mobility dispatch engine built on the regular icosahedron. It combines an **exact 1:4 hierarchical triangular quadtree** with a mathematically proven **spherical Voronoi dual** (hexagonal tiling with 12 pentagonal singularities).

---

## Key Capabilities

### 1. Database-Agnostic Spatial Core (Zero Runtime Dependencies)
- **Signed 63-Bit Positive Integers (`TriHexId`)**: Guaranteed non-negative signed 64-bit integer layout (`0x0000000000000000` to `0x7FFFFFFFFFFFFFFF`). 100% compatible with PostgreSQL `BIGINT`, MySQL `BIGINT`, SQLite `INTEGER`, and Prisma without sign inversion or integer overflow.
- **Dense 1D B-Tree SQL Ranges**: Maps quadtree parent cells to exact 1D contiguous intervals (`cellToChildrenRange`) with **100% density** ($\text{end} - \text{start} + 1 = 4^{\Delta R}$) and **0% false positive rate**, enabling sub-millisecond range scans (`WHERE cell_id BETWEEN start AND end`) on standard B-Tree indexes without spatial extensions.
- **Hierarchical Compaction**: Reversibly compacts sets of cells by bottom-up 4:1 sibling merges and top-down ancestor deduplication.

### 2. Dual Graph Adjacency
- **Primal Triangular Adjacency (`getCellNeighbors`)**: Exact 3-edge shared spherical boundary adjacency with topological icosahedral seam crossing.
- **Genuine Spherical Voronoi Dual (`getHexDual`, `getHexNeighbors`, `hexRing`)**:
  - Dual cells centered at primal vertices with spherical circumcenter polygon boundaries.
  - Exactly **12 pentagonal singularities** (degree 5) at icosahedral vertices, and $10 \cdot 4^R - 10$ **regular hexagons** (degree 6) across the sphere (Euler characteristic $V = 10 \cdot 4^R + 2$).
  - **100% shared dual edge**: Every reported neighbor shares exactly two spherical circumcenters.
  - **100% reciprocal symmetry**: $A \in \text{neighbors}(B) \iff B \in \text{neighbors}(A)$.
  - **Hexagonal Ring Expansion**: $1 + 3k(k+1) = 19$ cells at radius 2 for regular hexagonal regions.

### 3. Production Mobility Dispatch Engine
- **Intra-City Spatial Sharding**: Formats Redis keys as `{cityId:spatialShard}:cell:{cellId}` using coarse resolution 4 parent macro-cells (~5,120 worldwide), distributing megacity load across multiple Redis Cluster slots while maintaining locality for nearby cells.
- **Monotonic Sequence Enforcement**: Atomic Lua migration (`MIGRATE_DRIVER_LUA`) verifies `incomingVersion > existingVersion`, rejecting stale or out-of-order GPS telemetry packets.
- **Atomic Migration & Offline Tombstones**: Eliminates ghost driver duplication through atomic `SREM` + `SADD` + `SET ... EX`, and prevents delayed resurrection with authoritative tombstoning (`REMOVE_DRIVER_LUA`).
- **Multi-Tier Dispatch**: High-recall concentric disk spatial retrieval (Tier 1) followed by turn-by-turn road network routing (Tier 2, e.g. OSRM, Valhalla, GraphHopper) and multi-objective ranking (Tier 3).

---

## Installation

```bash
npm install trihex
```

---

## Quick Start

### 1. Basic Spatial Indexing & B-Tree Ranges

```typescript
import { TriHex } from 'trihex';

// Index coordinate at resolution 9 (~1.5 km cell diameter)
const cell = TriHex.latLngToCell(6.5244, 3.3792, 9);
console.log(`Cell ID: 0x${cell.toString(16)}`);

// Spherical centroid reconstruction
const center = TriHex.cellToLatLng(cell);

// Parent cell at resolution 6 (~12 km)
const parent = TriHex.cellToParent(cell, 6);

// Exact 1D B-Tree range query interval for SQL
const range = TriHex.cellToChildrenRange(parent, 9);
// SQL: SELECT * FROM drivers WHERE cell_id BETWEEN range.start AND range.end;
```

### 2. Triangular vs Spherical Voronoi Dual Adjacency

```typescript
// Triangular grid: 3 edge-adjacent triangles sharing a great-circle edge
const triNeighbors = TriHex.getCellNeighbors(cell); // length = 3
const triDisk = TriHex.cellDisk(cell, 2);           // 10 cells

// Spherical Voronoi Dual: 6 edge-sharing hexagonal dual cells
const hexDual = TriHex.getHexDual(cell);
console.log(`Degree: ${hexDual.degree}, Is Pentagon: ${hexDual.isPentagon}`);
const hexNeighbors = TriHex.getHexNeighbors(cell); // length = 6 (5 for pentagons)
const hexRing = TriHex.hexRing(cell, 2);           // 19 cells (matches 1 + 3k(k+1))
```

### 3. RFC 7946 GeoJSON Polygon Export

```typescript
// Export primal triangle
const triangleGeoJSON = TriHex.cellToGeoJSON(cell);

// Export genuine Voronoi polygon (hexagon / pentagon)
const hexDualGeoJSON = TriHex.hexDualToGeoJSON(cell);
```

### 4. Distributed Mobility Dispatch Engine

```typescript
import { DispatchEngine, TriHex } from 'trihex';

const engine = new DispatchEngine({
  tier1CandidateLimit: 50,
  tier2CandidateLimit: 5,
});

// Ingest GPS update with monotonic sequence version
await engine.updateDriverPosition({
  driverId: 'drv_lagos_101',
  lat: 6.4281,
  lng: 3.4219,
  cellId: TriHex.latLngToCell(6.4281, 3.4219, 9),
  cityId: 'lagos',
  version: 1,
  updatedAt: Date.now(),
  status: 'AVAILABLE',
});

// Find candidates for pickup
const candidates = await engine.findCandidates({
  pickup: { lat: 6.4350, lng: 3.4280 },
  pickupCellId: TriHex.latLngToCell(6.4350, 3.4280, 9),
  cityId: 'lagos',
  initialRadius: 1,
  maxRadius: 3,
  maxResults: 5,
});
```

---

## Integration Guides

- [PostgreSQL & SQL B-Tree Range Integration Guide](docs/integrations/postgresql.md)
- [Redis Cluster, Sharding & Atomic Lua Dispatch Guide](docs/integrations/redis.md)
- [Full Mathematical Specification](SPECIFICATION.md)
- [Forensic Remediation Audit Report](AUDIT_REPORT.md)

---

## Performance & Benchmarks

Benchmarked on Intel Core i7-8569U CPU @ 2.80GHz (macOS x64, Node v23.6.0):

| Operation | Throughput | Median (p50) | 99th % (p99) | Heap Alloc |
|---|---|---|---|---|
| `latLngToCell (Res 9, City)` | 836,653 ops/sec | 1.116 µs | 3.396 µs | 6.66 MB |
| `latLngToCell (Res 14, Sub-meter)` | 621,694 ops/sec | 1.471 µs | 3.684 µs | 0.00 MB |
| `cellToLatLng (Spherical Centroid)` | 748,991 ops/sec | 1.249 µs | 3.445 µs | 1.02 MB |
| `cellToParent (Exact Bit-shift)` | 2,312,954 ops/sec | 0.400 µs | 1.026 µs | 0.00 MB |
| `cellToChildrenRange (1D B-Tree)` | 1,606,233 ops/sec | 0.590 µs | 1.355 µs | 3.21 MB |
| `cellToString (16-Char Hex)` | 3,148,299 ops/sec | 0.283 µs | 0.772 µs | 2.07 MB |
| `getCellNeighbors (3-Edge Adjacent)` | 236,931 ops/sec | 3.891 µs | 6.993 µs | 8.53 MB |
| `hexRing (Radius 2, 19 Hexagons)` | 5,431 rings/sec | 184.037 µs | 196.377 µs | 0.00 MB |

Run the benchmarks locally:

```bash
npm run benchmark
```

---

## Verification & Testing

TriHex includes 8 comprehensive test suites executing 1.5M+ verification operations:

```bash
npm test
```

1. `test/trihex.test.ts`: Primal encoding, roundtrip precision, B-Tree ranges, and triangular adjacency.
2. `test/trihex-enterprise.test.ts`: GeoJSON exports, serialization, route/polygon rasterization, compaction.
3. `test/trihex-audit-proofs.test.ts`: Formal proofs for 1D B-Tree density, 3-edge reciprocal symmetry, and PostgreSQL signed int64 safety.
4. `test/trihex-dispatch.test.ts`: Multi-tier candidate retrieval, Redis key schemas, and atomic Lua migration.
5. `test/trihex-adversarial-audit.ts`: 100,000 coordinate round-trip precision (mean error 0.0000 mm), hotspot stress testing.
6. `test/trihex-dual.test.ts`: Exhaustive resolution 1 verification of all 42 dual cells (12 pentagons, 30 hexagons, 0 shared-edge violations, 0 reciprocity violations).
7. `test/trihex-candidate-recall.test.ts`: Ground-truth candidate recall evaluation (Recall@5 = 100%, Recall@10 = 100% on river barrier and highway scenarios).
8. `test/trihex-concurrency.test.ts`: Out-of-order GPS rejection, atomic migration without ghost duplicates, offline tombstones, and 100 concurrent shuffled updates.

---

## License

MIT © Deebezt Technologies
