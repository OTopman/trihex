import { GeoCoord, TriHexId } from './types';
/**
 * Approximate circumradius (in meters) of a micro-triangle at a given resolution (0 to 15)
 */
export declare function getResolutionCellRadius(resolution: number): number;
/**
 * Rasterizes a polyline (sequence of waypoints) into an ordered sequence of contiguous TriHex cells.
 * Uses supercover step interpolation to ensure continuous cell connectivity with zero gaps.
 */
export declare function lineStringToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
/**
 * Fills an arbitrary geographic polygon (geofence, administrative boundary)
 * with all enclosing TriHex cells at the specified resolution using scanline filling.
 *
 * Supports antimeridian crossings (+/- 180 deg) and includes iteration guards to
 * prevent event-loop starvation on un-chunked continental polygons.
 */
export declare function polygonToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
