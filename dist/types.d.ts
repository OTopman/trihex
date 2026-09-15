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
    alpha?: number;
    beta?: number;
    barrierPenaltyMeters?: number;
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
export declare const BIT_LAYOUT: {
    readonly FACE_BITS: 5n;
    readonly RES_BITS: 4n;
    readonly MORTON_BITS: 54n;
    readonly FACE_SHIFT: 58n;
    readonly RES_SHIFT: 54n;
    readonly MORTON_SHIFT: 0n;
    readonly FACE_MASK: bigint;
    readonly RES_MASK: bigint;
    readonly MORTON_MASK: bigint;
    readonly SIGN_GUARD_BIT: 63n;
    readonly MAX_SIGNED_INT64: 9223372036854775807n;
    readonly MAX_RESOLUTION: 15;
    readonly TOTAL_FACES: 20;
    readonly TOTAL_VERTICES: 12;
    readonly TOTAL_EDGES: 30;
};
