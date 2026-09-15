import { RouteCostProvider } from './routing';
import { GeoCoord, TriHexId } from './types';
/**
 * Driver operational status in the mobility dispatch system
 */
export type DriverStatus = 'AVAILABLE' | 'EN_ROUTE' | 'BUSY' | 'OFFLINE' | 'REMOVED';
/**
 * Real-time driver location and telemetry payload with authoritative monotonic sequencing
 */
export interface DriverPosition {
    driverId: string;
    lat: number;
    lng: number;
    cellId: TriHexId;
    cityId: string;
    version: number;
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
    routingFallback?: boolean;
    barrierPenalized?: boolean;
}
/**
 * Minimal Redis command interface to support any Redis client (ioredis, node-redis, cluster)
 */
export interface RedisCommandClient {
    eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<unknown>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    srandmember?(key: string, count: number): Promise<string[]>;
    sunion?(...keys: string[]): Promise<string[]>;
    get(key: string): Promise<string | null>;
    mget?(...keys: string[]): Promise<(string | null)[]>;
    set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
}
/**
 * Shard resolution for spatial partitioning (e.g. res 4 divides Earth into ~5,120 spatial macro-shards).
 * Distributes megacity spatial cells across multiple Redis Cluster slots.
 */
export declare const DEFAULT_SHARD_RESOLUTION = 4;
/**
 * Generates an intra-city spatial shard identifier from a cell's coarse parent.
 */
export declare function getSpatialShard(cellId: TriHexId, shardResolution?: number): string;
/**
 * Generates a Redis cluster-safe hash-tagged key for a spatial cell.
 * Format: {market:shard}:cell:{cellIdHex}
 * Spatially distributes different parts of a city across all 16,384 Redis Cluster slots.
 */
export declare function formatCellKey(cityId: string, cellId: TriHexId, shardResolution?: number): string;
/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {market:shard}:driver:{driverId}
 */
export declare function formatDriverKey(cityId: string, driverId: string, cellId?: TriHexId, shardResolution?: number): string;
/**
 * Atomic Redis Lua script for driver cell migration with monotonic version protection.
 *
 * Atomically:
 *  1. Verifies that incoming version > existing stored version (rejects stale/out-of-order GPS updates).
 *  2. Reads authoritative old cell from the stored record.
 *  3. Removes driver from old cell set (SREM).
 *  4. Adds driver to new cell set (SADD).
 *  5. Updates authoritative position record (SET ... EX driverTtl).
 *  6. Refreshes cell set TTL.
 */
export declare const MIGRATE_DRIVER_LUA = "\nlocal newCellKey = KEYS[1]\nlocal driverPosKey = KEYS[2]\nlocal driverId = ARGV[1]\nlocal cellTtl = tonumber(ARGV[2])\nlocal driverTtl = tonumber(ARGV[3])\nlocal payload = ARGV[4]\nlocal incoming = cjson.decode(payload)\nlocal incomingVersion = tonumber(incoming.version) or 0\n\nlocal existingRaw = redis.call(\"GET\", driverPosKey)\nif existingRaw then\n  local existing = cjson.decode(existingRaw)\n  local existingVersion = tonumber(existing.version) or 0\n  if existingVersion >= incomingVersion then\n    return 0 -- Stale or duplicate update rejected\n  end\n\n  local oldCellKey = existing.cellKey\n  if oldCellKey and oldCellKey ~= \"\" and oldCellKey ~= newCellKey then\n    pcall(redis.call, \"SREM\", oldCellKey, driverId)\n  end\nend\n\nredis.call(\"SADD\", newCellKey, driverId)\nif cellTtl and cellTtl > 0 then\n  redis.call(\"EXPIRE\", newCellKey, cellTtl)\nend\n\nredis.call(\"SET\", driverPosKey, payload, \"EX\", driverTtl)\nreturn 1\n";
/**
 * Atomic Redis Lua script for driver offline removal with tombstone protection.
 *
 * Atomically:
 *  1. Reads authoritative current cell from stored record.
 *  2. Removes driver from the spatial cell set (SREM).
 *  3. Writes a tombstone record with incremented version and tombstone TTL to prevent delayed pings from resurrecting.
 */
