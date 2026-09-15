import { TriHexId } from './types';
export declare const MAX_CELL_RING_RADIUS = 15;
/**
 * Returns the three cells that share a complete edge with a triangular cell.
 *
 * TriHex stores triangles in an icosahedral spherical grid. Each triangle
 * has exactly three edge-adjacent triangles. This implementation uses
 * exact topological edge transitions across icosahedron face seams,
 * guaranteeing:
 *  1. Exactly 3 edge neighbors for every valid cell.
 *  2. 100% reciprocal symmetry: A in getCellNeighbors(B) <=> B in getCellNeighbors(A).
 *  3. Geometric edge sharing: boundary(A) and boundary(B) share the exact 2 vertices of that edge.
 *  4. Zero orphaned or missing links across face boundaries.
 */
export declare function getCellNeighbors(id: TriHexId): [TriHexId, TriHexId, TriHexId];
/**
 * Returns the graph disk of triangular edge-adjacent cells within graph distance radius k.
 * At radius 0: [origin]
 * At radius 1: 4 cells (1 center + 3 edge neighbors)
 * At radius 2: 10 cells (exact triangular progression)
 */
export declare function cellDisk(originId: TriHexId, radius: number): TriHexId[];
/**
 * Canonical alias for cellDisk: returns the graph disk of triangular edge-adjacent cells within graph distance radius k.
 */
export declare const getCellDisk: typeof cellDisk;
