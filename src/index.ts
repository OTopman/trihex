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
  cellDisk,
  getCellNeighbors,
  getHexDualBoundary,
  getHexNeighbors,
  hexRing,
} from './hex-dual';
import { geoToVector3D, projectToFace } from './icosahedron';
import {
  defaultTopologyRegistry,
  effectiveDistance,
  geodesicDistance,
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
  cellToChildrenRange,
  cellToLatLng,
  cellToParent,
  packTriHexId,
  unpackTriHexId,
} from './triangle-quadtree';
import {
  BIT_LAYOUT,
  CellRange,
  EffectiveDistanceParams,
  GeoCoord,
  TriHexId,
} from './types';

/**
 * TriHex: Unified Tri-Hex Metric Spatial Indexing Engine
 */
export class TriHex {
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
  public static latLngToCell(
    lat: number,
    lng: number,
    resolution: number,
    topoCluster = 0
  ): TriHexId {
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      throw new TypeError(
        `Coordinates must be finite numbers. Received lat=${lat}, lng=${lng}`
      );
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new RangeError(
        `Coordinates out of bounds: lat=${lat} (must be in [-90, 90]), lng=${lng} (must be in [-180, 180])`
      );
    }

    if (!Number.isInteger(resolution) || resolution < 0 || resolution > BIT_LAYOUT.MAX_RESOLUTION) {
      throw new RangeError(
        `Resolution ${resolution} is invalid. Must be an integer between 0 and ${BIT_LAYOUT.MAX_RESOLUTION}`
      );
    }

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
   * Returns the center geographic coordinates (lat, lng) of a cell
   */
  public static cellToLatLng(id: TriHexId): GeoCoord {
    if (typeof id !== 'bigint') {
      throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
    }
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return cellToLatLng(id);
  }

  /**
   * Returns the 3 boundary vertices of the triangular cell
   */
  public static cellToBoundary(id: TriHexId): [GeoCoord, GeoCoord, GeoCoord] {
    if (typeof id !== 'bigint') {
      throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
    }
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return cellToBoundary(id);
  }

  /**
   * Returns the parent cell at a coarser resolution using exact bit-shift
   */
  public static cellToParent(id: TriHexId, targetResolution?: number): TriHexId {
    if (typeof id !== 'bigint') {
      throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
    }
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return cellToParent(id, targetResolution);
  }

  /**
   * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
   * at a finer targetResolution for instant B-Tree SQL index scans.
   */
  public static cellToChildrenRange(id: TriHexId, targetResolution: number): CellRange {
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return cellToChildrenRange(id, targetResolution);
  }

  /** Returns the three cells sharing an edge with this triangular cell. */
  public static getCellNeighbors(id: TriHexId): TriHexId[] {
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return getCellNeighbors(id);
  }

  /**
   * @deprecated This compatibility alias returns triangular edge neighbours,
   * not six hexagonal Voronoi neighbours. Use getCellNeighbors.
   */
  public static getHexNeighbors(id: TriHexId): TriHexId[] {
    return getHexNeighbors(id);
  }

  /** Returns the triangular edge-adjacency graph disk within radius k. */
  public static cellDisk(originId: TriHexId, radius: number): TriHexId[] {
    if (!isValidCell(originId)) {
      throw new RangeError(`Invalid TriHexId: 0x${originId.toString(16)}`);
    }
    return cellDisk(originId, radius);
  }

  /** @deprecated This compatibility alias returns a triangular graph disk. */
  public static hexRing(originId: TriHexId, radius: number): TriHexId[] {
    return hexRing(originId, radius);
  }

  /** @deprecated Returns the actual triangular boundary; no hexagonal dual exists. */
  public static getHexDualBoundary(id: TriHexId): GeoCoord[] {
    return getHexDualBoundary(id);
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
  public static isValidCell(input: TriHexId | string): boolean {
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
   */
  public static lineStringToCells(
    coordinates: GeoCoord[],
    resolution: number,
    topoCluster = 0
  ): TriHexId[] {
    return lineStringToCells(coordinates, resolution, topoCluster);
  }

  /**
   * Fills an arbitrary geographic polygon with all enclosing TriHex cells
   */
  public static polygonToCells(
    coordinates: GeoCoord[],
    resolution: number,
    topoCluster = 0
  ): TriHexId[] {
    return polygonToCells(coordinates, resolution, topoCluster);
  }

  /**
   * Returns the approximate circumradius in meters for cells at a given resolution
   */
  public static getResolutionCellRadius(resolution: number): number {
    return getResolutionCellRadius(resolution);
  }

  /**
   * Compacts a set of cells by hierarchically merging 4-sibling clusters
   */
  public static compactCells(cells: TriHexId[]): TriHexId[] {
    return compactCells(cells);
  }

  /**
   * Expands compacted cells down to a uniform target resolution
   */
  public static uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[] {
    return uncompactCells(cells, targetResolution);
  }

  /**
   * Unpack a 64-bit TriHexId into its individual components
   */
  public static unpack(id: TriHexId) {
    if (!isValidCell(id)) {
      throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
    }
    return unpackTriHexId(id);
  }

  /**
   * Pack component fields into a 64-bit TriHexId (pure 63-bit non-negative)
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
   * Creates an instance of the 2-Tier Mobility Dispatch Engine
   */
  public static createDispatchEngine(options?: DispatchEngineOptions): DispatchEngine {
    return new DispatchEngine(options);
  }
}

// Re-export all sub-modules and types
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
