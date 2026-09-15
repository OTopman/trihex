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
export declare class VersionedRoadGraph implements RoadTopology {
    private _version;
    private readonly nodes;
    private readonly edges;
    private readonly adjacency;
    constructor(initialVersion?: string);
    get version(): string;
    addNode(nodeId: string, coord: GeoCoord): void;
    addEdge(fromNodeId: string, toNodeId: string, options?: {
        distanceMeters?: number;
        freeFlowSpeedKmh?: number;
        isClosed?: boolean;
    }): string;
    setEdgeClosure(fromNodeId: string, toNodeId: string, isClosed: boolean, newVersion?: string): void;
    locate(point: GeoCoord): RoadPosition;
    reachable(from: RoadPosition, to: RoadPosition): Reachability;
    estimateCost(from: RoadPosition, to: RoadPosition): RouteCost;
}
