import { CellRange, GeoCoord, TriHexId } from './types';
type Point2D = [number, number];
/**
 * Encodes face, resolution, and morton code into a 64-bit TriHexId (63-bit non-negative).
 * Optional dualSector and topoCluster are accepted for backward compatibility.
 */
export declare function packTriHexId(face: number, resolution: number, morton: bigint, _dualSector?: number, _topoCluster?: number): TriHexId;
/**
 * Decodes a 64-bit TriHexId into its component fields.
 * Returns face, resolution, and morton code.
 */
export declare function unpackTriHexId(id: TriHexId): {
    face: number;
    resolution: number;
    morton: bigint;
    dualSector: number;
    topoCluster: number;
};
/**
 * Given barycentric coordinates (u, v) on a face, computes the 1:4 triangular
 * Morton code at the specified resolution (0 to 15).
 */
export declare function barycentricToMorton(u: number, v: number, resolution: number): {
    morton: bigint;
    corners: [Point2D, Point2D, Point2D];
};
/**
 * Reconstruct the 3 corners in barycentric coordinates for a given morton code and resolution
 */
export declare function mortonToCorners(morton: bigint, resolution: number): [Point2D, Point2D, Point2D];
/**
 * Returns the parent TriHexId at a coarser resolution using exact bit-shift.
 */
export declare function cellToParent(id: TriHexId, targetResolution?: number): TriHexId;
/**
 * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
 * at a finer targetResolution for instant B-Tree SQL index scans.
 *
 * Guarantees dense interval: end - start + 1 == 4^(targetResolution - resolution)
 */
export declare function cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange;
/**
 * Returns the center geographic coordinates (lat, lng) of a TriHex cell
 */
export declare function cellToLatLng(id: TriHexId): GeoCoord;
/**
 * Returns the 3 boundary vertices of the triangular cell
 */
export declare function cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord];
export {};
