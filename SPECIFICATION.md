# TriHex Discrete Global Spatial Index Specification

**Version:** 1.0.0 (Production Remediation)  
**Classification:** Technical Specification & Mathematical Architecture

---

## 1. Introduction

TriHex is a Discrete Global Grid System (DGGS) and mobility dispatch engine built upon a regular spherical icosahedron. It provides two mathematically dual spatial representations:
1. **Primal Triangulation**: Exact 1:4 hierarchical triangular quadtree optimized for 1D database B-Tree index range scans and hierarchical rasterization.
2. **Dual Spherical Voronoi Tiling**: Genuine spherical Voronoi dual consisting of regular hexagons and exactly 12 pentagonal singularities, providing uniform 6-neighbor spatial expansion for surge heatmaps and candidate driver retrieval.

---

## 2. Mathematical Foundation

### 2.1 The Regular Icosahedron Base Polyhedron
The unit sphere $S^2 = \{ x \in \mathbb{R}^3 \mid \|x\| = 1 \}$ is approximated by a regular icosahedron with 12 vertices, 30 edges, and 20 equilateral triangular faces.

The 12 canonical vertices are defined using the golden ratio $\phi = \frac{1 + \sqrt{5}}{2}$ normalized by $K = \sqrt{1 + \phi^2}$:
$$A = \frac{1}{K}, \quad B = \frac{\phi}{K}$$

$$\begin{aligned}
v_0 &= (-A, B, 0), & v_1 &= (A, B, 0), & v_2 &= (-A, -B, 0), & v_3 &= (A, -B, 0), \\
v_4 &= (0, -A, B), & v_5 &= (0, A, B), & v_6 &= (0, -A, -B), & v_7 &= (0, A, -B), \\
v_8 &= (B, 0, -A), & v_9 &= (B, 0, A), & v_{10} &= (-B, 0, -A), & v_{11} &= (-B, 0, A)
\end{aligned}$$

The 20 faces are arranged with outward counter-clockwise winding. Each of the 30 edges is shared between exactly two faces with reversed vertex orientation ($v_a \to v_b$ on $F_1 \iff v_b \to v_a$ on $F_2$), enabling $O(1)$ topological seam transitions.

### 2.2 Forward & Inverse Radial Gnomonic Projection
A geographic coordinate $(\text{lat}, \text{lng})$ is converted to a 3D unit vector $P = (\cos\phi\cos\lambda, \cos\phi\sin\lambda, \sin\phi)$.

The ray from the origin through $P$ intersects the face plane with normal $N_f$ and centroid $C_f$ at:
$$Q = \frac{P \cdot C_f}{P \cdot N_f} P$$

Within face $f$ with vertices $(v_0, v_1, v_2)$, point $Q$ has unique barycentric coordinates $(u, v, w)$ such that:
$$Q = w v_0 + u v_1 + v v_2, \quad u + v + w = 1$$

The inverse projection maps barycentric coordinates $(u, v)$ back to the unit sphere:
$$P = \frac{w v_0 + u v_1 + v v_2}{\|w v_0 + u v_1 + v v_2\|}$$

The maximum forward-inverse roundtrip error across 1,000,000 global points is $< 0.0005\text{ mm}$.

---

## 3. Primal Triangular Quadtree & 1:4 Subdivision

At resolution $R \in [0, 15]$, each icosahedron face is subdivided into $N^2 = 4^R$ micro-triangles ($N = 2^R$), totaling $F(R) = 20 \cdot 4^R$ triangles globally.

### Resolution Metadata & Quantization Extents

The DGGS distinguishes between **projection numerical precision** ($< 0.0006\text{ mm}$ roundtrip error) and **cell geometric extent / quantization error** (geodesic distance from a point to its cell centroid):

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

### Hierarchical Morton Coding
At each subdivision step, an equilateral triangle is partitioned into 4 congruent sub-triangles (3 pointing up, 1 central inverted triangle pointing down) assigned a 2-bit quadrant index:
- Quadrant 0 (`00`): Corner 0 child ($w_A \ge 0.5$).
- Quadrant 1 (`01`): Corner 1 child ($w_B \ge 0.5$).
- Quadrant 2 (`10`): Corner 2 child ($w_C \ge 0.5$).
- Quadrant 3 (`11`): Central inverted child.

The Morton code is formed by left-shifting parent bits by 2 and OR-ing the child quadrant:
$$\text{morton}_{R} = (\text{morton}_{R-1} \ll 2) \mid \text{quad}$$

---

## 4. Canonical 63-Bit Non-Negative ID Layout (`TriHexId`)

To eliminate sign-inversion bugs and guarantee native compatibility with PostgreSQL, CockroachDB, MySQL, and SQLite `BIGINT` (`int8`), TriHex constrains bit 63 to strictly `0`:

```
Bit 63:     0 (Sign Guard — guarantees strictly non-negative signed int64)
Bits 58-62: 5 bits: Face ID (0..19)
Bits 54-57: 4 bits: Resolution (0..15)
Bit 53:     1 bit:  Mode Bit (0 = Primal Triangle Cell, 1 = Dual Voronoi Cell)
Bits 0-52:  53 bits: Payload
```

### Primal Triangle Payload (Mode Bit = 0)
- Bits 0–29: Triangular Morton code ($2 \times 15 = 30$ bits at maximum resolution 15).
- Bits 30–52: Strictly `0`.

### Dual Voronoi Cell Payload (Mode Bit = 1)
- Bits 26–41: Integer vertex coordinate $I$ on canonical face ($0 \le I \le 2^R$).
- Bits 10–25: Integer vertex coordinate $J$ on canonical face ($0 \le J \le 2^R$).
- Bits 0–9: Strictly `0`.