export declare const REMOVE_DRIVER_LUA = "\nlocal driverPosKey = KEYS[1]\nlocal driverId = ARGV[1]\nlocal tombstoneTtl = tonumber(ARGV[2]) or 60\nlocal tombstonePayload = ARGV[3]\nlocal incoming = cjson.decode(tombstonePayload)\nlocal incomingVersion = tonumber(incoming.version) or 0\n\nlocal existingRaw = redis.call(\"GET\", driverPosKey)\nif existingRaw then\n  local existing = cjson.decode(existingRaw)\n  local existingVersion = tonumber(existing.version) or 0\n  if existingVersion > incomingVersion then\n    return 0 -- Stale offline request rejected\n  end\n\n  local cellKey = existing.cellKey\n  if cellKey and cellKey ~= \"\" then\n    pcall(redis.call, \"SREM\", cellKey, driverId)\n  end\nend\n\nredis.call(\"SET\", driverPosKey, tombstonePayload, \"EX\", tombstoneTtl)\nreturn 1\n";
export interface DispatchEngineOptions {
    redisClient?: RedisCommandClient;
    routeCostProvider?: RouteCostProvider;
    cellTtlSeconds?: number;
    driverTtlSeconds?: number;
    tombstoneTtlSeconds?: number;
    defaultAverageSpeedKmh?: number;
    tier1CandidateLimit?: number;
    tier2CandidateLimit?: number;
    maxCellsPerSearch?: number;
    maxDriversPerCell?: number;
    rejectCrossBarrierFallback?: boolean;
    timeoutMs?: number;
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
 * In-memory fallback driver store supporting atomic versioned transitions and tombstones
 */
export declare class InMemoryDriverRegistry {
    private readonly cellDrivers;
    private readonly driverPositions;
    update(pos: DriverPosition): boolean;
    remove(cityId: string, driverId: string, cellId?: TriHexId, version?: number): boolean;
    getDriversInCell(cellKey: string): string[];
    getDriverPosition(driverKey: string): DriverPosition | null;
    clear(): void;
}
/**
 * DriverSpatialStore: Abstract storage interface decoupling spatial indexing from physical storage engines.
 * Implementations can be Redis, PostgreSQL, DynamoDB, or In-Memory.
 */
export interface DriverSpatialStore {
    add(driverId: string, cell: TriHexId, version: number, metadata?: Partial<DriverPosition>): Promise<void>;
    remove(driverId: string, cell: TriHexId, version: number, cityId?: string): Promise<void>;
    findCandidates(cells: TriHexId[], limit: number, cityId?: string): Promise<string[]>;
}
/**
 * In-memory reference implementation of DriverSpatialStore
 */
export declare class InMemoryDriverSpatialStore implements DriverSpatialStore {
    private readonly registry;
    constructor(registry?: InMemoryDriverRegistry);
    add(driverId: string, cell: TriHexId, version: number, metadata?: Partial<DriverPosition>): Promise<void>;
    remove(driverId: string, cell: TriHexId, version: number, cityId?: string): Promise<void>;
    findCandidates(cells: TriHexId[], limit: number, cityId?: string): Promise<string[]>;
    getRegistry(): InMemoryDriverRegistry;
}
/**
 * Production-grade Multi-Tier Mobility Dispatch Engine.
 *
 * Tier 1: High-recall spatial retrieval over expanding triangular disks with intra-city sharding.
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla matrix) on route-feasible candidate pool.
 * Tier 3: Multi-objective dispatch ranking (ETA, distance).
 */
export declare class DispatchEngine {
    private readonly redis?;
    private readonly inMemory;
    private readonly routeCostProvider?;
    private readonly cellTtl;
    private readonly driverTtl;
    private readonly tombstoneTtl;
    private readonly defaultAverageSpeedMps;
    private readonly tier1Limit;
    private readonly tier2Limit;
    private readonly maxCells;
    private readonly maxDriversPerCell;
    private readonly rejectCrossBarrierFallback;
    constructor(options?: DispatchEngineOptions);
    /**
     * Updates driver position atomically with authoritative monotonic version protection.
     * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
     */
    updateDriverPosition(position: DriverPosition): Promise<boolean>;
    /**
     * Atomically removes a driver when they go offline, writing a tombstone to prevent resurrection.
     */
    removeDriver(cityId: string, driverId: string, currentCellId?: TriHexId, version?: number): Promise<boolean>;
    /**
     * Retrieves raw driver position by ID.
     */
    getDriverPosition(cityId: string, driverId: string, cellId?: TriHexId): Promise<DriverPosition | null>;
    /**
     * Retrieves all driver IDs currently indexed in a spatial cell.
     */
    getDriversInCell(cityId: string, cellId: TriHexId): Promise<string[]>;
    /**
     * Finds, ranks, and dispatches candidate drivers for a pickup request using 3-Tier candidate generation and evaluation:
     *  - Tier 1: High-recall spatial candidate generation.
     *  - Tier 2: Road network routing & turn-by-turn ETA evaluation of retained candidates.
     *  - Tier 3: Dispatch scoring optimization.
     * Note: The final routed candidate is optimal within the retained candidate pool.
     */
    findCandidates(query: CandidateQuery): Promise<CandidateScoring[]>;
}
