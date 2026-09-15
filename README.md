# trihex

> Experimental icosahedral **triangular** discrete global grid with exact per-face 1:4 hierarchy and Morton-prefix IDs.

TriHex is a TypeScript library for triangular spatial indexing. It is **not** a hexagonal grid, road-network topology engine, ETA model, or production ride-hailing dispatch system. See [AUDIT_REPORT.md](AUDIT_REPORT.md) for known production blockers and the independent audit history.

## What is implemented

- Icosahedral face projection and inverse projection.
- Per-face triangular 1:4 subdivision at resolutions 0–15.
- Compact signed-positive `bigint` IDs: face, resolution, and Morton prefix.
- Parent and same-face descendant-range operations.
- Three geometric edge neighbours per triangular cell, including face seams.
- Triangular graph-disk expansion (`cellDisk`).
- Serialization, GeoJSON triangles, simple sampled rasterization, and compaction utilities.

## Important limitations

- Arbitrary geographic regions can cross icosahedron faces: a single Morton range only represents descendants of one parent on one face at one target resolution.
- `TopologyPartitionRegistry` is an in-memory caller-managed label map; it is not a road graph and does not establish reachability or ETA.
- `RouteCostProvider` is only an interface.
- Rasterization is sampled and is not a robust polygon-intersection implementation.
- The deprecated `getHexNeighbors`, `hexRing`, and `hexDualToGeoJSON` compatibility APIs no longer claim hexagonal semantics. Use `getCellNeighbors`, `cellDisk`, and `cellToGeoJSON`.

## Quick start

```ts
import { TriHex } from 'trihex';

const cell = TriHex.latLngToCell(6.5244, 3.3792, 9);
const center = TriHex.cellToLatLng(cell);
const parent = TriHex.cellToParent(cell, 7);
const childrenAt9 = TriHex.cellToChildrenRange(parent, 9);

// Three triangles sharing a complete edge with `cell`.
const edgeNeighbours = TriHex.getCellNeighbors(cell);
const nearbyTriangles = TriHex.cellDisk(cell, 2);

const geojson = TriHex.cellToGeoJSON(cell);
```

## Development

```bash
npm ci
npm run build
npm test
npm run benchmark
```

`npm run benchmark` is a local microbenchmark only. It is not a production-capacity or dispatch-throughput measurement.

## License

MIT © Deebezt Technologies
