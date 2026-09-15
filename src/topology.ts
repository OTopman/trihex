import { geodesicDistance } from './icosahedron';
import { GeoCoord } from './types';

export interface RoadPosition {
  readonly roadId: string;
  readonly coordinate: GeoCoord;
  readonly heading?: number;
}

export interface Reachability {
  readonly reachable: boolean;
  readonly reason?: string;
}

export interface RouteCost {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly roadVersion: string;
}

/**
 * Production-quality Road Network Topology Abstraction.
 *
 * Decouples mutable physical road topology (closures, bridges, turn restrictions,
 * one-way networks) from immutable spatial TriHex IDs.
 *
 * Road network reachability and cost can change dynamically as roads close or traffic
 * patterns shift, while spatial identifiers remain permanent and stable.
 */
export interface RoadTopology {
  readonly version: string;
  locate(point: GeoCoord): RoadPosition;
  reachable(from: RoadPosition, to: RoadPosition): Reachability;
  estimateCost(from: RoadPosition, to: RoadPosition): RouteCost;
}

export interface DirectedEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly distanceMeters: number;
  readonly freeFlowSpeedMps: number;
  readonly isClosed: boolean;
}

/**
 * In-memory versioned road network topology graph for production simulation and testing.
 * Supports dynamic closures, reopening, and graph version incrementing.
 */
export class VersionedRoadGraph implements RoadTopology {
  private _version: string;
  private readonly nodes = new Map<string, GeoCoord>();
  private readonly edges = new Map<string, DirectedEdge>();
  private readonly adjacency = new Map<string, DirectedEdge[]>();

  constructor(initialVersion = 'v1.0.0') {
    this._version = initialVersion;
  }

  public get version(): string {
    return this._version;
  }

  public addNode(nodeId: string, coord: GeoCoord): void {
    this.nodes.set(nodeId, { ...coord });
    if (!this.adjacency.has(nodeId)) {
      this.adjacency.set(nodeId, []);
    }
  }

  public addEdge(
    fromNodeId: string,
    toNodeId: string,
    options: { distanceMeters?: number; freeFlowSpeedKmh?: number; isClosed?: boolean } = {}
  ): string {
    const fromCoord = this.nodes.get(fromNodeId);
    const toCoord = this.nodes.get(toNodeId);
    if (!fromCoord || !toCoord) {
      throw new Error(`Both nodes ${fromNodeId} and ${toNodeId} must exist in graph`);
    }

    const dist = options.distanceMeters ?? geodesicDistance(fromCoord, toCoord);
    const speedMps = ((options.freeFlowSpeedKmh ?? 40) * 1000) / 3600;
    const edgeId = `${fromNodeId}->${toNodeId}`;

    const edge: DirectedEdge = {
      fromNodeId,
      toNodeId,
      distanceMeters: dist,
      freeFlowSpeedMps: speedMps,
      isClosed: options.isClosed ?? false,
    };

    this.edges.set(edgeId, edge);
    this.adjacency.get(fromNodeId)!.push(edge);
    return edgeId;
  }

  public setEdgeClosure(fromNodeId: string, toNodeId: string, isClosed: boolean, newVersion?: string): void {
    const edgeId = `${fromNodeId}->${toNodeId}`;
    const edge = this.edges.get(edgeId);
    if (edge) {
      (edge as any).isClosed = isClosed;
    }
    this._version = newVersion ?? `v${Date.now()}`;
  }

  public locate(point: GeoCoord): RoadPosition {
    let bestNode = '';
    let minDist = Infinity;
    for (const [id, coord] of this.nodes.entries()) {
      const dist = geodesicDistance(point, coord);
      if (dist < minDist) {
        minDist = dist;
        bestNode = id;
      }
    }
    const coord = this.nodes.get(bestNode) ?? point;
    return {
      roadId: bestNode,
      coordinate: coord,
    };
  }

  public reachable(from: RoadPosition, to: RoadPosition): Reachability {
    const cost = this.estimateCost(from, to);
    if (cost.durationSeconds === Infinity) {
      return { reachable: false, reason: 'No connected path or barrier closure' };
    }
    return { reachable: true };
  }

  public estimateCost(from: RoadPosition, to: RoadPosition): RouteCost {
    if (from.roadId === to.roadId) {
      return { distanceMeters: 0, durationSeconds: 0, roadVersion: this._version };
    }

    // Dijkstra's shortest path algorithm
    const dists = new Map<string, number>();
    const times = new Map<string, number>();
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      dists.set(nodeId, Infinity);
      times.set(nodeId, Infinity);
    }

    times.set(from.roadId, 0);
    dists.set(from.roadId, 0);

    while (true) {
      let closestNode: string | null = null;
      let minTime = Infinity;

      for (const [nodeId, time] of times.entries()) {
        if (!visited.has(nodeId) && time < minTime) {
          minTime = time;
          closestNode = nodeId;
        }
      }

      if (!closestNode || minTime === Infinity) break;
      if (closestNode === to.roadId) break;

      visited.add(closestNode);
      const outgoing = this.adjacency.get(closestNode) ?? [];

      for (const edge of outgoing) {
        if (edge.isClosed || visited.has(edge.toNodeId)) continue;
        const traverseTime = edge.distanceMeters / edge.freeFlowSpeedMps;
        const newTime = minTime + traverseTime;
        const newDist = dists.get(closestNode)! + edge.distanceMeters;

        if (newTime < times.get(edge.toNodeId)!) {
          times.set(edge.toNodeId, newTime);
          dists.set(edge.toNodeId, newDist);
        }
      }
    }

    const durationSeconds = times.get(to.roadId) ?? Infinity;
    const distanceMeters = dists.get(to.roadId) ?? Infinity;

    return {
      distanceMeters,
      durationSeconds,
      roadVersion: this._version,
    };
  }
}
