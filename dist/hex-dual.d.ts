import { GeoCoord, TriHexId } from './types';
/**
 * Resolves the hexagonal Voronoi dual for a given TriHexId.
 * Computes the 6 equidistant neighbors of the cell's Voronoi dual.
 *
 * Uses unconstrained 3D face plane projection to naturally transition across
 * icosahedron face seams with zero clamping errors, guaranteed 6 neighbors,
 * and 100% reciprocal symmetry.
 */
export declare function getHexNeighbors(id: TriHexId): TriHexId[];
export declare const MAX_HEX_RING_RADIUS = 15;
/**
 * Returns all cells within distance k (k-ring disk) around the target cell.
 * Used for dynamic surge price diffusion, supply heatmaps, and radial driver dispatching.
 *
 * Guaranteed safe execution: capped at MAX_HEX_RING_RADIUS (15) to prevent
 * single-threaded Node.js event-loop starvation.
 */
export declare function hexRing(originId: TriHexId, radius: number): TriHexId[];
/**
 * Computes the 6 vertices forming the hexagonal Voronoi dual boundary
 */
export declare function getHexDualBoundary(id: TriHexId): GeoCoord[];