Every `TriHexId` satisfies:
$$0 \le \text{TriHexId} \le 9,223,372,036,854,775,807 \quad (\le 2^{63} - 1)$$

---

## 5. 1D B-Tree SQL Interval Scans

Because quadtree Morton codes are contiguous for all descendants of a parent, any parent cell at resolution $R_{parent}$ down to resolution $R_{child}$ forms an exact, continuous 1D range:

$$\text{startId} = \text{pack}(f, R_{child}, \text{parentMorton} \ll 2\Delta R)$$
$$\text{endId} = \text{pack}(f, R_{child}, (\text{parentMorton} \ll 2\Delta R) + 4^{\Delta R} - 1)$$

### Theorem (100% Interval Density)
The interval $[\text{startId}, \text{endId}]$ contains exactly $4^{\Delta R}$ contiguous cell IDs:
$$\text{endId} - \text{startId} + 1 = 4^{\Delta R}$$

Every cell in this interval is a descendant of the parent cell, and no non-descendant cell falls within the interval. This guarantees **zero false positives** when executing standard SQL queries:

```sql
SELECT * FROM driver_locations WHERE cell_id BETWEEN :startId AND :endId;
```

---

## 6. Genuine Spherical Voronoi Dual

### 6.1 Duality & Euler Characteristic
In Delaunay-Voronoi spherical duality:
- Primal mesh faces (triangles) $\leftrightarrow$ Dual mesh vertices (spherical circumcenters).
- Primal mesh vertices $\leftrightarrow$ Dual mesh faces (Voronoi cells).
- Primal mesh edges $\leftrightarrow$ Dual mesh edges (perpendicular bisectors).

On a closed spherical surface with genus 0, the Euler characteristic is:
$$V - E + F = 2$$

At resolution $R$:
- Primal triangles: $F_p = 20 \cdot 4^R$.
- Primal edges: $E_p = 30 \cdot 4^R$.
- Primal vertices: $V_p = 10 \cdot 4^R + 2$.

By duality, the number of Voronoi dual cells $F_d$ equals the number of primal vertices $V_p$:
$$F_d = 10 \cdot 4^R + 2$$

At every resolution $R$:
- Exactly **12 vertices** have degree 5 (the original icosahedral corners where 5 triangles meet). Their Voronoi dual cells are exact **PENTAGONS**.
- Exactly $10 \cdot 4^R - 10$ **vertices** have degree 6 (where 6 triangles meet). Their Voronoi dual cells are exact **HEXAGONS**.

### 6.2 Circumcenter Boundary & Shared Dual Edges
For any primal vertex $V$, the boundary of its Voronoi dual cell is formed by the spherical circumcenters of the primal triangles meeting at $V$.

For a spherical triangle with 3D unit vertices $(v_A, v_B, v_C)$, its spherical circumcenter $C$ is the outward unit normal to the plane containing the vertices:
$$N = (v_B - v_A) \times (v_C - v_A), \quad C = \frac{N}{\|N\|}$$

Two Voronoi dual cells are adjacent if and only if their primal vertices share an edge. The dual edge separating them is the great-circle segment connecting the circumcenters of the two primal triangles that share that edge.

Every reported dual neighbor shares **exactly two circumcenter vertices** (a complete dual edge). Dual neighbor relationships are **100% reciprocal**:
$$A \in \text{neighbors}(B) \iff B \in \text{neighbors}(A)$$

### 6.3 Hexagonal Ring Expansion
Breadth-first search on the dual hexagonal graph (`hexRing`) satisfies the hexagonal ring formula for regular hexagonal regions:
$$N(k) = 1 + 3k(k + 1)$$
- Radius $k = 0$: $1$ cell.
- Radius $k = 1$: $7$ cells ($1 + 6$).
- Radius $k = 2$: $19$ cells ($1 + 6 + 12$).
- Radius $k = 3$: $37$ cells ($1 + 6 + 12 + 18$).

---

## 7. Distributed Mobility Dispatch Architecture

### 7.1 Intra-City Spatial Sharding
To prevent hot-shard bottlenecks where an entire megacity maps to a single Redis Cluster slot, TriHex derives an intra-city spatial shard from a coarse parent cell at resolution 4:

$$\text{spatialShard} = \text{cellToString}(\text{cellToParent}(\text{cellId}, 4))[8..15]$$

Redis keys are formatted with compound hash tags:
- Cell Set Key: `{cityId:spatialShard}:cell:{cellIdHex}`
- Driver Record Key: `{cityId:spatialShard}:driver:{driverId}`

This distributes a megacity's workload across multiple Redis Cluster slots while maintaining locality for adjacent micro-cells.

### 7.2 Monotonic Sequence & Atomic Lua Lifecycle
- **Atomic Migration (`MIGRATE_DRIVER_LUA`)**: Verifies `incomingVersion > existingVersion`. Reads authoritative previous cell from the stored record, removes driver from old cell (`SREM`), adds to new cell (`SADD`), and updates driver position (`SET ... EX driverTtl`). Rejects stale out-of-order GPS packets and eliminates ghost drivers.
- **Offline Tombstones (`REMOVE_DRIVER_LUA`)**: Atomically removes driver from cell set and writes a tombstone with incremented version and tombstone TTL, preventing delayed cellular pings from resurrecting offline drivers.
- **Multi-Tier Retrieval**:
  - Tier 1: Concentric triangular disk retrieval (`cellDisk`) pre-ranking up to 50 candidates by geodesic distance.
  - Tier 2: Turn-by-turn road routing via `RouteCostProvider` (OSRM/Valhalla) on top 15-25 candidates.
  - Tier 3: Multi-objective candidate ranking returning optimal top $K$ drivers from within the retained candidate pool.
