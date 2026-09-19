import { GeoCoord, TriHexId } from './types';
export interface RasterizePolygonOptions {
    mode?: 'intersects' | 'covers' | 'contains';
    topoCluster?: number;
    maxCells?: number;
}
/**
 * Approximate circumradius (in meters) of a micro-triangle at a given resolution (0 to 15)
 */
export declare function getResolutionCellRadius(resolution: number): number;
/**
 * Rasterizes a polyline route into an ordered sequence of contiguous TriHex cells.
 * Uses great-circle spherical arc interpolation (Slerp) ensuring zero-gap topological continuity.
 */
export declare function lineStringToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
/**
 * Fills an arbitrary geographic polygon (with optional holes) with enclosing TriHex cells.
 *
 * Supports:
 *  - Simple polygons (GeoCoord[])
 *  - Polygons with holes (GeoCoord[][]: [outerRing, hole1, hole2, ...])
 *  - Antimeridian crossings (+/- 180 deg)
 *  - Semantics: 'intersects' | 'covers' | 'contains'
 *  - Strict DoS guards preventing event-loop starvation
 */
export declare function polygonToCells(polygonInput: GeoCoord[] | GeoCoord[][], resolution: number, options?: RasterizePolygonOptions | number): TriHexId[];
/**
 * Accelerated hierarchical quadtree polyfill for arbitrary polygons.
 *
 * Traverses the icosahedral quadtree down to the target resolution, ensuring 100% geometric
 * fidelity, boundary conformance, and deduplicated cell coverage.
 */
export declare function polygonToCellsHierarchical(polygonInput: GeoCoord[] | GeoCoord[][], resolution: number, options?: RasterizePolygonOptions | number): TriHexId[];
/**
 * Directly rasterizes an arbitrary polygon into a maximally compacted set of mixed-resolution cells.
 * Merges 4-sibling clusters bottom-up into parent cells to minimize memory footprint.
 */
export declare function polygonToCompactedCells(polygonInput: GeoCoord[] | GeoCoord[][], resolution: number, options?: RasterizePolygonOptions | number): TriHexId[];
