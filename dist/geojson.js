"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cellToGeoJSON = cellToGeoJSON;
exports.hexDualToGeoJSON = hexDualToGeoJSON;
exports.cellsToGeoJSON = cellsToGeoJSON;
const hex_dual_1 = require("./hex-dual");
const serialization_1 = require("./serialization");
const triangle_quadtree_1 = require("./triangle-quadtree");
const validation_1 = require("./validation");
/**
 * Converts a triangular TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 * Coordinates are formatted as [longitude, latitude] in closed rings.
 */
function cellToGeoJSON(id) {
    (0, validation_1.validateCellId)(id);
    const boundary = (0, triangle_quadtree_1.cellToBoundary)(id);
    const unpacked = (0, triangle_quadtree_1.unpackTriHexId)(id);
    const idStr = (0, serialization_1.cellToString)(id);
    // GeoJSON requires [lng, lat] coordinate order and closed ring
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
            representation: 'triangle',
        },
    };
}
/**
 * Converts the spherical Voronoi dual cell (hexagon or pentagon) into an RFC 7946 GeoJSON Feature<Polygon>.
 * The polygon boundary consists of the true spherical circumcenters (6 for hexagons, 5 for pentagons).
 */
function hexDualToGeoJSON(id) {
    (0, validation_1.validateCellId)(id);
    const dual = (0, hex_dual_1.getHexDual)(id);
    const unpacked = (0, triangle_quadtree_1.unpackTriHexId)(id);
    const idStr = (0, serialization_1.cellToString)(id);
    const ring = dual.boundary.map((c) => [c.lng, c.lat]);
    if (dual.boundary.length > 0) {
        ring.push([dual.boundary[0].lng, dual.boundary[0].lat]);
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
            representation: 'hexDual',
            degree: dual.degree,
            isPentagon: dual.isPentagon,
        },
    };
}
/**
 * Bundles multiple TriHex cells into a unified GeoJSON FeatureCollection
 * suitable for rendering in Mapbox GL, Leaflet, or Kepler.gl.
 */
function cellsToGeoJSON(ids, mode = 'triangle') {
    const features = ids.map((id) => mode === 'hexDual' ? hexDualToGeoJSON(id) : cellToGeoJSON(id));
    return {
        type: 'FeatureCollection',
        features,
    };
}
