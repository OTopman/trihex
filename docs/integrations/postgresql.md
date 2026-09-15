# TriHex PostgreSQL & SQL B-Tree Integration Guide

This guide describes how to integrate the TriHex spatial indexing library with PostgreSQL, CockroachDB, MySQL, SQLite, and Prisma using native signed 64-bit integer (`BIGINT`) fields and standard 1D B-Tree indexes.

---

## Architectural Philosophy: Database-Agnostic Core

`@trihex/core` has **zero external runtime dependencies**. It does not bundle database drivers (`pg`, `mysql2`, `better-sqlite3`) or ORMs (`prisma`, `typeorm`, `drizzle`). 

Instead, TriHex exposes mathematical primitives:
1. Canonical 63-bit signed-integer cell IDs (`TriHexId` / `bigint`).
2. Exact 1D bounding ranges (`CellRange` and `CellRangeSet`).
3. Hierarchical quadtree parent-child interval projections (`cellToChildrenRange`).

This allows applications to use any relational database engine and achieve $O(\log N)$ spatial range scans without requiring specialized geospatial extensions like PostGIS.

---

## 1. The 63-Bit Signed-Safe Representation

PostgreSQL, SQLite, and Java lack unsigned 64-bit integers. PostgreSQL's `BIGINT` is signed:
$$-2^{63} \le x \le 2^{63} - 1$$

In naive 64-bit DGGS implementations where bit 63 is used, IDs with the top bit set become negative numbers in PostgreSQL. This causes sorting inversion:
- Values that should sort at the high end of the index sort at the negative low end.
- Range queries (`WHERE id BETWEEN start AND end`) silently fail or return corrupted results.

### TriHex Bit Layout Guard
TriHex enforces bit 63 to be strictly `0`:

```
Bit 63:     0 (Sign Guard — guarantees strictly non-negative int64)
Bits 58-62: 5 bits: Face ID (0..19)
Bits 54-57: 4 bits: Resolution (0..15)
Bits 0-53:  54 bits: Triangular Morton Code (up to 30 bits for resolution 15)
```

Because bit 63 is always `0`:
- TriHex IDs always fit within $[0, 9223372036854775807]$ (`0x0000000000000000` to `0x7FFFFFFFFFFFFFFF`).
- Lexicographical sorting, numerical B-Tree index sorting, and spatial quadtree traversal are **100% monotonic and identical**.

---

## 2. PostgreSQL DDL & Indexing

### Table Schema

```sql
CREATE TABLE driver_locations (
    driver_id VARCHAR(64) PRIMARY KEY,
    cell_id BIGINT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard PostgreSQL 1D B-Tree Index
CREATE INDEX idx_driver_locations_cell ON driver_locations (cell_id);

-- Optional composite index for status filtering
CREATE INDEX idx_driver_locations_status_cell ON driver_locations (status, cell_id);
```

---

## 3. Hierarchical B-Tree Range Queries

Because Morton codes are contiguous for all descendants of a triangle, the descendants of a parent cell at resolution $R_{parent}$ down to a finer resolution $R_{child}$ form an exact, contiguous 1D interval:

$$[\text{startId}, \text{endId}]$$

Density is mathematically 100%:
$$\text{endId} - \text{startId} + 1 = 4^{(R_{child} - R_{parent})}$$

### Generating the Range in TypeScript

```typescript
import { TriHex } from 'trihex';

// Rider requests pickup in Victoria Island, Lagos
const pickupLat = 6.4281;
const pickupLng = 3.4219;

// Macro search region at resolution 6 (approx 12 km across)
const parentCell = TriHex.latLngToCell(pickupLat, pickupLng, 6);

// Query all micro-cells at resolution 9 (approx 1.5 km across) inside this parent
const range = TriHex.cellToChildrenRange(parentCell, 9);

console.log(`Query Range: [${range.start.toString()}, ${range.end.toString()}]`);
```

### SQL Execution

```sql
-- Single B-Tree index range scan: O(log N)
SELECT driver_id, latitude, longitude, cell_id
FROM driver_locations
WHERE cell_id BETWEEN $1 AND $2
  AND status = 'AVAILABLE';
```

With parameterized values:
- `$1 = range.start` (as BigInt)
- `$2 = range.end` (as BigInt)

---

## 4. Multi-Range Geofence & Polygon Queries

For arbitrary polygonal search areas (e.g. municipal delivery zones or airport geofences):
1. Rasterize the polygon using `TriHex.polygonToCells(coordinates, resolution)`.
2. Compact the cells using `TriHex.compactCells(cells)` to minimize the number of ranges.
3. Map each compacted cell to its children range or use multiple `BETWEEN` predicates.

```typescript
import { TriHex, CellRange } from 'trihex';

export function polygonToSqlRanges(
  coordinates: [number, number][][],
  targetResolution: number
): CellRange[] {
  // 1. Fill polygon at target resolution
  const cells = TriHex.polygonToCells(coordinates, targetResolution);
  
  // 2. Hierarchically merge 4-sibling clusters
  const compacted = TriHex.compactCells(cells);
  
  // 3. Project each cell to target resolution range
  return compacted.map((cell) => TriHex.cellToChildrenRange(cell, targetResolution));
}
```

### SQL Query with Multiple Ranges

```sql
-- Generated SQL for multi-interval scan
SELECT driver_id, latitude, longitude, cell_id
FROM driver_locations
WHERE (
    (cell_id BETWEEN $1 AND $2) OR
    (cell_id BETWEEN $3 AND $4) OR
    (cell_id BETWEEN $5 AND $6)
)
AND status = 'AVAILABLE';
```

PostgreSQL's optimizer will execute a **Bitmap Index Scan** across `idx_driver_locations_cell`, merging the index ranges in memory in sub-millisecond time without reading unindexed rows.

---

## 5. Prisma Schema Example

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model DriverLocation {
  driverId  String   @id @map("driver_id") @db.VarChar(64)
  cellId    BigInt   @map("cell_id")
  latitude  Float
  longitude Float
  status    String   @default("AVAILABLE") @db.VarChar(32)
  version   BigInt   @default(1)
  updatedAt DateTime @default(now()) @map("updated_at")

  @@index([cellId], name: "idx_driver_cell")
  @@index([status, cellId], name: "idx_driver_status_cell")
  @@map("driver_locations")
}
```

Querying with Prisma:

```typescript
const range = TriHex.cellToChildrenRange(parentCell, 9);

const availableDrivers = await prisma.driverLocation.findMany({
  where: {
    status: 'AVAILABLE',
    cellId: {
      gte: range.start,
      lte: range.end,
    },
  },
});
```

---

## 6. Performance Characteristics

| Metric | PostGIS `ST_DWithin` | TriHex B-Tree `BETWEEN` |
|---|---|---|
| Index Type | R-Tree / GiST | 1D B-Tree |
| Scan Complexity | $O(\log N)$ with 2D bounding boxes | $O(\log N)$ 1D scalar bounds |
| Memory Footprint | High (geometry cache + GiST page splits) | Minimal (standard 8-byte scalar index) |
| Engine Portability | Requires PostGIS extension | Native to PostgreSQL, MySQL, SQLite, DynamoDB, Cassandra |
| False Positive Rate | Depends on bounding-box overlap | **0%** within hierarchical cell bounds |
