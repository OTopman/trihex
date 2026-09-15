import { cellDisk, getCellDisk, getCellNeighbors } from './adjacency';
import { compactCells, uncompactCells } from './compaction';
import {
  DispatchEngine,
  DispatchEngineOptions,
} from './dispatch';
import {
  CellFeatureProperties,
  cellsToGeoJSON,
  cellToGeoJSON,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONPolygonGeometry,
  hexDualToGeoJSON,
} from './geojson';
import {
  getDualBoundary,
  getDualDisk,
  getDualNeighbors,
  getHexDual,
  getHexDualBoundary,
  getHexNeighbors,
  getResolutionDualCells,
  hexRing,
} from './hex-dual';
import {
  geodesicDistance,
  geoToVector3D,
  projectToFace,
} from './icosahedron';
import {
  defaultTopologyRegistry,
  effectiveDistance,
  getTopologyCluster,
  isSameCluster,
  setTopologyCluster,
  TopologyPartitionRegistry,
  withTopologyCluster,
} from './network-metric';
import {
  getResolutionCellRadius,
  lineStringToCells,
  polygonToCells,
  RasterizePolygonOptions,
} from './rasterization';
import {
  bigIntReplacer,
  cellToString,
  isValidCell,
  stringToCell,
} from './serialization';
import {
  barycentricToMorton,
  cellToBoundary,
  cellToChildren,
  cellToChildrenRange,
  cellToLatLng,
  cellToParent,
  getCellBoundary,
  packTriHexId,
  unpackTriHexId,
} from './triangle-quadtree';
import {
  CellRange,
  EffectiveDistanceParams,
  GeoCoord,
  HexDual,
  TriHexId
} from './types';
import {
  validateCoordinates,
  validateResolution
} from './validation';

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
export class TriHex {
  /**
   * Convert geographic coordinates (latitude, longitude) to a 64-bit TriHexId
   * at the specified resolution (0 to 15).
   */
  public static latLngToCell(
    lat: number,
    lng: number,
    resolution: number,
    topoCluster = 0
  ): TriHexId {
    validateCoordinates(lat, lng);
    validateResolution(resolution);

    if (!Number.isInteger(topoCluster) || topoCluster < 0 || topoCluster > 4095) {
      throw new RangeError(
        `Topology cluster ID ${topoCluster} is invalid. Must be an integer between 0 and 4095`
      );
    }

    const vec = geoToVector3D(lat, lng);
    const proj = projectToFace(vec);
    const { morton } = barycentricToMorton(proj.u, proj.v, resolution);
    const cellId = packTriHexId(proj.face, resolution, morton);

    if (topoCluster !== 0) {
      defaultTopologyRegistry.setCluster(cellId, topoCluster);
    }

    return cellId;
  }

  /**
   * Returns the center geographic coordinates (lat, lng) of a triangular cell
   */
  public static cellToLatLng(id: TriHexId): GeoCoord {
    return cellToLatLng(id);
  }

