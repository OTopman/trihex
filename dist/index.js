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
exports.TriHex = void 0;
const compaction_1 = require("./compaction");
const dispatch_1 = require("./dispatch");
const geojson_1 = require("./geojson");
const hex_dual_1 = require("./hex-dual");
const icosahedron_1 = require("./icosahedron");
const network_metric_1 = require("./network-metric");
const rasterization_1 = require("./rasterization");
const serialization_1 = require("./serialization");
const triangle_quadtree_1 = require("./triangle-quadtree");
const types_1 = require("./types");
/**
 * TriHex: Unified Tri-Hex Metric Spatial Indexing Engine
 */
class TriHex {
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
    static latLngToCell(lat, lng, resolution, topoCluster = 0) {
        if (typeof lat !== 'number' ||
            typeof lng !== 'number' ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)) {
            throw new TypeError(`Coordinates must be finite numbers. Received lat=${lat}, lng=${lng}`);
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new RangeError(`Coordinates out of bounds: lat=${lat} (must be in [-90, 90]), lng=${lng} (must be in [-180, 180])`);
        }
        if (!Number.isInteger(resolution) || resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
            throw new RangeError(`Resolution ${resolution} is invalid. Must be an integer between 0 and ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
        }
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
     * Returns the center geographic coordinates (lat, lng) of a cell
     */
    static cellToLatLng(id) {
        if (typeof id !== 'bigint') {
            throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
        }
        if (!(0, serialization_1.isValidCell)(id)) {
            throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
        }
        return (0, triangle_quadtree_1.cellToLatLng)(id);
    }
    /**
     * Returns the 3 boundary vertices of the triangular cell
     */
    static cellToBoundary(id) {
        if (typeof id !== 'bigint') {
            throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
        }
        if (!(0, serialization_1.isValidCell)(id)) {
            throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
        }
        return (0, triangle_quadtree_1.cellToBoundary)(id);
    }
    /**
     * Returns the parent cell at a coarser resolution using exact bit-shift
     */
    static cellToParent(id, targetResolution) {
        if (typeof id !== 'bigint') {
            throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
        }
        if (!(0, serialization_1.isValidCell)(id)) {
            throw new RangeError(`Invalid TriHexId: 0x${id.toString(16)}`);
        }
        return (0, triangle_quadtree_1.cellToParent)(id, targetResolution);
    }
    /**
     * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
     * at a finer targetResolution for instant B-Tree SQL index scans.
     */
    static cellToChildrenRange(id, targetResolution) {
        return (0, triangle_quadtree_1.cellToChildrenRange)(id, targetResolution);
    }
    /**
     * Returns the 6 equidistant adjacent cells of the cell's hexagonal Voronoi dual
     */
    static getHexNeighbors(id) {
        return (0, hex_dual_1.getHexNeighbors)(id);
    }
    /**
     * Returns all cells within a hexagonal k-ring radius around the origin cell
     */
    static hexRing(originId, radius) {
        return (0, hex_dual_1.hexRing)(originId, radius);
    }
    /**
     * Returns the 6 boundary coordinates forming the hexagonal Voronoi dual
     */
    static getHexDualBoundary(id) {
        return (0, hex_dual_1.getHexDualBoundary)(id);
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
        return (0, network_metric_1.geodesicDistance)(coordA, coordB);
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
     */
    static lineStringToCells(coordinates, resolution, topoCluster = 0) {
        return (0, rasterization_1.lineStringToCells)(coordinates, resolution, topoCluster);
    }
    /**
     * Fills an arbitrary geographic polygon with all enclosing TriHex cells
     */
    static polygonToCells(coordinates, resolution, topoCluster = 0) {
        return (0, rasterization_1.polygonToCells)(coordinates, resolution, topoCluster);
    }
    /**
     * Returns the approximate circumradius in meters for cells at a given resolution
     */
    static getResolutionCellRadius(resolution) {
        return (0, rasterization_1.getResolutionCellRadius)(resolution);
    }
    /**
     * Compacts a set of cells by hierarchically merging 4-sibling clusters
     */
    static compactCells(cells) {
        return (0, compaction_1.compactCells)(cells);
    }
    /**
     * Expands compacted cells down to a uniform target resolution
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
     * Pack component fields into a 64-bit TriHexId (pure 63-bit non-negative)
     */
    static pack(face, resolution, morton, _dualSector = 0, topoCluster = 0) {
        const cellId = (0, triangle_quadtree_1.packTriHexId)(face, resolution, morton);
        if (topoCluster !== 0) {
            network_metric_1.defaultTopologyRegistry.setCluster(cellId, topoCluster);
        }
        return cellId;
    }
    /**
     * Creates an instance of the 2-Tier Mobility Dispatch Engine
     */
    static createDispatchEngine(options) {
        return new dispatch_1.DispatchEngine(options);
    }
}
exports.TriHex = TriHex;
// Re-export all sub-modules and types
__exportStar(require("./compaction"), exports);
__exportStar(require("./dispatch"), exports);
__exportStar(require("./geojson"), exports);
__exportStar(require("./hex-dual"), exports);
__exportStar(require("./icosahedron"), exports);
__exportStar(require("./network-metric"), exports);
__exportStar(require("./rasterization"), exports);
__exportStar(require("./serialization"), exports);
__exportStar(require("./triangle-quadtree"), exports);
__exportStar(require("./types"), exports);
exports.default = TriHex;
