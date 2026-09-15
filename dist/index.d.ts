import { DispatchEngine, DispatchEngineOptions } from './dispatch';
import { CellFeatureProperties, GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONPolygonGeometry } from './geojson';
import { TopologyPartitionRegistry } from './network-metric';
import { CellRange, EffectiveDistanceParams, GeoCoord, TriHexId } from './types';
/**
 * TriHex: Unified Tri-Hex Metric Spatial Indexing Engine
 */
export declare class TriHex {
    /**
     * Convert geographic coordinates (latitude, longitude) to a 64-bit TriHexId
     * at the specified resolution (0 to 15).
     *
     * Validates:
     *  - lat/lng must be finite numbers
     *  - lat in [-90, 90], lng in [-180, 180]
     *  - resolution in [0, 15]
     *  - topoCluster in [0, 4095]
     */
    static latLngToCell(lat: number, lng: number, resolution: number, topoCluster?: number): TriHexId;
    /**
     * Returns the center geographic coordinates (lat, lng) of a cell
     */
    static cellToLatLng(id: TriHexId): GeoCoord;
    /**
     * Returns the 3 boundary vertices of the triangular cell
     */
    static cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord];
    /**
     * Returns the parent cell at a coarser resolution using exact bit-shift
     */
    static cellToParent(id: TriHexId, targetResolution?: number): TriHexId;
    /**
     * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
     * at a finer targetResolution for instant B-Tree SQL index scans.
     */
    static cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange;
    /**
     * Returns the 6 equidistant adjacent cells of the cell's hexagonal Voronoi dual
     */
    static getHexNeighbors(id: TriHexId): TriHexId[];
    /**
     * Returns all cells within a hexagonal k-ring radius around the origin cell
     */
    static hexRing(originId: TriHexId, radius: number): TriHexId[];
    /**
     * Returns the 6 boundary coordinates forming the hexagonal Voronoi dual
     */
    static getHexDualBoundary(id: TriHexId): GeoCoord[];
    /**
     * Singleton road network topology partition registry
     */
    static readonly topology: TopologyPartitionRegistry;
    /**
     * Compute topology-aware effective distance between two cells
     */
    static effectiveDistance(idA: TriHexId, idB: TriHexId, params?: EffectiveDistanceParams, costMatrix?: Map<string, number>, registry?: TopologyPartitionRegistry): number;
    /**
     * Calculate great-circle geodesic distance between two points in meters
     */
    static geodesicDistance(coordA: GeoCoord, coordB: GeoCoord): number;
    /**
     * Extract the 12-bit topology cluster ID from the registry
     */
    static getTopologyCluster(id: TriHexId, registry?: TopologyPartitionRegistry): number;
    /**
     * Sets a 12-bit topology cluster ID for a cell in the registry
     */
    static setTopologyCluster(id: TriHexId, clusterId: number, registry?: TopologyPartitionRegistry): void;
    /**
     * Registers a topology cluster ID for the cell and returns the immutable TriHexId
     */
    static withTopologyCluster(id: TriHexId, clusterId: number, registry?: TopologyPartitionRegistry): TriHexId;
    /**
     * Check if two cells share the same road network partition cluster
     */
    static isSameCluster(idA: TriHexId, idB: TriHexId, registry?: TopologyPartitionRegistry): boolean;
    /**
     * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string
     */
    static cellToString(id: TriHexId): string;
    /**
     * Parses a hexadecimal string into a 64-bit TriHexId with strict format validation
     */
    static stringToCell(str: string): TriHexId;
    /**
     * Validates whether an input is a structurally sound 64-bit TriHexId
     */
    static isValidCell(input: TriHexId | string): boolean;
    /**
     * JSON replacer function to safely serialize BigInt TriHexId values as hex strings
     */
    static bigIntReplacer(key: string, value: unknown): unknown;
    /**
     * Exports a triangular cell as an RFC 7946 GeoJSON Feature<Polygon>
     */
    static cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
    /**
     * Exports the hexagonal Voronoi dual of a cell as an RFC 7946 GeoJSON Feature<Polygon>
     */
    static hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
    /**
     * Bundles multiple TriHex cells into a standard GeoJSON FeatureCollection
     */
    static cellsToGeoJSON(ids: TriHexId[], mode?: 'triangle' | 'hexDual'): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties>;
    /**
     * Rasterizes a polyline route into an ordered sequence of contiguous TriHex cells
     */
    static lineStringToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
    /**
     * Fills an arbitrary geographic polygon with all enclosing TriHex cells
     */
    static polygonToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
    /**
     * Returns the approximate circumradius in meters for cells at a given resolution
     */
    static getResolutionCellRadius(resolution: number): number;
    /**
     * Compacts a set of cells by hierarchically merging 4-sibling clusters
     */
    static compactCells(cells: TriHexId[]): TriHexId[];
    /**
     * Expands compacted cells down to a uniform target resolution
     */
    static uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[];
    /**
     * Unpack a 64-bit TriHexId into its individual components
     */
    static unpack(id: TriHexId): {
        face: number;
        resolution: number;
        morton: bigint;
        dualSector: number;
        topoCluster: number;
    };
    /**
     * Pack component fields into a 64-bit TriHexId (pure 63-bit non-negative)
     */
    static pack(face: number, resolution: number, morton: bigint, _dualSector?: number, topoCluster?: number): TriHexId;
    /**
     * Creates an instance of the 2-Tier Mobility Dispatch Engine
     */
    static createDispatchEngine(options?: DispatchEngineOptions): DispatchEngine;
}
export * from './compaction';
export * from './dispatch';
export * from './geojson';
export * from './hex-dual';
export * from './icosahedron';
export * from './network-metric';
export * from './rasterization';
export * from './serialization';
export * from './triangle-quadtree';
export * from './types';
export default TriHex;
