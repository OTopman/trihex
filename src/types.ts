export type TriHexId = bigint;

export interface GeoCoord {
  lat: number;
  lng: number;
}

export type Vector3D = [number, number, number];

export interface FaceCoord {
  face: number;
  u: number;
  v: number;
}

export interface CellRange {
  start: TriHexId;
  end: TriHexId;
}

export type CellRangeSet = CellRange[];

/**
 * Genuine Spherical Voronoi Dual Cell representation.
 * Every dual cell is centered at a primal vertex of the icosahedral triangulation.
 * Cells are regular hexagons (degree 6) everywhere, except at the 12 icosahedron
 * vertices where Euler's formula strictly dictates degree-5 pentagons.
 */
export interface HexDual {
  readonly id: TriHexId;
  readonly center: GeoCoord;
  readonly boundary: GeoCoord[];
  readonly neighbors: TriHexId[];
  readonly isPentagon: boolean;
  readonly degree: 5 | 6;
}

export interface EffectiveDistanceParams {
  alpha?: number; // Weight for geographic geodesic distance
  beta?: number;  // Weight for network routing / travel time cost
  barrierPenaltyMeters?: number; // Penalty in meters for crossing partition barriers
}

/**
 * 64-bit Bitfield Layout Constants (Pure Canonical 63-Bit Non-Negative Representation)
 *
 * Ordered hierarchically from MSB to LSB to guarantee:
 *  1. Exact 1D database B-Tree range queries (WHERE id BETWEEN start AND end)
 *     with 100% density (end - start + 1 == 4^ΔR) and zero false positives.
 *  2. 100% compatibility with signed 64-bit SQL BIGINT (PostgreSQL/Prisma):
 *     Bit 63 is strictly 0, ensuring all TriHexId values are non-negative,
 *     eliminating numeric overflow and sign-inversion sorting bugs.
 *  3. Storage & database independence: Logical spatial ID layout, not an engine constraint.
 *
 *  Bit 63     (1 bit):   Sign Guard (strictly 0)
 *  Bits 58–62 (5 bits):  Face ID (0..19)
 *  Bits 54–57 (4 bits):  Resolution (0..15)
 *  Bits 0–53  (54 bits): Triangular Quadtree Morton Code (up to 30 bits for 15 levels)
 */
export const BIT_LAYOUT = {
  FACE_BITS: 5n,
  RES_BITS: 4n,
  MORTON_BITS: 54n,

  FACE_SHIFT: 58n,
  RES_SHIFT: 54n,
  MORTON_SHIFT: 0n,

  FACE_MASK: 0x1fn << 58n,
  RES_MASK: 0x0fn << 54n,
  MORTON_MASK: (1n << 54n) - 1n,

  SIGN_GUARD_BIT: 63n,
  MAX_SIGNED_INT64: 0x7fffffffffffffffn,
  MAX_RESOLUTION: 15,
  TOTAL_FACES: 20,
  TOTAL_VERTICES: 12,
  TOTAL_EDGES: 30,
} as const;

export type TriHexEdgeId = bigint;

/**
 * Directed Edge representation (Flow Vector) between two adjacent cells.
 */
export interface TriHexDirectedEdge {
  readonly edgeId: TriHexEdgeId;
  readonly origin: TriHexId;
  readonly destination: TriHexId;
  readonly edgeIndex: number;
  readonly isDual: boolean;
  readonly boundary: [GeoCoord, GeoCoord];
}

/**
 * Bitfield layout constants for canonical 63-bit Directed Edges (TriHexEdgeId).
 * Bit 63:     Sign Guard (strictly 0)
 * Bits 58-62: Face ID (0..19)
 * Bits 54-57: Resolution (0..15)
 * Bit 53:     Dual mode bit (0 = primal triangle edge, 1 = dual Voronoi edge)
 * Bit 52:     Directed edge flag (strictly 1)
 * Bits 49-51: Edge neighbor index (0..7, 3 bits: 0..2 for primal, 0..5 for dual)
 * Bits 0-48:  Origin payload
 */
export const EDGE_BIT_LAYOUT = {
  EDGE_FLAG_BIT: 52n,
  EDGE_FLAG_MASK: 1n << 52n,
  EDGE_INDEX_SHIFT: 49n,
  EDGE_INDEX_BITS: 3n,
  EDGE_INDEX_MASK: 0x7n << 49n,
  ORIGIN_MASK: ~((1n << 52n) | (0x7n << 49n)) & BIT_LAYOUT.MAX_SIGNED_INT64,
} as const;

