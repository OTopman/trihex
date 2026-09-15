"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geodesicDistance = exports.defaultTopologyRegistry = exports.TopologyPartitionRegistry = void 0;
exports.getTopologyCluster = getTopologyCluster;
exports.setTopologyCluster = setTopologyCluster;
exports.withTopologyCluster = withTopologyCluster;
exports.isSameCluster = isSameCluster;
exports.effectiveDistance = effectiveDistance;
const icosahedron_1 = require("./icosahedron");
const triangle_quadtree_1 = require("./triangle-quadtree");
/**
 * External registry for Road Network Topology Partition Clusters.
 *
 * Decouples mutable physical/topological road network barriers (e.g. rivers,
 * toll zones, peninsulas, highway clusters) from immutable spatial TriHex IDs.
 * This guarantees that spatial IDs remain 100% unique, immutable, and canonically
 * consistent across database migrations and road topology reconfigurations.
 */
class TopologyPartitionRegistry {
    partitions = new Map();
    setCluster(id, clusterId) {
        if (!Number.isInteger(clusterId) || clusterId < 0 || clusterId > 4095) {
            throw new RangeError(`Topology cluster ID ${clusterId} is invalid. Must be an integer between 0 and 4095`);
        }
        this.partitions.set(id.toString(), clusterId);
    }
    getCluster(id) {
        return this.partitions.get(id.toString()) ?? 0;
    }
    isSamePartition(idA, idB) {
        return this.getCluster(idA) === this.getCluster(idB);
    }
    clear() {
        this.partitions.clear();
    }
    get size() {
        return this.partitions.size;
    }
}
exports.TopologyPartitionRegistry = TopologyPartitionRegistry;
exports.defaultTopologyRegistry = new TopologyPartitionRegistry();
/**
 * Extracts the 12-bit topology cluster ID from the registry (defaults to 0 if unregistered).
 */
function getTopologyCluster(id, registry = exports.defaultTopologyRegistry) {
    return registry.getCluster(id);
}
/**
 * Sets a 12-bit topology cluster ID for a cell in the partition registry.
 */
function setTopologyCluster(id, clusterId, registry = exports.defaultTopologyRegistry) {
    registry.setCluster(id, clusterId);
}
/**
 * Registers a topology cluster ID for the cell and returns the immutable TriHexId.
 * Preserves backward compatibility while maintaining immutable spatial IDs.
 */
function withTopologyCluster(id, clusterId, registry = exports.defaultTopologyRegistry) {
    registry.setCluster(id, clusterId);
    return id;
}
/**
 * Checks if two cells are within the same physical road network partition cluster.
 */
function isSameCluster(idA, idB, registry = exports.defaultTopologyRegistry) {
    return registry.isSamePartition(idA, idB);
}
var icosahedron_2 = require("./icosahedron");
Object.defineProperty(exports, "geodesicDistance", { enumerable: true, get: function () { return icosahedron_2.geodesicDistance; } });
/**
 * Computes the topology-aware effective distance between two cells.
 * Incorporates geographic geodesic distance plus network cross-barrier penalties
 * or precalculated cell-to-cell cost matrix values.
 *
 * EffectiveDistance = alpha * GeoDistance + beta * NetworkCost
 */
function effectiveDistance(idA, idB, params = {}, costMatrix, registry = exports.defaultTopologyRegistry) {
    const alpha = params.alpha ?? 1.0;
    const beta = params.beta ?? 1.0;
    const coordA = (0, triangle_quadtree_1.cellToLatLng)(idA);
    const coordB = (0, triangle_quadtree_1.cellToLatLng)(idB);
    const geoDist = (0, icosahedron_1.geodesicDistance)(coordA, coordB);
    // If a precalculated network cost matrix entry exists, use it
    if (costMatrix) {
        const pairKey = `${idA.toString()}:${idB.toString()}`;
        const reverseKey = `${idB.toString()}:${idA.toString()}`;
        const cost = costMatrix.get(pairKey) ?? costMatrix.get(reverseKey);
        if (cost !== undefined) {
            return alpha * geoDist + beta * cost;
        }
    }
    // Fallback: Check if cells are separated across different topology clusters
    // (e.g., rivers, highway barriers). Apply cross-cluster detour penalty if different.
    const samePartition = isSameCluster(idA, idB, registry);
    const clusterPenalty = samePartition ? 0 : 3000; // 3km equivalent detour penalty for crossing barrier
    return alpha * geoDist + beta * clusterPenalty;
}
