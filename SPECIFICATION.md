# TriHex Specification

## Status

TriHex is an experimental **triangular** icosahedral spatial index. This document describes the current implementation, not a production-capacity claim.

It does **not** provide a globally regular hexagonal Voronoi dual, six equidistant cell neighbours, road-network topology, live traffic, ETA prediction, Redis durability, or global dispatch optimality. Earlier descriptions of those capabilities were removed because they were not implemented or mathematically valid for the stored triangular grid.

## Spatial representation

The unit sphere is partitioned by a regular icosahedron with 20 triangular faces. A geographic point is converted to a unit Cartesian vector, radially projected onto its selected face plane, represented in barycentric face coordinates, and recursively assigned to one of four triangular children at each resolution.

At resolution `r` (0 through 15), each face has `4^r` triangular cells. Each child appends a two-bit digit to the parent Morton code. Valid cells therefore support:

```text
parentMorton = morton >> (2 * deltaResolution)
startMorton  = parentMorton << (2 * deltaResolution)
endMorton    = startMorton + 4^deltaResolution - 1
```

The descendant interval applies to cells on the same face at the requested target resolution. It is not a complete geographic-cover query for regions that cross faces.

## ID layout

```text
63 62       58 57    54 53                                                              0
+--+----------+--------+-----------------------------------------------------------------+
|0 | Face(5b) |Res (4b)|              Triangular Quadtree Morton (54b)                   |
+--+----------+--------+-----------------------------------------------------------------+
```

Generated IDs are non-negative signed-64-bit values. At maximum resolution, only 30 Morton bits are used. The ID contains no topology partition; topology labels are stored in a caller-managed in-memory registry.

## Adjacency

A stored cell is a triangle and has exactly three edge-adjacent triangular cells. `getCellNeighbors` computes them by crossing each cell boundary edge on the sphere and assigning the crossing point normally; this works across icosahedron face seams. `cellDisk` performs bounded breadth-first expansion over this three-edge graph.

Deprecated compatibility APIs retain old names:

- `getHexNeighbors` is an alias for `getCellNeighbors` and returns **three**, not six, neighbours.
- `hexRing` is an alias for `cellDisk` and is not a hexagonal ring.
- `hexDualToGeoJSON` returns the actual closed triangular boundary and is not a hexagon.

## Integration boundaries

`TopologyPartitionRegistry` is an in-process map of caller-assigned labels. Equality is not a proof of road reachability or ETA. `RouteCostProvider` is only an interface for an external routing service. The included dispatch class is a prototype candidate-retrieval implementation and must not be interpreted as a complete ride-hailing dispatch system.

## Known limitations

See [AUDIT_REPORT.md](AUDIT_REPORT.md) for the independent audit, residual state-management, routing, rasterization, database, and scalability blockers, plus required production remediation.
