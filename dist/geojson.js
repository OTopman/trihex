"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cellToGeoJSON = cellToGeoJSON;
exports.hexDualToGeoJSON = hexDualToGeoJSON;
exports.cellsToGeoJSON = cellsToGeoJSON;
const hex_dual_1 = require("./hex-dual");
const serialization_1 = require("./serialization");
const triangle_quadtree_1 = require("./triangle-quadtree");
/**
 * Converts a triangular TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 * Coordinates are formatted as [longitude, latitude] in closed rings.
 */
function cellToGeoJSON(id) {
    const boundary = (0, triangle_quadtree_1.cellToBoundary)(id);
    const unpacked = (0, triangle_quadtree_1.unpackTriHexId)(id);
    const idStr = (0, serialization_1.cellToString)(id);
    // GeoJSON requires [lng, lat] coordinate order and closed ring (first vertex repeated at the end)
    const ring = boundary.map((c) => [c.lng, c.lat]);
    ring.push([boundary[0].lng, boundary[0].lat]);
    return {
        type: 'Feature',
        id: idStr,
        geometry: {
            type: 'Polygon',
            coordinates: [ring],
        },
        properties: {
            id: idStr,
            face: unpacked.face,
            resolution: unpacked.resolution,
            morton: unpacked.morton.toString(16),
            dualSector: 0,
            topoCluster: 0,
            representation: 'triangle',
        },
    };
}
/**
 * Converts the hexagonal Voronoi dual of a TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 */
function hexDualToGeoJSON(id) {
    const boundary = (0, hex_dual_1.getHexDualBoundary)(id);
    const unpacked = (0, triangle_quadtree_1.unpackTriHexId)(id);
    const idStr = (0, serialization_1.cellToString)(id);
    // GeoJSON closed ring
    const ring = boundary.map((c) => [c.lng, c.lat]);
    if (boundary.length > 0) {
        ring.push([boundary[0].lng, boundary[0].lat]);
    }
    return {
        type: 'Feature',
        id: idStr,
        geometry: {
            type: 'Polygon',
            coordinates: [ring],
        },
        properties: {
            id: idStr,
            face: unpacked.face,
            resolution: unpacked.resolution,
            morton: unpacked.morton.toString(16),
            dualSector: 0,
            topoCluster: 0,
            representation: 'hexDual',
        },
    };
}
/**
 * Bundles multiple TriHex cells into a unified GeoJSON FeatureCollection
 * suitable for immediate rendering in Mapbox GL, Leaflet, or Kepler.gl.
 */
function cellsToGeoJSON(ids, mode = 'triangle') {
    const features = ids.map((id) => mode === 'hexDual' ? hexDualToGeoJSON(id) : cellToGeoJSON(id));
    return {
        type: 'FeatureCollection',
        features,
    };
}
