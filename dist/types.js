"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDGE_BIT_LAYOUT = exports.BIT_LAYOUT = void 0;
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
exports.BIT_LAYOUT = {
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
};
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
exports.EDGE_BIT_LAYOUT = {
    EDGE_FLAG_BIT: 52n,
    EDGE_FLAG_MASK: 1n << 52n,
    EDGE_INDEX_SHIFT: 49n,
    EDGE_INDEX_BITS: 3n,
    EDGE_INDEX_MASK: 0x7n << 49n,
    ORIGIN_MASK: ~((1n << 52n) | (0x7n << 49n)) & exports.BIT_LAYOUT.MAX_SIGNED_INT64,
};
