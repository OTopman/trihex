# trihex

> **The Tri-Hex Metric Spatial Indexing Engine**  
> High-performance Discrete Global Grid System (DGGS) unifying **exact 1:4 hierarchical nesting**, **uniform 6-way hexagonal symmetry**, and **road network topology awareness** in a single 64-bit integer.

[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue)](https://www.typescriptlang.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-zero-success)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Spatial Indexing Trilemma

Traditional geospatial systems force platforms to choose between three competing needs:
1. **Exact Tree Hierarchies & B-Tree Range Scans**: Google S2 (quadtree on a cube) provides 1:4 nesting, but suffers from distorted diagonal neighbor distances.
2. **Uniform Neighbor Distances & Smooth Diffusion**: Uber H3 (hexagons) provides equidistant 6-neighbor adjacency for heatmaps, but cannot cleanly subdivide into children (Aperture 7 overlaps boundaries).
3. **Real-World Road Topology & ETAs**: Air-distance formulas (Haversine/H3) dispatch drivers across impassable rivers, expressways, and one-way grids, causing high cancellation rates.

**TriHex solves all three simultaneously** by using a **Dual-Lattice Hierarchical Graph**:
- **Storage Layer**: An icosahedral triangular quadtree with exact 1:4 hierarchical nesting and 1D Morton curve encoding directly at bit 0, yielding 100% dense B-tree integer intervals ($end - start + 1 = 4^{\Delta R}$).
- **Aggregation Layer**: A hexagonal Voronoi dual that provides 6 equidistant neighbors and smooth radial $k$-ring diffusion without overlapping boundary artifacts.
- **Network Layer**: Decoupled topology partition registry and 2-tier candidate dispatch engine for real-world road networks.

---

## 64-Bit Key Layout (Pure Canonical 63-Bit Signed Non-Negative Representation)

```
63 62       58 57    54 53                                                              0
+--+----------+--------+-----------------------------------------------------------------+
|0 | Face(5b) |Res (4b)|              Triangular Quadtree Morton (54b)                   |
+--+----------+--------+-----------------------------------------------------------------+
```

---

## Quick Start

```typescript
import { TriHex } from 'trihex';

// 1. Convert Lat/Lng to a 64-bit TriHexId (PostgreSQL BIGINT safe)
const lagosCell = TriHex.latLngToCell(6.5244, 3.3792, 9);
console.log(lagosCell); // 0x4e4000005ea20000n

// 2. Reconstruct Center Coordinates
const center = TriHex.cellToLatLng(lagosCell);
console.log(center); // { lat: 6.5375, lng: 3.3910 }

// 3. Exact 1:4 Hierarchical Roll-Up (Bitshift)
const parentCell = TriHex.cellToParent(lagosCell, 7);

// 4. Instant 1D SQL B-Tree Range Scans (Zero False-Positive Leaks)
const { start, end } = TriHex.cellToChildrenRange(parentCell, 9);
// In PostgreSQL / SQLite / Redis:
// SELECT * FROM drivers WHERE cell_id BETWEEN start AND end;

// 5. Hexagonal Voronoi Dual 6-Way Neighbors
const neighbors = TriHex.getHexNeighbors(lagosCell); // 6 equidistant cells
const surgeDisk = TriHex.hexRing(lagosCell, 2);      // 19 cells in 2-ring

// 6. Network Topology & Barrier Filtering
const islandCell = TriHex.withTopologyCluster(lagosCell, 101);
const mainlandCell = TriHex.withTopologyCluster(neighbors[0], 102);

if (!TriHex.isSameCluster(islandCell, mainlandCell)) {
  console.log('Driver is separated by bridge/river barrier!');
}

// 7. Serialization & API Safety (BigInt -> 16-char Hex String)
const hexString = TriHex.cellToString(lagosCell); // "4e4000005ea20000"
const parsedCell = TriHex.stringToCell(hexString);
const jsonSafe = JSON.stringify({ cellId: lagosCell }, TriHex.bigIntReplacer);

// 8. RFC 7946 GeoJSON Exports (For Mapbox GL / Leaflet)
const triangleGeoJSON = TriHex.cellToGeoJSON(lagosCell);
const hexDualGeoJSON = TriHex.hexDualToGeoJSON(lagosCell);
const featureCollection = TriHex.cellsToGeoJSON([lagosCell, ...neighbors], 'hexDual');

// 9. Route & Area Rasterization
const corridorCells = TriHex.lineStringToCells(routeWaypoints, 9);
const geofenceCells = TriHex.polygonToCells(airportBoundaryPolygon, 10);

// 10. Hierarchical Compaction & Decompaction (Up to 93.75% Storage Savings)
const compactedCells = TriHex.compactCells(geofenceCells);   // Collapses 4-sibling clusters
const uncompactedCells = TriHex.uncompactCells(compactedCells, 10); // Restores micro-cells
```

---

## Benchmark Performance

Ran on Node.js / Apple Silicon:

| Operation | Throughput | Latency |
| :--- | :--- | :--- |
| **`latLngToCell` (Res 9)** | **~650,000 ops/sec** | 1.54 µs/op |
| **`cellToLatLng` (Inverse)** | **~710,000 ops/sec** | 1.40 µs/op |
| **`cellToParent` (Bitshift)** | **~2,590,000 ops/sec** | 0.39 µs/op |
| **`cellToChildrenRange`** | **~3,370,000 ops/sec** | 0.30 µs/op |
| **`getHexNeighbors` (Voronoi)** | **~85,000 ops/sec** | 11.72 µs/op |

---

## License

MIT © Deebezt Technologies
