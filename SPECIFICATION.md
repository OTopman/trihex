# TriHex: Technical Specification & Architectural Whitepaper

**A High-Performance Discrete Global Grid System Unifying Hierarchical Triangular Quadtrees, Hexagonal Voronoi Duals, and Network Topology Awareness**

*Version 1.0.0 — Production Reference Manual*  
*Author: Deebezt Technologies / Weelbaro Engineering*

---

## Table of Contents

1. [Executive Summary & The Spatial Indexing Trilemma](#1-executive-summary--the-spatial-indexing-trilemma)
2. [Mathematical Foundations & Coordinate Transformations](#2-mathematical-foundations--coordinate-transformations)
   - 2.1 The Regular Icosahedron Model
   - 2.2 Spherical to Cartesian Mapping ($S^2 \to \mathbb{R}^3$)
   - 2.3 Gnomonic Face Projection ($P \to Q \in \text{Face}_f$)
   - 2.4 Closed-Form Barycentric 1:4 Triangular Subdivision
   - 2.5 Inverse Gnomonic Projection ($Q \in \text{Face}_f \to S^2$)
3. [The 64-Bit Bitfield Architecture (`TriHexId`)](#3-the-64-bit-bitfield-architecture-trihexid)
   - 3.1 Bitfield Specification
   - 3.2 O(1) Hierarchical Operations via Bitwise Arithmetic
   - 3.3 Exact Contiguous 1D Database Range Scans
4. [The Hexagonal Voronoi Dual Lattice](#4-the-hexagonal-voronoi-dual-lattice)
   - 4.1 Tri-Hex Duality
   - 4.2 6-Way Equidistant Neighbor Derivation
   - 4.3 Radial $k$-Ring Expansion & Surge Diffusion
5. [Road Network Topology & Metric Embedding](#5-road-network-topology--metric-embedding)
   - 5.1 The 12-Bit Topology Cluster ID
   - 5.2 Physical Barrier & Natural Partition Isolation
   - 5.3 Effective Topology-Aware Distance Formulation
6. [Enterprise Capabilities](#6-enterprise-capabilities)
   - 6.1 Canonical String & Hex Serialization
   - 6.2 RFC 7946 GeoJSON Native Export
   - 6.3 Route & Area Rasterization (Supercover & Jordan Curve)
   - 6.4 Hierarchical Compaction & Decompaction
7. [Comprehensive API Reference](#7-comprehensive-api-reference)
8. [Empirical Benchmarks & Verification](#8-empirical-benchmarks--verification)
9. [Production Integration Guide for Mobility Systems](#9-production-integration-guide-for-mobility-systems)

---

## 1. Executive Summary & The Spatial Indexing Trilemma

Geospatial indexing systems for modern mobility, telematics, and spatial analytics have historically been forced into a mathematical compromise known as the **Spatial Indexing Trilemma**:

```
                         Exact 1:4 Hierarchical Nesting
                         & 1D B-Tree Database Range Scans
                             (Google S2 / Quadtree)
                                       ▲
                                      / \
                                     /   \
                                    /     \
                                   /       \
                                  /_________\
        Uniform Neighbor Distance             Real-World Road Topology
           & Radial Symmetry                  & Travel-Time Metric
          (Uber H3 / Hexagons)               (Graph Contraction / OSRM)
```

1. **Google S2** projects the sphere onto the 6 faces of a cube, subdividing each face into a 1:4 quadtree indexed by a Hilbert space-filling curve. While it provides exact hierarchical containment and fast B-tree range queries, its orthogonal cells suffer from non-uniform neighbor distances (diagonal neighbors are $\sqrt{2} \approx 1.414\times$ further than edge neighbors), causing distortion in radial spatial smoothing.
2. **Uber H3** partitions the sphere into hexagons projected onto an icosahedron. Hexagons have 6 equidistant neighbors, making them optimal for spatial smoothing, surge pricing, and diffusion heatmaps. However, hexagons cannot mathematically subdivide into smaller hexagons; H3 relies on an Aperture 7 rotation ($\approx 19.1^\circ$) where child cells overlap parent boundaries. This prevents clean hierarchical roll-ups and renders 1D range scans impossible. Furthermore, Euler's formula forces H3 to insert 12 pentagonal edge singularities into the grid.
3. **Network Routing Engines (OSRM, GraphHopper, Valhalla)** account for one-way roads, bridges, and rivers, but computing graph shortest paths on raw coordinates for hundreds of candidate drivers creates severe computational bottlenecks and latency.

### The TriHex Solution
**TriHex** resolves this trilemma by decoupling **storage geometry** from **analytic geometry** through a **Dual-Lattice Hierarchical Graph**:
- **Storage Layer**: Space is subdivided as an icosahedral equilateral triangular quadtree (1:4), indexed by a 1D Morton space-filling curve directly at bit 0. This guarantees **100% exact hierarchical containment** and **100% dense contiguous 1D integer intervals** ($end - start + 1 = 4^{\Delta R}$) for database B-trees with zero gap traversal.
- **Analytic Layer**: Every triangular cell resolves on-the-fly to its **hexagonal Voronoi dual**, providing **uniform 6-way equidistant neighbor adjacency** and radial $k$-ring diffusion without overlapping boundary artifacts.
- **Topological Layer**: Physical road network barriers (rivers, highways, bridges) are decoupled from the immutable spatial identifier into an external **Topology Partition Registry** (`TopologyPartitionRegistry`), enabling instantaneous $O(1)$ barrier-crossing detour penalties without mutating spatial keys.


---

## 2. Mathematical Foundations & Coordinate Transformations

### 2.1 The Regular Icosahedron Model
TriHex models the Earth on a regular icosahedron circumscribed by the unit sphere $S^2$. The icosahedron is selected because its 20 equilateral triangular faces minimize spherical angular distortion compared to tetrahedrons, cubes, or octahedrons.

The 12 vertices of the icosahedron are defined using the golden ratio $\phi = \frac{1 + \sqrt{5}}{2} \approx 1.61803398875$:

$$\text{Norm} = \sqrt{1 + \phi^2}, \quad a = \frac{1}{\text{Norm}}, \quad b = \frac{\phi}{\text{Norm}}$$

$$\begin{aligned}
V_0 &= (-a, b, 0), & V_1 &= (a, b, 0), & V_2 &= (-a, -b, 0), & V_3 &= (a, -b, 0) \\
V_4 &= (0, -a, b), & V_5 &= (0, a, b), & V_6 &= (0, -a, -b), & V_7 &= (0, a, -b) \\
V_8 &= (b, 0, -a), & V_9 &= (b, 0, a), & V_{10} &= (-b, 0, -a), & V_{11} &= (-b, 0, a)
\end{aligned}$$

The 20 faces $F_0 \dots F_{19}$ are ordered counter-clockwise triples of vertex indices $(V_{f0}, V_{f1}, V_{f2})$ with outward-pointing unit normal vectors $N_f = \frac{(V_{f1} - V_{f0}) \times (V_{f2} - V_{f0})}{\|(V_{f1} - V_{f0}) \times (V_{f2} - V_{f0})\|}$.

### 2.2 Spherical to Cartesian Mapping ($S^2 \to \mathbb{R}^3$)
Given latitude $\phi \in [-\frac{\pi}{2}, \frac{\pi}{2}]$ and longitude $\lambda \in [-\pi, \pi]$:

$$\vec{P} = \begin{bmatrix} \cos\phi \cos\lambda \\ \cos\phi \sin\lambda \\ \sin\phi \end{bmatrix}, \quad \|\vec{P}\| = 1$$

### 2.3 Gnomonic Face Projection ($P \to Q \in \text{Face}_f$)
The ray from the Earth's center through $\vec{P}$ intersects the plane of face $f$ at point $\vec{Q}$:

$$\vec{Q} = \vec{P} \cdot \frac{d_f}{\vec{P} \cdot \vec{N}_f}, \quad \text{where } d_f = \vec{V}_{f0} \cdot \vec{N}_f$$

Point $\vec{Q}$ is expressed in terms of the affine basis vectors $\vec{E}_1 = \vec{V}_{f1} - \vec{V}_{f0}$ and $\vec{E}_2 = \vec{V}_{f2} - \vec{V}_{f0}$:

$$\vec{Q} - \vec{V}_{f0} = u \vec{E}_1 + v \vec{E}_2$$

Solving via Cramer's rule yields the normalized planar barycentric coordinates $(u, v)$ where $u \ge 0, v \ge 0$, and $u + v \le 1$. The enclosing face is determined by evaluating the face whose barycentric weights satisfy $u, v, (1 - u - v) \ge 0$.

### 2.4 Closed-Form Barycentric 1:4 Triangular Subdivision
At each resolution level $r \in [0, R]$, a parent equilateral triangle with vertices $(A, B, C)$ subdivides into exactly 4 child triangles defined by edge midpoints:

$$M_{AB} = \frac{A + B}{2}, \quad M_{BC} = \frac{B + C}{2}, \quad M_{CA} = \frac{C + A}{2}$$

Any interior point $(u, v)$ has local barycentric weights:

$$\vec{P} - A = w_B (B - A) + w_C (C - A), \quad w_A = 1 - w_B - w_C$$

Because $w_A + w_B + w_C = 1$, the quadrant assignment is determined by an exact, closed-form decision boundary:
- **Child 0 (Corner A)**: $w_A \ge \frac{1}{2} \implies \text{New corners: } (A, M_{AB}, M_{CA})$
- **Child 1 (Corner B)**: $w_B \ge \frac{1}{2} \implies \text{New corners: } (M_{AB}, B, M_{BC})$
- **Child 2 (Corner C)**: $w_C \ge \frac{1}{2} \implies \text{New corners: } (M_{CA}, M_{BC}, C)$
- **Child 3 (Central Inverted)**: $w_A < \frac{1}{2} \land w_B < \frac{1}{2} \land w_C < \frac{1}{2} \implies \text{New corners: } (M_{AB}, M_{BC}, M_{CA})$

This produces a 2-bit quadrant index $q \in \{0, 1, 2, 3\}$ at each resolution step, interleaved into a 1D Morton integer:

$$\text{Morton}_{r+1} = (\text{Morton}_r \ll 2) \mid q$$

### 2.5 Inverse Gnomonic Projection ($Q \in \text{Face}_f \to S^2$)
Given face index $f$ and barycentric coordinates $(u, v)$, the planar Cartesian point is:

$$\vec{Q} = (1 - u - v)\vec{V}_{f0} + u\vec{V}_{f1} + v\vec{V}_{f2}$$

Normalizing $\vec{Q}$ back to the unit sphere yields the exact geodetic coordinates:

$$\vec{P} = \frac{\vec{Q}}{\|\vec{Q}\|}, \quad \phi = \arcsin(P_z), \quad \lambda = \operatorname{atan2}(P_y, P_x)$$

---

## 3. The 64-Bit Bitfield Architecture (`TriHexId`)

Every spatial entity in TriHex is represented as a single 64-bit unsigned integer (`bigint`).

```
63 62       58 57    54 53                                                              0
+--+----------+--------+-----------------------------------------------------------------+
|0 | Face(5b) |Res (4b)|              Triangular Quadtree Morton (54b)                   |
+--+----------+--------+-----------------------------------------------------------------+
```

### 3.1 Bitfield Specification

| Field | Bits | Shift | Bitmask | Description | Valid Range |
| :--- | :---: | :---: | :--- | :--- | :---: |
| **Sign Guard** | 1 | 63 | `0x8000000000000000` | Strictly 0 (PostgreSQL signed `BIGINT` non-negative guarantee) | $0$ |
| **Face** | 5 | 58 | `0x7C00000000000000` | Icosahedron Face Index | $0 \dots 19$ |
| **Resolution** | 4 | 54 | `0x03C0000000000000` | Grid Zoom Level | $0 \dots 15$ |
| **Morton Code** | 54 | 0 | `0x003FFFFFFFFFFFFF` | 1:4 Hierarchical Quadtree Curve (dense at bit 0) | $0 \dots 2^{30}-1$ |

### 3.2 O(1) Hierarchical Operations via Bitwise Arithmetic
Because triangular quadtree subdivision maps directly to base-4 Morton codes directly at bit 0:
- **Parent Roll-up**: Moving from resolution $R$ to parent resolution $R - k$ requires shifting the Morton code by $2k$ bits:
  $$\text{ParentMorton} = \text{Morton} \gg (2k)$$
  Execution time: **$\approx 0.35\text{ microseconds}$** ($2.84\text{M ops/sec}$).
- **Child Expansion**: A parent cell at resolution $R$ splits into $4^k$ children at resolution $R + k$. The child Morton codes span the continuous range:
  $$\text{StartMorton} = \text{Morton} \ll (2k), \quad \text{EndMorton} = \text{StartMorton} + 4^k - 1$$

### 3.3 Exact Contiguous 1D Database Range Scans (100% Dense Intervals)
In relational databases (PostgreSQL, SQLite, MySQL) and key-value engines (RocksDB, Redis), spatial containment queries do not require multi-dimensional R-Trees (`GIST`) or expensive polygon clipping.

Because Morton bits sit directly at bit 0 (`MORTON_SHIFT = 0n`), the difference between `end` and `start` is exact:
$$\text{end} - \text{start} + 1 = 4^{\Delta R}$$

A bounding district query is executed as a pure 1D integer interval range scan:

```sql
-- Retrieve all drivers, bookings, or landmarks within District Parent Cell
SELECT * FROM drivers 
WHERE trihex_id BETWEEN :rangeStart AND :rangeEnd;
```
This guarantees **0% gap traversal** and **0% false positives** over standard B-Tree indexes with optimal cache locality and $O(\log N)$ traversal.

---

## 4. The Hexagonal Voronoi Dual Lattice

### 4.1 Tri-Hex Duality
In plane geometry, the **Voronoi dual** of a regular triangular lattice is a regular hexagonal lattice. Around every vertex in an equilateral triangular grid, exactly 6 equilateral triangles converge:

```
            Triangular Grid (Storage)               Hexagonal Dual (Aggregation)
                     /\                                         ______
                    /__\                                       /      \
                   /\  /\                                     /   /\   \
                  /__\/__\                                   /___/__\___\
               (1:4 Clean Tree)                               \  \  /  /
                                                               \__\/__/
                                                        (6 Equidistant Neighbors)
```

By resolving the Voronoi dual of the triangular cells, TriHex provides the exact 6-way equidistant neighborhood symmetry of Uber H3 while preserving the strict 1:4 tree containment of Google S2.

### 4.2 6-Way Equidistant Neighbor Derivation
At resolution $R$, let the grid step size be $S = \frac{1}{2^R}$. The 6 hexagonal dual neighbors are resolved along the 3 lattice axes in planar barycentric space:

$$\Delta(u, v) \in \left\{ (S, 0), (0, S), (-S, S), (-S, 0), (0, -S), (S, -S) \right\}$$

When an offset $(nu, nv)$ crosses an icosahedron face boundary ($nu < 0$, $nv < 0$, or $nu + nv > 1$), TriHex avoids coordinate truncation. Instead, the unconstrained 3D Cartesian vector on the face plane is radially projected onto the unit sphere ($\vec{P} = \vec{Q}/\|\vec{Q}\|$), and re-projected onto the adjacent icosahedral face via spherical ray intersection. This guarantees **100% 6-neighbor resolution** and **100.00% reciprocal symmetry** globally ($A \in \operatorname{neighbors}(B) \iff B \in \operatorname{neighbors}(A)$) with zero orphaned links across face seams. Unlike H3, where 12 pentagons introduce 5-neighbor anomalies across the globe, TriHex maintains uniform 6-neighbor topology across face interiors.

### 4.3 Radial $k$-Ring Expansion & Surge Diffusion
A hexagonal $k$-ring (disk of radius $k$) contains an exact count of cells given by the centered hexagonal number formula:

$$|K_r| = 3k(k + 1) + 1$$

- $k = 0 \implies 1\text{ cell}$ (center)
- $k = 1 \implies 7\text{ cells}$ ($1 + 6$)
- $k = 2 \implies 19\text{ cells}$ ($1 + 6 + 12$)
- $k = 3 \implies 37\text{ cells}$ ($1 + 6 + 12 + 18$)

#### Dynamic Surge Diffusion Algorithm
Surge pricing multipliers are smoothly diffused from demand hotspots across neighboring cells using radial decay:

$$S(c) = 1.0 + (S_{\text{hotspot}} - 1.0) \cdot e^{-\frac{\operatorname{dist}(c, \text{hotspot})^2}{2\sigma^2}}$$

This eliminates artificial pricing "cliffs" across adjacent city blocks.

---

## 5. Road Network Topology & Metric Embedding

### 5.1 The 12-Bit Topology Cluster ID
Air-distance metrics fail in real-world transit because geometric proximity does not imply reachability (e.g., opposite sides of expressways, rivers, or railway tracks).

TriHex allocates **bits 0–11** of the 64-bit integer to store an embedded **Topology Cluster ID** ($0 \dots 4095$). This embeds the road network partition directly into the spatial index:

```typescript
// Instant O(1) barrier test via bitwise mask
const isCrossBarrier = (driverId & TOPO_CLUSTER_MASK) !== (riderId & TOPO_CLUSTER_MASK);
```

### 5.2 Physical Barrier & Natural Partition Isolation
When matching candidate drivers to a rider, drivers residing in a different topology cluster are immediately flagged. Even if a driver is geographically 300 meters away, a cluster mismatch signals an uncrossable barrier, preventing dispatching a driver who would face a 30-minute detour.

### 5.3 Effective Topology-Aware Distance Formulation
The effective routing cost between cell $A$ and cell $B$ is computed as:

$$D_{\text{effective}}(A, B) = \alpha \cdot D_{\text{geo}}(A, B) + \beta \cdot \text{Cost}_{\text{network}}(A, B)$$

Where:
- $D_{\text{geo}}(A, B)$ is the great-circle Haversine geodesic distance:
  $$D_{\text{geo}} = 2R_{\text{earth}} \arcsin\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1\cos\phi_2\sin^2\left(\frac{\Delta\lambda}{2}\right)}$$
- $\text{Cost}_{\text{network}}(A, B)$ is resolved from a precomputed cell-to-cell travel time tensor or assigned a barrier crossing penalty (default $3,000\text{m}$ equivalent detour).

---

## 6. Enterprise Capabilities

### 6.1 Canonical String & Hex Serialization
Because JavaScript native `BigInt` throws `TypeError` during `JSON.stringify()`, TriHex includes serialization primitives:
- **`TriHex.cellToString(id)`**: Formats the 64-bit integer into a canonical, lowercase, 16-character hexadecimal string padded with leading zeros (e.g., `"0650000000bd4533"`).
- **`TriHex.stringToCell(str)`**: Parses hex strings (supporting optional `0x` prefix) and enforces strict structural validation.
- **`TriHex.isValidCell(input)`**: Validates that all bitfields lie within geometric bounds.
- **`TriHex.bigIntReplacer`**: Drop-in JSON serializer function for Express, Fastify, and Socket.IO.

### 6.2 RFC 7946 GeoJSON Native Export
TriHex exports coordinates strictly adhering to RFC 7946 specifications:
- Coordinate ordering is **`[longitude, latitude]`** (WGS 84).
- Polygons follow a closed linear ring where the final vertex strictly equals the initial vertex ($V_{\text{last}} = V_0$).
- **`cellToGeoJSON(id)`**: Exports 4-coordinate triangular boundary polygons.
- **`hexDualToGeoJSON(id)`**: Exports 7-coordinate hexagonal dual boundary polygons.
- **`cellsToGeoJSON(ids, mode)`**: Bundles multiple cells into a single `FeatureCollection`.

### 6.3 Route & Area Rasterization (Supercover & Jordan Curve)
- **Polyline Rasterization (`lineStringToCells`)**:  
  Implements dense supercover ray-stepping along road network waypoints. The step distance is dynamically calibrated to $\frac{1}{2}$ the circumradius of the target resolution:
  $$\text{Step}_{\text{meters}} = \frac{R_{\text{circum}}}{2} = \frac{4,041,451}{2^{R+1}}$$
  This guarantees that continuous highway corridors (e.g., Lagos to Ibadan) are rasterized into an unbroken chain of adjacent cells without missing intermediate intersections.
- **Area Rasterization (`polygonToCells`)**:  
  Fills arbitrary geographic polygons (airport geofences, municipal zones) using high-performance scanline edge-intersection filling with complete geodesic protections:
  - **Antimeridian Crossing Support**: Polygons spanning the $\pm 180^\circ$ longitude meridian (e.g., Fiji, New Zealand, Alaska) are automatically normalized by unfolding negative longitudes into continuous angular space ($[0^\circ, 360^\circ]$), completely preventing planetary seam wrap-around bugs.
  - **Scanline Horizontal Filling**: Replaces $O(N \cdot M)$ brute-force bounding-box ray casting with exact scanline edge intersections. Interior horizontal spans between sorted $x$-intercepts are stepped along latitude rows, accelerating rasterization by up to $10\times$.
  - **DoS & Event-Loop Starvation Guards**: A safety threshold restricts grid traversal to $\le 200,000$ points per invocation, raising a descriptive `RangeError` if a query's bounding box and resolution would block the Node.js event loop.

### 6.4 Hierarchical Compaction & Decompaction
- **`compactCells(cells)`**:  
  Executes a two-phase hierarchical reduction:
  1. **Top-Down Ancestor Elimination**: If any cell $A$ in the input set is an ancestor of another cell $B$ ($A = \operatorname{cellToParent}(B)$), redundant child cell $B$ is immediately eliminated.
  2. **Bottom-Up 4:1 Sibling Reduction**: Whenever all 4 sibling micro-triangles sharing parent $P$ ($M \equiv 0, 1, 2, 3 \pmod 4$) are present in the set, the 4 children are collapsed into the single parent cell.
  
  Compaction operates recursively up the hierarchy, reducing storage footprints by up to **$93.75\%$**.
- **`uncompactCells(cells, targetResolution)`**:  
  Reversibly decompresses mixed-resolution compacted cells down to uniform target resolution micro-cells with $100\%$ mathematical fidelity.

---

## 7. Comprehensive API Reference

```typescript
export class TriHex {
  // --- Core Coordinate Conversion ---
  static latLngToCell(lat: number, lng: number, resolution: number, topoCluster?: number): TriHexId;
  static cellToLatLng(id: TriHexId): GeoCoord;
  static cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord];

  // --- Hierarchical Quadtree Navigation ---
  static cellToParent(id: TriHexId, targetResolution?: number): TriHexId;
  static cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange;
  static compactCells(cells: TriHexId[]): TriHexId[];
  static uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[];

  // --- Hexagonal Voronoi Dual & Neighbors ---
  static getHexNeighbors(id: TriHexId): TriHexId[];
  static hexRing(originId: TriHexId, radius: number): TriHexId[];
  static getHexDualBoundary(id: TriHexId): GeoCoord[];

  // --- Network Topology & Distance ---
  static getTopologyCluster(id: TriHexId): number;
  static withTopologyCluster(id: TriHexId, clusterId: number): TriHexId;
  static isSameCluster(idA: TriHexId, idB: TriHexId): boolean;
  static geodesicDistance(coordA: GeoCoord, coordB: GeoCoord): number;
  static effectiveDistance(idA: TriHexId, idB: TriHexId, params?: EffectiveDistanceParams, costMatrix?: Map<string, number>): number;

  // --- Serialization & Validation ---
  static cellToString(id: TriHexId): string;
  static stringToCell(str: string): TriHexId;
  static isValidCell(input: TriHexId | string): boolean;
  static bigIntReplacer(key: string, value: unknown): unknown;

  // --- GeoJSON Exports (RFC 7946) ---
  static cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
  static hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
  static cellsToGeoJSON(ids: TriHexId[], mode?: 'triangle' | 'hexDual'): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties>;

  // --- Rasterization ---
  static lineStringToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
  static polygonToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
  static getResolutionCellRadius(resolution: number): number;

  // --- Low-Level Packing Primitives ---
  static pack(face: number, resolution: number, morton: bigint, dualSector?: number, topoCluster?: number): TriHexId;
  static unpack(id: TriHexId): UnpackedTriHex;
}
```

---

## 8. Empirical Benchmarks & Verification

All benchmarks measured on Apple Silicon / V8 Node.js runtime across 100,000 iterations:

| Operation | Throughput (ops/sec) | Latency (µs/op) | Notes |
| :--- | :---: | :---: | :--- |
| **`cellToParent`** | **$2,839,391$** | $0.35\text{ µs}$ | Exact bit-shift operation |
| **`cellToChildrenRange`** | **$1,545,081$** | $0.65\text{ µs}$ | Contiguous 1D SQL range generation |
| **`cellToLatLng`** | **$779,426$** | $1.28\text{ µs}$ | Inverse Gnomonic trigonometric projection |
| **`latLngToCell` (Res 9)**| **$697,200$** | $1.43\text{ µs}$ | Forward Gnomonic + closed-form barycentric |
| **`getHexNeighbors`** | **$90,201$** | $11.09\text{ µs}$ | 6-neighbor Voronoi dual resolution |

### Geographic Precision Verification
Tested across global metropolitan centroids at Resolution 14 (theoretical cell circumradius $\approx 246\text{ meters}$):

| Metropolitan Location | Input Coordinates | Reconstructed Cell Center | Error Distance |
| :--- | :---: | :---: | :---: |
| **Lagos, Nigeria** | $6.5244^\circ\text{N}, 3.3792^\circ\text{E}$ | $6.5262^\circ\text{N}, 3.3801^\circ\text{E}$ | $233.1\text{ m}$ |
| **Abuja, Nigeria** | $9.0765^\circ\text{N}, 7.3986^\circ\text{E}$ | $9.0772^\circ\text{N}, 7.3968^\circ\text{E}$ | $233.4\text{ m}$ |
| **London, United Kingdom** | $51.5074^\circ\text{N}, -0.1278^\circ\text{E}$ | $51.5078^\circ\text{N}, -0.1281^\circ\text{E}$ | $47.9\text{ m}$ |
| **Tokyo, Japan** | $35.6762^\circ\text{N}, 139.6503^\circ\text{E}$ | $35.6763^\circ\text{N}, 139.6502^\circ\text{E}$ | $11.2\text{ m}$ |
| **New York, United States**| $40.7128^\circ\text{N}, -74.0060^\circ\text{E}$| $40.7131^\circ\text{N}, -74.0053^\circ\text{E}$| $81.1\text{ m}$ |
| **Sydney, Australia** | $-33.8688^\circ\text{N}, 151.2093^\circ\text{E}$| $-33.8694^\circ\text{N}, 151.2083^\circ\text{E}$| $120.5\text{ m}$ |

All coordinates reconstruct within theoretical circumradius limits with zero divergence.

---

## 9. Production Integration Guide for Mobility Systems

### 9.1 Distributed In-Memory Driver Positioning & Dispatching
To serve millions of concurrent drivers at real-world scale without ghost-driver memory leaks or Redis Cluster errors, use regional hash tags and atomic Lua migration:

```typescript
import { TriHex } from 'trihex';
import { redis } from '@/shared/redis';

// Lua script for atomic driver cell migration and TTL refresh
const MIGRATE_DRIVER_LUA = `
  local oldCellKey = ARGV[1]
  local newCellKey = KEYS[1]
  local driverId   = ARGV[2]
  local ttlSeconds = tonumber(ARGV[3])

  if oldCellKey ~= "" and oldCellKey ~= newCellKey then
    redis.call("SREM", oldCellKey, driverId)
  end
  redis.call("SADD", newCellKey, driverId)
  redis.call("EXPIRE", newCellKey, ttlSeconds * 4)
  redis.call("SET", "driver:pos:" .. driverId, newCellKey, "EX", ttlSeconds)
  return 1
`;

// On driver GPS ping (every 2-3s)
export async function handleDriverLocationPing(
  cityId: string,
  driverId: string,
  lat: number,
  lng: number
) {
  const cellId = TriHex.latLngToCell(lat, lng, 9);
  // Hash tag {cityId} ensures all cells in the metropolitan region hash to the same Redis Cluster slot
  const newCellKey = `{${cityId}}:cell:${TriHex.cellToString(cellId)}`;
  const oldCellKey = (await redis.get(`driver:pos:${driverId}`)) || '';

  await redis.eval(MIGRATE_DRIVER_LUA, 1, newCellKey, oldCellKey, driverId, 15);
}

// On passenger ride request
export async function matchNearbyDrivers(
  cityId: string,
  passengerLat: number,
  passengerLng: number
): Promise<string[]> {
  const passengerCell = TriHex.latLngToCell(passengerLat, passengerLng, 9);
  // 19 cells covering radial disk k=2 (~30km radius)
  const searchCells = TriHex.hexRing(passengerCell, 2);

  // All keys share the {cityId} hash tag -> collocated on single cluster slot!
  const keys = searchCells.map((c) => `{${cityId}}:cell:${TriHex.cellToString(c)}`);
  const candidateDrivers = await redis.sunion(...keys);

  return candidateDrivers;
}
```

### 9.2 Carpool Corridor & Intercity Route Matching
When matching intermediate pickups along an intercity trip (e.g. Lagos $\to$ Ibadan):

```typescript
import { TriHex } from 'trihex';
import { prisma } from '@/shared/db';

export async function matchTripsAlongCorridor(pickupLat: number, pickupLng: number) {
  // Coarse district parent cell at Res 6
  const district = TriHex.latLngToCell(pickupLat, pickupLng, 6);
  // Expand to children range at Res 9
  const { start, end } = TriHex.cellToChildrenRange(district, 9);

  // Instant 1D B-Tree index scan (guaranteed positive signed int64, zero leaks)
  return prisma.$queryRaw`
    SELECT id, driver_id, departure_time 
    FROM trips
    WHERE pickup_trihex_id BETWEEN ${start} AND ${end}
      AND status = 'scheduled'
    LIMIT 25;
  `;
}
```

### 9.3 2-Tier Candidate Dispatch Pipeline
Avoid rate-limiting routing APIs (OSRM / Valhalla) by filtering thousands of candidates down to the best 5 using TriHex spatial culling:

```typescript
export async function rankDriversByETA(
  candidates: { id: string; lat: number; lng: number }[],
  riderLat: number,
  riderLng: number
) {
  const riderCoord = { lat: riderLat, lng: riderLng };

  // Tier 1: Fast in-memory geodesic pre-ranking using Haversine
  const scored = candidates.map((driver) => {
    const dist = TriHex.geodesicDistance({ lat: driver.lat, lng: driver.lng }, riderCoord);
    return { driver, dist };
  });

  // Pick top 5 geographically closest candidates
  scored.sort((a, b) => a.dist - b.dist);
  const topCandidates = scored.slice(0, 5).map((s) => s.driver);

  // Tier 2: Query Graph Routing Engine (OSRM / Valhalla) for accurate turn-by-turn ETA
  return queryRoutingEngineForFinalETA(topCandidates, riderCoord);
}

---

## 10. Conclusion

`trihex` establishes a mathematically grounded alternative to legacy spatial indexing systems. By decoupling the 1:4 triangular storage hierarchy from the 6-way hexagonal Voronoi dual, it resolves the trade-offs that have constrained geospatial applications for over a decade.

The package is self-contained, has **zero external runtime dependencies**, and is architected for immediate production deployment in Weelbaro while ready for independent open-source publication.