  /**
   * Returns the 3 spherical boundary vertices of the triangular cell
   */
  public static cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord] {
    return cellToBoundary(id);
  }

  /**
   * Returns the parent cell at a coarser resolution using exact bit-shift
   */
  public static cellToParent(id: TriHexId, targetResolution?: number): TriHexId {
    return cellToParent(id, targetResolution);
  }

  /**
   * Returns all immediate child cells at targetResolution
   */
  public static cellToChildren(id: TriHexId, targetResolution?: number): TriHexId[] {
    return cellToChildren(id, targetResolution);
  }

  /**
   * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
   * at a finer targetResolution for instant B-Tree SQL index scans.
   */
  public static cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange {
    return cellToChildrenRange(id, targetResolution);
  }

  /**
   * Returns the three cells sharing a complete edge with this triangular cell.
   * Guarantees 100% reciprocal symmetry and edge sharing across icosahedron seams.
   */
  public static getCellNeighbors(id: TriHexId): [TriHexId, TriHexId, TriHexId] {
    return getCellNeighbors(id);
  }

  /**
   * Returns the triangular edge-adjacency graph disk within radius k.
   */
  public static cellDisk(originId: TriHexId, radius: number): TriHexId[] {
    return cellDisk(originId, radius);
  }

  /**
   * Canonical alias for cellDisk: returns the triangular edge-adjacency graph disk within radius k.
   */
  public static getCellDisk(originId: TriHexId, radius: number): TriHexId[] {
    return getCellDisk(originId, radius);
  }

  /**
   * Canonical alias for cellToBoundary: returns the 3 spherical boundary vertices of the triangular cell.
   */
  public static getCellBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord] {
    return getCellBoundary(id);
  }

  /**
   * Constructs the genuine spherical Voronoi dual cell (HexDual) for this cell.
   * Returns 6 spherical circumcenter vertices for regular hexagons, and 5 for the 12 pentagonal singularities.
   */
  public static getHexDual(id: TriHexId): HexDual {
    return getHexDual(id);
  }

  /**
   * Returns the exact neighbor cells in the spherical Voronoi dual graph.
   * Returns 6 neighbors for regular hexagons, and 5 for the 12 pentagonal singularities.
   */
  public static getHexNeighbors(id: TriHexId): TriHexId[] {
    return getHexNeighbors(id);
  }

  /**
   * Canonical alias for getHexNeighbors: returns exact neighbors in the spherical Voronoi dual lattice.
   * Degree 6 for regular hexagons, degree 5 for the 12 pentagonal Euler singularities.
   */
  public static getDualNeighbors(id: TriHexId): TriHexId[] {
    return getDualNeighbors(id);
  }

  /**
   * Returns the exact spherical Voronoi boundary coordinates of the dual cell
   * (6 vertices for regular hexagons, 5 vertices for pentagons).
   */
  public static getHexDualBoundary(id: TriHexId): GeoCoord[] {
    return getHexDualBoundary(id);
  }

  /**
   * Canonical alias for getHexDualBoundary: returns the perimeter coordinates of the spherical Voronoi dual cell.
   * (6 vertices for regular hexagons, 5 vertices for pentagons).
   */
  public static getDualBoundary(id: TriHexId): GeoCoord[] {
    return getDualBoundary(id);
  }

  /**
   * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
   * Produces 7 cells at radius 1, and 19 cells at radius 2 for regular hexagonal regions.
   */
  public static hexRing(originId: TriHexId, radius: number): TriHexId[] {
    return hexRing(originId, radius);
  }

  /**
   * Canonical alias for hexRing: expands a BFS disk on the spherical Voronoi dual graph up to radius k.
   */
  public static getDualDisk(originId: TriHexId, radius: number): TriHexId[] {
    return getDualDisk(originId, radius);
  }

  /**
   * Returns all canonical spherical Voronoi dual cells at the given resolution.
   * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
   */
  public static getResolutionDualCells(resolution: number): TriHexId[] {
    return getResolutionDualCells(resolution);
  }

  /**
   * Singleton road network topology partition registry
   */
  public static readonly topology: TopologyPartitionRegistry = defaultTopologyRegistry;

  /**
   * Compute topology-aware effective distance between two cells
   */
  public static effectiveDistance(
    idA: TriHexId,
    idB: TriHexId,
    params?: EffectiveDistanceParams,
    costMatrix?: Map<string, number>,
    registry: TopologyPartitionRegistry = defaultTopologyRegistry
  ): number {
    return effectiveDistance(idA, idB, params, costMatrix, registry);
  }

  /**
   * Calculate great-circle geodesic distance between two points in meters
   */
  public static geodesicDistance(coordA: GeoCoord, coordB: GeoCoord): number {
    return geodesicDistance(coordA, coordB);
  }

  /**
   * Extract the 12-bit topology cluster ID from the registry
   */
  public static getTopologyCluster(
    id: TriHexId,
    registry: TopologyPartitionRegistry = defaultTopologyRegistry
  ): number {
    return getTopologyCluster(id, registry);
  }

  /**
   * Sets a 12-bit topology cluster ID for a cell in the registry
   */
  public static setTopologyCluster(
    id: TriHexId,
    clusterId: number,
    registry: TopologyPartitionRegistry = defaultTopologyRegistry
  ): void {
    setTopologyCluster(id, clusterId, registry);
  }

  /**
   * Registers a topology cluster ID for the cell and returns the immutable TriHexId
   */
  public static withTopologyCluster(
    id: TriHexId,
    clusterId: number,
    registry: TopologyPartitionRegistry = defaultTopologyRegistry
  ): TriHexId {
    return withTopologyCluster(id, clusterId, registry);
  }

  /**
   * Check if two cells share the same road network partition cluster
   */
  public static isSameCluster(
    idA: TriHexId,
    idB: TriHexId,
    registry: TopologyPartitionRegistry = defaultTopologyRegistry
  ): boolean {
    return isSameCluster(idA, idB, registry);
  }

  /**
   * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string
   */
  public static cellToString(id: TriHexId): string {
    return cellToString(id);
  }

  /**
   * Parses a hexadecimal string into a 64-bit TriHexId with strict format validation
   */
  public static stringToCell(str: string): TriHexId {
    return stringToCell(str);
  }

  /**
   * Validates whether an input is a structurally sound 64-bit TriHexId
   */
  public static isValidCell(input: unknown): input is TriHexId {
    return isValidCell(input);
  }

  /**
   * JSON replacer function to safely serialize BigInt TriHexId values as hex strings
   */
  public static bigIntReplacer(key: string, value: unknown): unknown {
    return bigIntReplacer(key, value);
  }

  /**
   * Exports a triangular cell as an RFC 7946 GeoJSON Feature<Polygon>
   */
  public static cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties> {
    return cellToGeoJSON(id);
  }

  /**
   * Exports the hexagonal Voronoi dual of a cell as an RFC 7946 GeoJSON Feature<Polygon>
   */
  public static hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties> {
    return hexDualToGeoJSON(id);
  }

  /**
   * Bundles multiple TriHex cells into a standard GeoJSON FeatureCollection
   */
  public static cellsToGeoJSON(
    ids: TriHexId[],
    mode: 'triangle' | 'hexDual' = 'triangle'
  ): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties> {
    return cellsToGeoJSON(ids, mode);
  }

  /**
   * Rasterizes a polyline route into an ordered sequence of contiguous TriHex cells
   * using spherical great-circle interpolation (Slerp).
   */
  public static lineStringToCells(
    coordinates: GeoCoord[],
    resolution: number,
    topoCluster = 0
  ): TriHexId[] {
    return lineStringToCells(coordinates, resolution, topoCluster);
  }

  /**
   * Fills an arbitrary geographic polygon (with optional holes) with enclosing TriHex cells.
   */
  public static polygonToCells(
    coordinates: GeoCoord[] | GeoCoord[][],
    resolution: number,
    options?: RasterizePolygonOptions | number
  ): TriHexId[] {
    return polygonToCells(coordinates, resolution, options);
  }

  /**
   * Returns the approximate circumradius in meters for cells at a given resolution
   */
  public static getResolutionCellRadius(resolution: number): number {
    return getResolutionCellRadius(resolution);
  }

  /**
   * Compacts a set of cells by hierarchically merging 4-sibling clusters with deterministic sorting.
   */
  public static compactCells(cells: TriHexId[]): TriHexId[] {
    return compactCells(cells);
  }

  /**
   * Expands compacted cells down to a uniform target resolution.
   */
  public static uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[] {
    return uncompactCells(cells, targetResolution);
  }

  /**
   * Unpack a 64-bit TriHexId into its individual components
   */
  public static unpack(id: TriHexId) {
    return unpackTriHexId(id);
  }

  /**
   * Pack component fields into a 64-bit TriHexId (strictly 63-bit non-negative)
   */
  public static pack(
    face: number,
    resolution: number,
    morton: bigint,
    _dualSector = 0,
    topoCluster = 0
  ): TriHexId {
    const cellId = packTriHexId(face, resolution, morton);
    if (topoCluster !== 0) {
      defaultTopologyRegistry.setCluster(cellId, topoCluster);
    }
    return cellId;
  }

  /**
   * Creates an instance of the Multi-Tier Mobility Dispatch Engine
   */
  public static createDispatchEngine(options?: DispatchEngineOptions): DispatchEngine {
    return new DispatchEngine(options);
  }
}

// Re-export all sub-modules and types
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
