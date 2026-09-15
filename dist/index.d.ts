import { DispatchEngine, DispatchEngineOptions } from './dispatch';
import { CellFeatureProperties, GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONPolygonGeometry } from './geojson';
import { TopologyPartitionRegistry } from './network-metric';
import { RasterizePolygonOptions } from './rasterization';
import { CellRange, EffectiveDistanceParams, GeoCoord, HexDual, TriHexId } from './types';
/**
 * TriHex: Unified 64-bit Discrete Global Grid System & Mobility Spatial Engine
 *
 * Provides:
 *  1. Exact 1:4 hierarchical triangular quadtree on the spherical icosahedron.
 *  2. Genuine spherical Voronoi dual (hexagonal tiling with 12 pentagonal singularities).
 *  3. Exact 1D database B-Tree descendant range intervals (100% density, zero false positives).
 *  4. Storage & database independence: Zero runtime database dependencies.
 *  5. Clean separation of spatial indexing and mobility dispatch architecture.
 */
export declare class TriHex {
    /**
     * Convert geographic coordinates (latitude, longitude) to a 64-bit TriHexId
     * at the specified resolution (0 to 15).
     */
    static latLngToCell(lat: number, lng: number, resolution: number, topoCluster?: number): TriHexId;
    /**
     * Returns the center geographic coordinates (lat, lng) of a triangular cell
     */
    static cellToLatLng(id: TriHexId): GeoCoord;
    /**
     * Returns the 3 spherical boundary vertices of the triangular cell
     */
    static cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord];
    /**
     * Returns the parent cell at a coarser resolution using exact bit-shift
     */
    static cellToParent(id: TriHexId, targetResolution?: number): TriHexId;
    /**
     * Returns all immediate child cells at targetResolution
     */
    static cellToChildren(id: TriHexId, targetResolution?: number): TriHexId[];
    /**
     * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
     * at a finer targetResolution for instant B-Tree SQL index scans.
     */
    static cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange;
    /**
     * Returns the three cells sharing a complete edge with this triangular cell.
     * Guarantees 100% reciprocal symmetry and edge sharing across icosahedron seams.
     */
    static getCellNeighbors(id: TriHexId): [TriHexId, TriHexId, TriHexId];
    /**
     * Returns the triangular edge-adjacency graph disk within radius k.
     */
    static cellDisk(originId: TriHexId, radius: number): TriHexId[];
    /**
     * Constructs the genuine spherical Voronoi dual cell (HexDual) for this cell.
     * Returns 6 spherical circumcenter vertices for regular hexagons, and 5 for the 12 pentagonal singularities.
     */
    static getHexDual(id: TriHexId): HexDual;
    /**
     * Returns the exact neighbor cells in the spherical Voronoi dual graph.
     * Returns 6 neighbors for regular hexagons, and 5 for the 12 pentagonal singularities.
     */
    static getHexNeighbors(id: TriHexId): TriHexId[];
    /**
     * Returns the exact spherical Voronoi boundary coordinates of the dual cell
     * (6 vertices for regular hexagons, 5 vertices for pentagons).
     */
    static getHexDualBoundary(id: TriHexId): GeoCoord[];
    /**
     * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
     * Produces 7 cells at radius 1, and 19 cells at radius 2 for regular hexagonal regions.
     */
    static hexRing(originId: TriHexId, radius: number): TriHexId[];
    /**
     * Returns all canonical spherical Voronoi dual cells at the given resolution.
     * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
     */
    static getResolutionDualCells(resolution: number): TriHexId[];
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
    static isValidCell(input: unknown): input is TriHexId;
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
     * using spherical great-circle interpolation (Slerp).
     */
    static lineStringToCells(coordinates: GeoCoord[], resolution: number, topoCluster?: number): TriHexId[];
    /**
     * Fills an arbitrary geographic polygon (with optional holes) with enclosing TriHex cells.
     */
    static polygonToCells(coordinates: GeoCoord[] | GeoCoord[][], resolution: number, options?: RasterizePolygonOptions | number): TriHexId[];
    /**
     * Returns the approximate circumradius in meters for cells at a given resolution
     */
    static getResolutionCellRadius(resolution: number): number;
    /**
     * Compacts a set of cells by hierarchically merging 4-sibling clusters with deterministic sorting.
     */
    static compactCells(cells: TriHexId[]): TriHexId[];
    /**
     * Expands compacted cells down to a uniform target resolution.
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
     * Pack component fields into a 64-bit TriHexId (strictly 63-bit non-negative)
     */
    static pack(face: number, resolution: number, morton: bigint, _dualSector?: number, topoCluster?: number): TriHexId;
    /**
     * Creates an instance of the Multi-Tier Mobility Dispatch Engine
     */
    static createDispatchEngine(options?: DispatchEngineOptions): DispatchEngine;
}
export * from './adjacency';
export * from './candidate-recall';
export * from './compaction';
export * from './constants';
export * from './dispatch';
export * from './geojson';
export * from './hex-dual';
export * from './icosahedron';
export * from './network-metric';
export * from './rasterization';
export * from './routing';
export * from './serialization';
export * from './topology';
export * from './triangle-quadtree';
export * from './types';
export * from './validation';
export default TriHex;
