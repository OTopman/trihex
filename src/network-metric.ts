import { geodesicDistance } from './icosahedron';
import { cellToLatLng } from './triangle-quadtree';
import { EffectiveDistanceParams, TriHexId } from './types';

/**
 * External registry for Road Network Topology Partition Clusters.
 *
 * Decouples mutable physical/topological road network barriers (e.g. rivers,
 * toll zones, peninsulas, highway clusters) from immutable spatial TriHex IDs.
 * This guarantees that spatial IDs remain 100% unique, immutable, and canonically
 * consistent across database migrations and road topology reconfigurations.
 */
export class TopologyPartitionRegistry {
  private readonly partitions = new Map<string, number>();

  public setCluster(id: TriHexId, clusterId: number): void {
    if (!Number.isInteger(clusterId) || clusterId < 0 || clusterId > 4095) {
      throw new RangeError(
        `Topology cluster ID ${clusterId} is invalid. Must be an integer between 0 and 4095`
      );
    }
    this.partitions.set(id.toString(), clusterId);
  }

  public getCluster(id: TriHexId): number {
    return this.partitions.get(id.toString()) ?? 0;
  }

  public isSamePartition(idA: TriHexId, idB: TriHexId): boolean {
    return this.getCluster(idA) === this.getCluster(idB);
  }

  public clear(): void {
    this.partitions.clear();
  }

  public get size(): number {
    return this.partitions.size;
  }
}

export const defaultTopologyRegistry = new TopologyPartitionRegistry();

/**
 * Extracts the 12-bit topology cluster ID from the registry (defaults to 0 if unregistered).
 */
export function getTopologyCluster(
  id: TriHexId,
  registry: TopologyPartitionRegistry = defaultTopologyRegistry
): number {
  return registry.getCluster(id);
}

/**
 * Sets a 12-bit topology cluster ID for a cell in the partition registry.
 */
export function setTopologyCluster(
  id: TriHexId,
  clusterId: number,
  registry: TopologyPartitionRegistry = defaultTopologyRegistry
): void {
  registry.setCluster(id, clusterId);
}

/**
 * Registers a topology cluster ID for the cell and returns the immutable TriHexId.
 * Preserves backward compatibility while maintaining immutable spatial IDs.
 */
export function withTopologyCluster(
  id: TriHexId,
  clusterId: number,
  registry: TopologyPartitionRegistry = defaultTopologyRegistry
): TriHexId {
  registry.setCluster(id, clusterId);
  return id;
}

/**
 * Checks if two cells are within the same physical road network partition cluster.
 */
export function isSameCluster(
  idA: TriHexId,
  idB: TriHexId,
  registry: TopologyPartitionRegistry = defaultTopologyRegistry
): boolean {
  return registry.isSamePartition(idA, idB);
}

export { geodesicDistance } from './icosahedron';

/**
 * Computes the topology-aware effective distance between two cells.
 * Incorporates geographic geodesic distance plus network cross-barrier penalties
 * or precalculated cell-to-cell cost matrix values.
 *
 * EffectiveDistance = alpha * GeoDistance + beta * NetworkCost
 */
export function effectiveDistance(
  idA: TriHexId,
  idB: TriHexId,
  params: EffectiveDistanceParams = {},
  costMatrix?: Map<string, number>,
  registry: TopologyPartitionRegistry = defaultTopologyRegistry
): number {
  const alpha = params.alpha ?? 1.0;
  const beta = params.beta ?? 1.0;

  const coordA = cellToLatLng(idA);
  const coordB = cellToLatLng(idB);

  const geoDist = geodesicDistance(coordA, coordB);

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
  const penalty = params.barrierPenaltyMeters ?? 3000; // Default 3km equivalent detour penalty for crossing barrier
  const clusterPenalty = samePartition ? 0 : penalty;

  return alpha * geoDist + beta * clusterPenalty;
}
