import { GeoCoord, TriHexId } from './types';
/**
 * Driver operational status in the mobility dispatch system
 */
export type DriverStatus = 'AVAILABLE' | 'EN_ROUTE' | 'BUSY' | 'OFFLINE';
/**
 * Real-time driver location and telemetry payload
 */
export interface DriverPosition {
    driverId: string;
    lat: number;
    lng: number;
    cellId: TriHexId;
    cityId: string;
    updatedAt: number;
    status?: DriverStatus;
}
/**
 * Scored and ranked candidate driver for ride dispatch
 */
export interface CandidateScoring {
    driverId: string;
    lat: number;
    lng: number;
    cellId: TriHexId;
    geodesicDistanceMeters: number;
    estimatedDurationSeconds: number;
    routeDistanceMeters?: number;
    routeDurationSeconds?: number;
    finalScore: number;
    rank: number;
}
/**
 * Pluggable route-cost provider for Tier 2 turn-by-turn road network routing (e.g. OSRM, Valhalla)
 */
export interface RouteCostProvider {
    getRouteCost(origin: GeoCoord, destination: GeoCoord): Promise<{
        distanceMeters: number;
        durationSeconds: number;
    }>;
}
/**
 * Minimal Redis command interface to support any Redis client (ioredis, node-redis, cluster proxy)
 * without requiring runtime npm dependencies.
 */
export interface RedisCommandClient {
    eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    sunion?(...keys: string[]): Promise<string[]>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
}
/**
 * Atomic Redis Lua script for driver cell migration.
 *
 * Atomically removes driver from old cell set, adds to new cell set,
 * refreshes cell TTL, and records driver location with TTL.
 * Eliminates ghost drivers caused by process crashes or network split-brain.
 */
export declare const MIGRATE_DRIVER_LUA = "\nlocal oldCellKey = KEYS[1]\nlocal newCellKey = KEYS[2]\nlocal driverPosKey = KEYS[3]\nlocal driverId = ARGV[1]\nlocal cellTtl = tonumber(ARGV[2])\nlocal driverTtl = tonumber(ARGV[3])\nlocal payload = ARGV[4]\n\nif oldCellKey and oldCellKey ~= \"\" and oldCellKey ~= newCellKey then\n  redis.call(\"SREM\", oldCellKey, driverId)\nend\n\nredis.call(\"SADD\", newCellKey, driverId)\nif cellTtl and cellTtl > 0 then\n  redis.call(\"EXPIRE\", newCellKey, cellTtl)\nend\n\nif payload and payload ~= \"\" then\n  redis.call(\"SET\", driverPosKey, payload, \"EX\", driverTtl)\nelse\n  redis.call(\"SET\", driverPosKey, newCellKey, \"EX\", driverTtl)\nend\n\nreturn 1\n";
/**
 * Generates a Redis cluster-safe hash-tagged key for a spatial cell.
 * Format: {cityId}:cell:{cellIdHex}
 * The curly braces ensure all cells and drivers in the same city hash to the same Redis slot.
 */
export declare function formatCellKey(cityId: string, cellId: TriHexId): string;
/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {cityId}:driver:{driverId}
 */
export declare function formatDriverKey(cityId: string, driverId: string): string;
export interface DispatchEngineOptions {
    redisClient?: RedisCommandClient;
    routeCostProvider?: RouteCostProvider;
    cellTtlSeconds?: number;
    driverTtlSeconds?: number;
    defaultAverageSpeedKmh?: number;
    tier1CandidateLimit?: number;
    tier2CandidateLimit?: number;
}
export interface CandidateQuery {
    pickup: GeoCoord;
    pickupCellId: TriHexId;
    cityId: string;
    initialRadius?: number;
    maxRadius?: number;
    requiredStatus?: DriverStatus;
    maxResults?: number;
}
/**
 * In-memory fallback driver store when running locally or without Redis
 */
export declare class InMemoryDriverRegistry {
    private readonly cellDrivers;
    private readonly driverPositions;
    update(pos: DriverPosition, oldCellId?: TriHexId): void;
    remove(cityId: string, driverId: string, currentCellId?: TriHexId): void;
    getDriversInCell(cellKey: string): string[];
    getDriverPosition(driverKey: string): DriverPosition | null;
    clear(): void;
}
/**
 * Production-grade Two-Tier Mobility Dispatch Engine
 *
 * Tier 1: In-memory Haversine geodesic distance pre-filtering and candidate culling (N -> K).
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla) on top K candidates.
 */
export declare class DispatchEngine {
    private readonly redis?;
    private readonly inMemory;
    private readonly routeCostProvider?;
    private readonly cellTtl;
    private readonly driverTtl;
    private readonly defaultAverageSpeedMps;
    private readonly tier1Limit;
    private readonly tier2Limit;
    constructor(options?: DispatchEngineOptions);
    /**
     * Updates driver position atomically.
     * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
     */
    updateDriverPosition(position: DriverPosition, oldCellId?: TriHexId): Promise<void>;
    /**
     * Removes a driver when they go offline.
     */
    removeDriver(cityId: string, driverId: string, currentCellId?: TriHexId): Promise<void>;
    /**
     * Retrieves raw driver position by ID.
     */
    getDriverPosition(cityId: string, driverId: string): Promise<DriverPosition | null>;
    /**
     * Finds, ranks, and dispatches the optimal drivers for a pickup request using 2-Tier dispatch.
     */
    findCandidates(query: CandidateQuery): Promise<CandidateScoring[]>;
}
