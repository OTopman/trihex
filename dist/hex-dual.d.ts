import { GeoCoord, HexDual, TriHexId } from './types';
export { cellDisk, getCellNeighbors, MAX_CELL_RING_RADIUS } from './adjacency';
export declare const MAX_HEX_RING_RADIUS = 15;
/**
 * Packs a canonical vertex (face, resolution, I, J) into a 63-bit sign-safe dual cell ID.
 */
export declare function packDualCellId(face: number, resolution: number, I: number, J: number): TriHexId;
/**
 * Returns true if the given TriHexId represents a dual Voronoi cell.
 */
export declare function isDualCellId(id: TriHexId): boolean;
/**
 * Decodes a dual Voronoi cell ID into its canonical components.
 */
export declare function unpackDualCellId(id: TriHexId): {
    face: number;
    resolution: number;
    I: number;
    J: number;
};
/**
 * Maps any vertex coordinate (face, I, J) across seams to its unique canonical representation.
 */
export declare function getCanonicalVertex(face: number, resolution: number, I: number, J: number): {
    face: number;
    I: number;
    J: number;
    isCorner: boolean;
};
/**
 * Returns all canonical dual cell IDs at the given resolution.
 * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
 */
export declare function getResolutionDualCells(resolution: number): TriHexId[];
/**
 * Constructs the genuine spherical Voronoi dual cell (HexDual) for a given TriHexId.
 *
 * Accepts either a primal triangle cell ID or a dual Voronoi cell ID.
 * Returns the exact Voronoi polygon boundary (5 vertices for 12 pentagonal singularities,
 * 6 vertices for regular hexagons) and exact edge-sharing dual neighbors.
 */
export declare function getHexDual(id: TriHexId): HexDual;
/**
 * Returns the exact neighbor cells in the spherical Voronoi dual graph.
 *
 * For regular cells: returns exactly 6 edge-sharing hexagonal dual neighbors.
 * For the 12 icosahedral singularities: returns exactly 5 pentagonal dual neighbors.
 * Every reported neighbor shares a complete dual edge with the origin cell.
 */
export declare function getHexNeighbors(id: TriHexId): TriHexId[];
/**
 * Returns the exact spherical Voronoi boundary coordinates of the dual cell
 * (6 vertices for regular hexagons, 5 vertices for pentagonal singularities).
 */
export declare function getHexDualBoundary(id: TriHexId): GeoCoord[];
/**
 * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
 * For regular hexagonal regions:
 *  - radius 0: [origin] (1 cell)
 *  - radius 1: 7 cells (1 center + 6 neighbors)
 *  - radius 2: 19 cells (matching the hexagonal formula 1 + 3k(k+1) = 19)
 */
export declare function hexRing(originId: TriHexId, radius: number): TriHexId[];
/**
 * Canonical alias for getHexNeighbors: returns exact neighbors in the spherical Voronoi dual lattice.
 * Degree 6 for regular hexagons, degree 5 for the 12 pentagonal Euler singularities.
 */
export declare const getDualNeighbors: typeof getHexNeighbors;
/**
 * Canonical alias for hexRing: expands a BFS disk on the spherical Voronoi dual graph up to radius k.
 * For regular hexagonal regions: radius 0 = 1, radius 1 = 7, radius 2 = 19 (exact 1 + 3k(k+1) formula).
 */
export declare const getDualDisk: typeof hexRing;
/**
 * Canonical alias for getHexDualBoundary: returns the perimeter coordinates of the spherical Voronoi dual cell.
 * (6 vertices for regular hexagons, 5 vertices for pentagonal Euler singularities).
 */
export declare const getDualBoundary: typeof getHexDualBoundary;
