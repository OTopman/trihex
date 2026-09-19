"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.latLngToCell = exports.TriHex = void 0;
const adjacency_1 = require("./adjacency");
const compaction_1 = require("./compaction");
const directed_edge_1 = require("./directed-edge");
const dispatch_1 = require("./dispatch");
const geojson_1 = require("./geojson");
const hex_dual_1 = require("./hex-dual");
const icosahedron_1 = require("./icosahedron");
const network_metric_1 = require("./network-metric");
const rasterization_1 = require("./rasterization");
const serialization_1 = require("./serialization");
const triangle_quadtree_1 = require("./triangle-quadtree");
const validation_1 = require("./validation");
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
class TriHex {
    /**
     * Convert geographic coordinates (latitude, longitude) to a 64-bit TriHexId
     * at the specified resolution (0 to 15).
     */
    static latLngToCell(lat, lng, resolution, topoCluster = 0) {
        (0, validation_1.validateCoordinates)(lat, lng);
        (0, validation_1.validateResolution)(resolution);
        if (!Number.isInteger(topoCluster) || topoCluster < 0 || topoCluster > 4095) {
            throw new RangeError(`Topology cluster ID ${topoCluster} is invalid. Must be an integer between 0 and 4095`);
        }
        const vec = (0, icosahedron_1.geoToVector3D)(lat, lng);
        const proj = (0, icosahedron_1.projectToFace)(vec);
        const { morton } = (0, triangle_quadtree_1.barycentricToMorton)(proj.u, proj.v, resolution);
        const cellId = (0, triangle_quadtree_1.packTriHexId)(proj.face, resolution, morton);
        if (topoCluster !== 0) {
            network_metric_1.defaultTopologyRegistry.setCluster(cellId, topoCluster);
        }
        return cellId;
    }
    /**
     * Returns the center geographic coordinates (lat, lng) of a triangular cell
     */
    static cellToLatLng(id) {
        return (0, triangle_quadtree_1.cellToLatLng)(id);
    }
    /**
     * Returns the 3 spherical boundary vertices of the triangular cell
     */
    static cellToBoundary(id) {
        return (0, triangle_quadtree_1.cellToBoundary)(id);
    }
    /**
     * Returns the parent cell at a coarser resolution using exact bit-shift
     */
    static cellToParent(id, targetResolution) {
        return (0, triangle_quadtree_1.cellToParent)(id, targetResolution);
    }
    /**
     * Returns all immediate child cells at targetResolution
     */
    static cellToChildren(id, targetResolution) {
        return (0, triangle_quadtree_1.cellToChildren)(id, targetResolution);
    }
    /**
     * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
     * at a finer targetResolution for instant B-Tree SQL index scans.
     */
    static cellToChildrenRange(id, targetResolution) {
        return (0, triangle_quadtree_1.cellToChildrenRange)(id, targetResolution);
    }
    /**
     * Returns the three cells sharing a complete edge with this triangular cell.
     * Guarantees 100% reciprocal symmetry and edge sharing across icosahedron seams.
     */
    static getCellNeighbors(id) {
        return (0, adjacency_1.getCellNeighbors)(id);
    }
    /**
     * Returns the triangular edge-adjacency graph disk within radius k.
     */
    static cellDisk(originId, radius) {
        return (0, adjacency_1.cellDisk)(originId, radius);
    }
    /**
     * Canonical alias for cellDisk: returns the triangular edge-adjacency graph disk within radius k.
     */
    static getCellDisk(originId, radius) {
        return (0, adjacency_1.getCellDisk)(originId, radius);
    }
    /**
     * Canonical alias for cellToBoundary: returns the 3 spherical boundary vertices of the triangular cell.
     */
    static getCellBoundary(id) {
        return (0, triangle_quadtree_1.getCellBoundary)(id);
    }
    /**
     * Constructs the genuine spherical Voronoi dual cell (HexDual) for this cell.
     * Returns 6 spherical circumcenter vertices for regular hexagons, and 5 for the 12 pentagonal singularities.
     */
    static getHexDual(id) {
        return (0, hex_dual_1.getHexDual)(id);
    }
    /**
     * Returns the exact neighbor cells in the spherical Voronoi dual graph.
     * Returns 6 neighbors for regular hexagons, and 5 for the 12 pentagonal singularities.
     */
    static getHexNeighbors(id) {
        return (0, hex_dual_1.getHexNeighbors)(id);
    }
    /**
     * Canonical alias for getHexNeighbors: returns exact neighbors in the spherical Voronoi dual lattice.
     * Degree 6 for regular hexagons, degree 5 for the 12 pentagonal Euler singularities.
     */
    static getDualNeighbors(id) {
        return (0, hex_dual_1.getDualNeighbors)(id);
    }
    /**
     * Returns the exact spherical Voronoi boundary coordinates of the dual cell
     * (6 vertices for regular hexagons, 5 vertices for pentagons).
     */
    static getHexDualBoundary(id) {
        return (0, hex_dual_1.getHexDualBoundary)(id);
    }
    /**
     * Canonical alias for getHexDualBoundary: returns the perimeter coordinates of the spherical Voronoi dual cell.
     * (6 vertices for regular hexagons, 5 vertices for pentagons).
     */
    static getDualBoundary(id) {
        return (0, hex_dual_1.getDualBoundary)(id);
    }
    /**
     * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
     * Produces 7 cells at radius 1, and 19 cells at radius 2 for regular hexagonal regions.
     */
    static hexRing(originId, radius) {
        return (0, hex_dual_1.hexRing)(originId, radius);
    }
    /**
     * Canonical alias for hexRing: expands a BFS disk on the spherical Voronoi dual graph up to radius k.
     */
    static getDualDisk(originId, radius) {
        return (0, hex_dual_1.getDualDisk)(originId, radius);
    }
    /**
     * Returns all canonical spherical Voronoi dual cells at the given resolution.
     * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
     */
    static getResolutionDualCells(resolution) {
        return (0, hex_dual_1.getResolutionDualCells)(resolution);
    }
    /**
     * Singleton road network topology partition registry
     */
    static topology = network_metric_1.defaultTopologyRegistry;
    /**
     * Compute topology-aware effective distance between two cells
     */
    static effectiveDistance(idA, idB, params, costMatrix, registry = network_metric_1.defaultTopologyRegistry) {
        return (0, network_metric_1.effectiveDistance)(idA, idB, params, costMatrix, registry);
    }
    /**
     * Calculate great-circle geodesic distance between two points in meters
     */
    static geodesicDistance(coordA, coordB) {
        return (0, icosahedron_1.geodesicDistance)(coordA, coordB);
    }
    /**
     * Extract the 12-bit topology cluster ID from the registry
     */
    static getTopologyCluster(id, registry = network_metric_1.defaultTopologyRegistry) {
        return (0, network_metric_1.getTopologyCluster)(id, registry);
    }
    /**
     * Sets a 12-bit topology cluster ID for a cell in the registry
     */
    static setTopologyCluster(id, clusterId, registry = network_metric_1.defaultTopologyRegistry) {
        (0, network_metric_1.setTopologyCluster)(id, clusterId, registry);
    }
    /**
     * Registers a topology cluster ID for the cell and returns the immutable TriHexId
     */
    static withTopologyCluster(id, clusterId, registry = network_metric_1.defaultTopologyRegistry) {
        return (0, network_metric_1.withTopologyCluster)(id, clusterId, registry);
    }
    /**
     * Check if two cells share the same road network partition cluster
     */
    static isSameCluster(idA, idB, registry = network_metric_1.defaultTopologyRegistry) {
        return (0, network_metric_1.isSameCluster)(idA, idB, registry);
    }
    /**
     * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string
     */
    static cellToString(id) {
        return (0, serialization_1.cellToString)(id);
    }
    /**
     * Parses a hexadecimal string into a 64-bit TriHexId with strict format validation
     */
    static stringToCell(str) {
        return (0, serialization_1.stringToCell)(str);
    }
    /**
     * Validates whether an input is a structurally sound 64-bit TriHexId
     */
    static isValidCell(input) {
        return (0, serialization_1.isValidCell)(input);
    }
    /**
     * JSON replacer function to safely serialize BigInt TriHexId values as hex strings
     */
    static bigIntReplacer(key, value) {
        return (0, serialization_1.bigIntReplacer)(key, value);
    }
    /**
     * Exports a triangular cell as an RFC 7946 GeoJSON Feature<Polygon>
     */
    static cellToGeoJSON(id) {
        return (0, geojson_1.cellToGeoJSON)(id);
    }
    /**
     * Exports the hexagonal Voronoi dual of a cell as an RFC 7946 GeoJSON Feature<Polygon>
     */
    static hexDualToGeoJSON(id) {
        return (0, geojson_1.hexDualToGeoJSON)(id);
    }
    /**
     * Bundles multiple TriHex cells into a standard GeoJSON FeatureCollection
     */
    static cellsToGeoJSON(ids, mode = 'triangle') {
        return (0, geojson_1.cellsToGeoJSON)(ids, mode);
    }
    /**
     * Rasterizes a polyline route into an ordered sequence of contiguous TriHex cells
     * using spherical great-circle interpolation (Slerp).
     */
    static lineStringToCells(coordinates, resolution, topoCluster = 0) {
        return (0, rasterization_1.lineStringToCells)(coordinates, resolution, topoCluster);
    }
    /**
     * Fills an arbitrary geographic polygon (with optional holes) with enclosing TriHex cells.
     */
    static polygonToCells(coordinates, resolution, options) {
        return (0, rasterization_1.polygonToCells)(coordinates, resolution, options);
    }
    /**
     * Accelerated hierarchical quadtree polyfill for arbitrary polygons
     */
    static polygonToCellsHierarchical(coordinates, resolution, options) {
        return (0, rasterization_1.polygonToCellsHierarchical)(coordinates, resolution, options);
    }
    /**
     * Directly rasterizes an arbitrary polygon into a maximally compacted set of mixed-resolution cells
     */
    static polygonToCompactedCells(coordinates, resolution, options) {
        return (0, rasterization_1.polygonToCompactedCells)(coordinates, resolution, options);
    }
    /**
     * Constructs a canonical 63-bit Directed Edge ID representing flow from origin to adjacent destination
     */
    static getDirectedEdge(origin, destination) {
        return (0, directed_edge_1.getDirectedEdge)(origin, destination);
    }
    /**
     * Returns the origin cell ID of a directed edge
     */
    static getDirectedEdgeOrigin(edgeId) {
        return (0, directed_edge_1.getDirectedEdgeOrigin)(edgeId);
    }
    /**
     * Returns the destination cell ID of a directed edge
     */
    static getDirectedEdgeDestination(edgeId) {
        return (0, directed_edge_1.getDirectedEdgeDestination)(edgeId);
    }
    /**
     * Returns the shared boundary segment between the origin and destination of a directed edge
     */
    static getDirectedEdgeBoundary(edgeId) {
        return (0, directed_edge_1.getDirectedEdgeBoundary)(edgeId);
    }
    /**
     * Returns true if the given value is a valid directed edge ID
     */
    static isDirectedEdge(id) {
        return (0, directed_edge_1.isDirectedEdge)(id);
    }
    /**
     * Returns the approximate circumradius in meters for cells at a given resolution
     */
    static getResolutionCellRadius(resolution) {
        return (0, rasterization_1.getResolutionCellRadius)(resolution);
    }
    /**
     * Compacts a set of cells by hierarchically merging 4-sibling clusters with deterministic sorting.
     */
    static compactCells(cells) {
        return (0, compaction_1.compactCells)(cells);
    }
    /**
     * Expands compacted cells down to a uniform target resolution.
     */
    static uncompactCells(cells, targetResolution) {
        return (0, compaction_1.uncompactCells)(cells, targetResolution);
    }
    /**
     * Unpack a 64-bit TriHexId into its individual components
     */
    static unpack(id) {
        return (0, triangle_quadtree_1.unpackTriHexId)(id);
    }
    /**
     * Pack component fields into a 64-bit TriHexId (strictly 63-bit non-negative)
     */
    static pack(face, resolution, morton, _dualSector = 0, topoCluster = 0) {
        const cellId = (0, triangle_quadtree_1.packTriHexId)(face, resolution, morton);
        if (topoCluster !== 0) {
            network_metric_1.defaultTopologyRegistry.setCluster(cellId, topoCluster);
        }
        return cellId;
    }
    /**
     * Creates an instance of the Multi-Tier Mobility Dispatch Engine
     */
    static createDispatchEngine(options) {
        return new dispatch_1.DispatchEngine(options);
    }
}
exports.TriHex = TriHex;
// Re-export all sub-modules and types
__exportStar(require("./adjacency"), exports);
__exportStar(require("./candidate-recall"), exports);
__exportStar(require("./compaction"), exports);
__exportStar(require("./constants"), exports);
__exportStar(require("./directed-edge"), exports);
__exportStar(require("./dispatch"), exports);
__exportStar(require("./geojson"), exports);
__exportStar(require("./hex-dual"), exports);
__exportStar(require("./icosahedron"), exports);
__exportStar(require("./network-metric"), exports);
__exportStar(require("./rasterization"), exports);
__exportStar(require("./routing"), exports);
__exportStar(require("./serialization"), exports);
__exportStar(require("./topology"), exports);
__exportStar(require("./triangle-quadtree"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./validation"), exports);
// Functional export alias
exports.latLngToCell = TriHex.latLngToCell;
exports.default = TriHex;
