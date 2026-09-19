"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDirectedEdge = isDirectedEdge;
exports.validateDirectedEdge = validateDirectedEdge;
exports.getDirectedEdge = getDirectedEdge;
exports.getDirectedEdgeOrigin = getDirectedEdgeOrigin;
exports.getDirectedEdgeDestination = getDirectedEdgeDestination;
exports.getDirectedEdgeBoundary = getDirectedEdgeBoundary;
exports.getDirectedEdgeDetails = getDirectedEdgeDetails;
const adjacency_1 = require("./adjacency");
const hex_dual_1 = require("./hex-dual");
const triangle_quadtree_1 = require("./triangle-quadtree");
const types_1 = require("./types");
const validation_1 = require("./validation");
/**
 * Returns true if the given value is a valid 63-bit directed edge ID.
 */
function isDirectedEdge(id) {
    if (typeof id !== 'bigint')
        return false;
    if (id < 0n || id > types_1.BIT_LAYOUT.MAX_SIGNED_INT64)
        return false;
    if ((id & types_1.EDGE_BIT_LAYOUT.EDGE_FLAG_MASK) === 0n)
        return false;
    try {
        validateDirectedEdge(id);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validates whether an ID is a structurally sound TriHex directed edge.
 */
function validateDirectedEdge(edgeId) {
    if (typeof edgeId !== 'bigint') {
        throw new TypeError(`Expected BigInt for TriHexEdgeId, received ${typeof edgeId}`);
    }
    if (edgeId < 0n || edgeId > types_1.BIT_LAYOUT.MAX_SIGNED_INT64) {
        throw new RangeError(`TriHexEdgeId 0x${edgeId.toString(16)} is out of signed 63-bit range [0, 0x7fffffffffffffff]`);
    }
    if ((edgeId & types_1.EDGE_BIT_LAYOUT.EDGE_FLAG_MASK) === 0n) {
        throw new RangeError(`TriHexEdgeId 0x${edgeId.toString(16)} is missing directed edge flag (bit 52 must be 1)`);
    }
    // Extract and validate underlying origin cell
    const origin = edgeId & types_1.EDGE_BIT_LAYOUT.ORIGIN_MASK;
    (0, validation_1.validateCellId)(origin);
    const edgeIndex = Number((edgeId >> types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT) & 0x7n);
    const isDual = ((origin >> 53n) & 1n) === 1n;
    if (!isDual) {
        if (edgeIndex < 0 || edgeIndex > 2) {
            throw new RangeError(`Primal directed edge 0x${edgeId.toString(16)} has invalid edgeIndex ${edgeIndex} (must be 0..2)`);
        }
    }
    else {
        const dual = (0, hex_dual_1.getHexDual)(origin);
        if (edgeIndex < 0 || edgeIndex >= dual.neighbors.length) {
            throw new RangeError(`Dual directed edge 0x${edgeId.toString(16)} has invalid edgeIndex ${edgeIndex} (must be 0..${dual.neighbors.length - 1} for ${dual.isPentagon ? 'pentagon' : 'hexagon'})`);
        }
    }
}
/**
 * Constructs a canonical 63-bit Directed Edge ID representing oriented flow from origin to adjacent destination.
 */
function getDirectedEdge(origin, destination) {
    (0, validation_1.validateCellId)(origin);
    (0, validation_1.validateCellId)(destination);
    const originDual = (0, hex_dual_1.isDualCellId)(origin);
    const destDual = (0, hex_dual_1.isDualCellId)(destination);
    if (originDual !== destDual) {
        throw new TypeError(`Cannot construct directed edge between heterogeneous cell types (origin is ${originDual ? 'dual' : 'primal'}, destination is ${destDual ? 'dual' : 'primal'})`);
    }
    if (!originDual) {
        const neighbors = (0, adjacency_1.getCellNeighbors)(origin);
        const index = neighbors.findIndex((n) => n === destination);
        if (index === -1) {
            throw new RangeError(`Cells 0x${origin.toString(16)} and 0x${destination.toString(16)} are not adjacent: destination is not an edge neighbor of origin`);
        }
        return origin | types_1.EDGE_BIT_LAYOUT.EDGE_FLAG_MASK | (BigInt(index) << types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT);
    }
    else {
        const dual = (0, hex_dual_1.getHexDual)(origin);
        const index = dual.neighbors.findIndex((n) => n === destination);
        if (index === -1) {
            throw new RangeError(`Dual cells 0x${origin.toString(16)} and 0x${destination.toString(16)} are not adjacent: destination is not a Voronoi neighbor of origin`);
        }
        return origin | types_1.EDGE_BIT_LAYOUT.EDGE_FLAG_MASK | (BigInt(index) << types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT);
    }
}
/**
 * Recovers the origin cell ID of a directed edge.
 */
function getDirectedEdgeOrigin(edgeId) {
    validateDirectedEdge(edgeId);
    return edgeId & types_1.EDGE_BIT_LAYOUT.ORIGIN_MASK;
}
/**
 * Computes the destination cell ID of a directed edge.
 */
function getDirectedEdgeDestination(edgeId) {
    validateDirectedEdge(edgeId);
    const origin = edgeId & types_1.EDGE_BIT_LAYOUT.ORIGIN_MASK;
    const edgeIndex = Number((edgeId >> types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT) & 0x7n);
    const isDual = ((origin >> 53n) & 1n) === 1n;
    if (!isDual) {
        const neighbors = (0, adjacency_1.getCellNeighbors)(origin);
        return neighbors[edgeIndex];
    }
    else {
        const dual = (0, hex_dual_1.getHexDual)(origin);
        return dual.neighbors[edgeIndex];
    }
}
/**
 * Returns the two spherical geographic coordinates that form the shared boundary segment of the directed edge.
 */
function getDirectedEdgeBoundary(edgeId) {
    validateDirectedEdge(edgeId);
    const origin = edgeId & types_1.EDGE_BIT_LAYOUT.ORIGIN_MASK;
    const edgeIndex = Number((edgeId >> types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT) & 0x7n);
    const isDual = ((origin >> 53n) & 1n) === 1n;
    if (!isDual) {
        const [a, b, c] = (0, triangle_quadtree_1.cellToBoundary)(origin);
        if (edgeIndex === 0)
            return [a, b];
        if (edgeIndex === 1)
            return [b, c];
        return [c, a];
    }
    else {
        const dest = getDirectedEdgeDestination(edgeId);
        const originDual = (0, hex_dual_1.getHexDual)(origin);
        const destDual = (0, hex_dual_1.getHexDual)(dest);
        // Shared edge consists of the 2 spherical circumcenters shared between origin and dest
        const shared = [];
        for (const p1 of originDual.boundary) {
            for (const p2 of destDual.boundary) {
                const dLat = Math.abs(p1.lat - p2.lat);
                const dLng = Math.abs(p1.lng - p2.lng);
                if (dLat < 1e-5 && (dLng < 1e-5 || Math.abs(dLng - 360) < 1e-5)) {
                    if (!shared.some((s) => Math.abs(s.lat - p1.lat) < 1e-5 && Math.abs(s.lng - p1.lng) < 1e-5)) {
                        shared.push(p1);
                    }
                }
            }
        }
        if (shared.length >= 2) {
            return [shared[0], shared[1]];
        }
        // Fallback: return first 2 vertices of origin boundary if degraded
        return [originDual.boundary[0], originDual.boundary[1]];
    }
}
/**
 * Returns full metadata and boundary information for a directed edge.
 */
function getDirectedEdgeDetails(edgeId) {
    validateDirectedEdge(edgeId);
    const origin = getDirectedEdgeOrigin(edgeId);
    const destination = getDirectedEdgeDestination(edgeId);
    const edgeIndex = Number((edgeId >> types_1.EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT) & 0x7n);
    const isDual = ((origin >> 53n) & 1n) === 1n;
    const boundary = getDirectedEdgeBoundary(edgeId);
    return {
        edgeId,
        origin,
        destination,
        edgeIndex,
        isDual,
        boundary,
    };
}
