import { RoadTopology } from './topology';
import { GeoCoord } from './types';
export interface RouteCostResult {
    readonly distanceMeters: number;
    readonly durationSeconds: number;
    readonly roadVersion?: string;
    readonly trafficTimestamp?: number;
}
export interface RouteMatrixElement {
    readonly originIndex: number;
    readonly destinationIndex: number;
    readonly distanceMeters: number;
    readonly durationSeconds: number;
    readonly status: 'OK' | 'NO_ROUTE' | 'TIMEOUT' | 'ERROR';
}
export interface RouteMatrixResult {
    readonly rows: RouteMatrixElement[][];
    readonly roadVersion?: string;
    readonly trafficTimestamp?: number;
}
export interface RoutingOptions {
    readonly timeoutMs?: number;
    readonly abortSignal?: AbortSignal;
    readonly retryAttempts?: number;
    readonly maxDurationSeconds?: number;
}
/**
 * Production Routing Engine Contract (e.g. OSRM, Valhalla, GraphHopper).
 * Supports both point-to-point routing and high-throughput one-to-many matrix routing.
 */
export interface RouteCostProvider {
    getRouteCost(origin: GeoCoord, destination: GeoCoord, options?: RoutingOptions): Promise<RouteCostResult>;
    getRouteMatrix?(origins: GeoCoord[], destinations: GeoCoord[], options?: RoutingOptions): Promise<RouteMatrixResult>;
}
/**
 * Routing provider wrapping a versioned RoadTopology graph.
 */
export declare class TopologyRoutingProvider implements RouteCostProvider {
    private readonly topology;
    constructor(topology: RoadTopology);
    getRouteCost(origin: GeoCoord, destination: GeoCoord, _options?: RoutingOptions): Promise<RouteCostResult>;
    getRouteMatrix(origins: GeoCoord[], destinations: GeoCoord[], _options?: RoutingOptions): Promise<RouteMatrixResult>;
}
/**
 * Deterministic benchmark & test routing provider with simulated road network detour multiplier.
 */
export declare class SimulatedRoadRoutingProvider implements RouteCostProvider {
    private readonly detourFactor;
    private readonly speedKmh;
    constructor(detourFactor?: number, speedKmh?: number);
    getRouteCost(origin: GeoCoord, destination: GeoCoord, _options?: RoutingOptions): Promise<RouteCostResult>;
}
