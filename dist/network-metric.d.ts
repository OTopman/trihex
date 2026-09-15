import { EffectiveDistanceParams, TriHexId } from './types';
/**
 * External registry for Road Network Topology Partition Clusters.
 *
 * Decouples mutable physical/topological road network barriers (e.g. rivers,
 * toll zones, peninsulas, highway clusters) from immutable spatial TriHex IDs.
 * This guarantees that spatial IDs remain 100% unique, immutable, and canonically
 * consistent across database migrations and road topology reconfigurations.
 */
export declare class TopologyPartitionRegistry {
    private readonly partitions;
    setCluster(id: TriHexId, clusterId: number): void;
    getCluster(id: TriHexId): number;
    isSamePartition(idA: TriHexId, idB: TriHexId): boolean;
    clear(): void;
    get size(): number;
}
export declare const defaultTopologyRegistry: TopologyPartitionRegistry;
/**
 * Extracts the 12-bit topology cluster ID from the registry (defaults to 0 if unregistered).
 */
export declare function getTopologyCluster(id: TriHexId, registry?: TopologyPartitionRegistry): number;
/**
 * Sets a 12-bit topology cluster ID for a cell in the partition registry.
 */
export declare function setTopologyCluster(id: TriHexId, clusterId: number, registry?: TopologyPartitionRegistry): void;
/**
 * Registers a topology cluster ID for the cell and returns the immutable TriHexId.
 * Preserves backward compatibility while maintaining immutable spatial IDs.
 */
export declare function withTopologyCluster(id: TriHexId, clusterId: number, registry?: TopologyPartitionRegistry): TriHexId;
/**
 * Checks if two cells are within the same physical road network partition cluster.
 */
export declare function isSameCluster(idA: TriHexId, idB: TriHexId, registry?: TopologyPartitionRegistry): boolean;
export { geodesicDistance } from './icosahedron';
/**
 * Computes the topology-aware effective distance between two cells.
 * Incorporates geographic geodesic distance plus network cross-barrier penalties
 * or precalculated cell-to-cell cost matrix values.
 *
 * EffectiveDistance = alpha * GeoDistance + beta * NetworkCost
 */
export declare function effectiveDistance(idA: TriHexId, idB: TriHexId, params?: EffectiveDistanceParams, costMatrix?: Map<string, number>, registry?: TopologyPartitionRegistry): number;
