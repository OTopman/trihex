import { GeoCoord, TriHexId } from './types';
/**
 * Returns the three cells that share a complete edge with a triangular cell.
 *
 * TriHex stores triangles. A triangle has three edge-adjacent triangles, not
 * six. The neighbour point is obtained by crossing each great-circle cell edge
 * on the sphere and then assigning that point normally. This also handles
 * icosahedron face seams without inventing non-adjacent links.
 */
export declare function getCellNeighbors(id: TriHexId): TriHexId[];
/**
 * @deprecated TriHex does not have a globally regular hexagonal dual. Use
 * getCellNeighbors(), which returns the three geometrically edge-adjacent
 * triangular cells.
 */
export declare const getHexNeighbors: typeof getCellNeighbors;
export declare const MAX_CELL_RING_RADIUS = 15;
/** @deprecated Use MAX_CELL_RING_RADIUS. */
export declare const MAX_HEX_RING_RADIUS = 15;
/** Returns the graph disk of triangular edge-adjacent cells within radius k. */
export declare function cellDisk(originId: TriHexId, radius: number): TriHexId[];
/** @deprecated This returns a triangular edge-adjacency disk, not a hex ring. */
export declare const hexRing: typeof cellDisk;
/**
 * There is no six-vertex hexagonal dual boundary for this triangular grid.
 * Return the actual triangular boundary so callers cannot render a fabricated
 * hexagon. The function remains only as a compatibility alias.
 */
export declare function getHexDualBoundary(id: TriHexId): GeoCoord[];
