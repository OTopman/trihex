import { cellDisk } from './adjacency';
import { geodesicDistance } from './icosahedron';
import { effectiveDistance, isSameCluster } from './network-metric';
import { RouteCostProvider } from './routing';
import { cellToString } from './serialization';
import { cellToParent } from './triangle-quadtree';
import { GeoCoord, TriHexId } from './types';
import { validateCellId, validateCoordinates } from './validation';

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
  version: number;     // Monotonic sequence token
  updatedAt: number;   // Timestamp (epoch ms)
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
export const DEFAULT_SHARD_RESOLUTION = 4;

/**
 * Generates an intra-city spatial shard identifier from a cell's coarse parent.
 */
export function getSpatialShard(cellId: TriHexId, shardResolution = DEFAULT_SHARD_RESOLUTION): string {
  const parent = cellToParent(cellId, shardResolution);
  return cellToString(parent).substring(8, 16);
}

/**
 * Generates a Redis cluster-safe hash-tagged key for a spatial cell.
 * Format: {market:shard}:cell:{cellIdHex}
 * Spatially distributes different parts of a city across all 16,384 Redis Cluster slots.
 */
export function formatCellKey(cityId: string, cellId: TriHexId, shardResolution = DEFAULT_SHARD_RESOLUTION): string {
  const shard = getSpatialShard(cellId, shardResolution);
  const hex = cellToString(cellId);
  return `{${cityId}:${shard}}:cell:${hex}`;
}

/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {market:shard}:driver:{driverId}
 */
export function formatDriverKey(cityId: string, driverId: string, cellId?: TriHexId, shardResolution = DEFAULT_SHARD_RESOLUTION): string {
  if (cellId !== undefined) {
    const shard = getSpatialShard(cellId, shardResolution);
    return `{${cityId}:${shard}}:driver:${driverId}`;
  }
  return `{${cityId}:global}:driver:${driverId}`;
}

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
export const MIGRATE_DRIVER_LUA = `
local newCellKey = KEYS[1]
local driverPosKey = KEYS[2]
local driverId = ARGV[1]
local cellTtl = tonumber(ARGV[2])
local driverTtl = tonumber(ARGV[3])
local payload = ARGV[4]
local incoming = cjson.decode(payload)
local incomingVersion = tonumber(incoming.version) or 0

local existingRaw = redis.call("GET", driverPosKey)
if existingRaw then
  local existing = cjson.decode(existingRaw)
  local existingVersion = tonumber(existing.version) or 0
  if existingVersion >= incomingVersion then
    return 0 -- Stale or duplicate update rejected
  end

  local oldCellKey = existing.cellKey
  if oldCellKey and oldCellKey ~= "" and oldCellKey ~= newCellKey then
    pcall(redis.call, "SREM", oldCellKey, driverId)
  end
end

redis.call("SADD", newCellKey, driverId)
if cellTtl and cellTtl > 0 then
  redis.call("EXPIRE", newCellKey, cellTtl)
end

redis.call("SET", driverPosKey, payload, "EX", driverTtl)
return 1
`;

/**
 * Atomic Redis Lua script for driver offline removal with tombstone protection.
 *
 * Atomically:
 *  1. Reads authoritative current cell from stored record.
 *  2. Removes driver from the spatial cell set (SREM).
 *  3. Writes a tombstone record with incremented version and tombstone TTL to prevent delayed pings from resurrecting.
 */
export const REMOVE_DRIVER_LUA = `
local driverPosKey = KEYS[1]
local driverId = ARGV[1]
local tombstoneTtl = tonumber(ARGV[2]) or 60
local tombstonePayload = ARGV[3]
local incoming = cjson.decode(tombstonePayload)
local incomingVersion = tonumber(incoming.version) or 0

local existingRaw = redis.call("GET", driverPosKey)
if existingRaw then
  local existing = cjson.decode(existingRaw)
  local existingVersion = tonumber(existing.version) or 0
  if existingVersion > incomingVersion then
    return 0 -- Stale offline request rejected
  end

  local cellKey = existing.cellKey
  if cellKey and cellKey ~= "" then
    pcall(redis.call, "SREM", cellKey, driverId)
  end
end

redis.call("SET", driverPosKey, tombstonePayload, "EX", tombstoneTtl)
return 1
`;

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
export class InMemoryDriverRegistry {
  private readonly cellDrivers = new Map<string, Set<string>>();
  private readonly driverPositions = new Map<string, DriverPosition & { cellKey: string }>();

  public update(pos: DriverPosition): boolean {
    const key = `${pos.cityId}:${pos.driverId}`;
    const existing = this.driverPositions.get(key);

    if (existing && existing.version >= pos.version) {
      return false; // Stale or duplicate update rejected
    }

    const newCellKey = formatCellKey(pos.cityId, pos.cellId);
    if (existing && existing.cellKey && existing.cellKey !== newCellKey) {
      this.cellDrivers.get(existing.cellKey)?.delete(pos.driverId);
    }

    let drivers = this.cellDrivers.get(newCellKey);
    if (!drivers) {
      drivers = new Set<string>();
      this.cellDrivers.set(newCellKey, drivers);
    }
    drivers.add(pos.driverId);

    this.driverPositions.set(key, { ...pos, cellKey: newCellKey });
    return true;
  }

  public remove(cityId: string, driverId: string, cellId?: TriHexId, version?: number): boolean {
    const key = `${cityId}:${driverId}`;
    const existing = this.driverPositions.get(key);
    const tombstoneVer = version ?? Date.now();

    if (existing && existing.version >= tombstoneVer) {
      return false;
    }

    const currentCellId = cellId ?? existing?.cellId;
    if (currentCellId !== undefined) {
      const cellKey = formatCellKey(cityId, currentCellId);
      this.cellDrivers.get(cellKey)?.delete(driverId);
    }

    this.driverPositions.set(key, {
      driverId,
      lat: existing?.lat ?? 0,
      lng: existing?.lng ?? 0,
      cellId: currentCellId ?? 0n,
      cityId,
      version: tombstoneVer,
      updatedAt: Date.now(),
      status: 'REMOVED',
      cellKey: '',
    });

    return true;
  }

  public getDriversInCell(cellKey: string): string[] {
    return Array.from(this.cellDrivers.get(cellKey) ?? []);
  }

  public getDriverPosition(driverKey: string): DriverPosition | null {
    let pos = this.driverPositions.get(driverKey);
    if (!pos) {
      const match = driverKey.match(/\{([^:]+):[^}]+\}:driver:(.+)/);
      if (match) {
        pos = this.driverPositions.get(`${match[1]}:${match[2]}`);
      }
    }
    if (!pos || pos.status === 'REMOVED' || pos.status === 'OFFLINE') return null;
    return pos;
  }

  public clear(): void {
    this.cellDrivers.clear();
    this.driverPositions.clear();
  }
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
export class InMemoryDriverSpatialStore implements DriverSpatialStore {
  constructor(private readonly registry: InMemoryDriverRegistry = new InMemoryDriverRegistry()) { }

  public async add(driverId: string, cell: TriHexId, version: number, metadata?: Partial<DriverPosition>): Promise<void> {
    const cityId = metadata?.cityId ?? 'default';
    this.registry.update({
      driverId,
      cellId: cell,
      version,
      cityId,
      lat: metadata?.lat ?? 0,
      lng: metadata?.lng ?? 0,
      updatedAt: metadata?.updatedAt ?? Date.now(),
      status: metadata?.status ?? 'AVAILABLE',
    });
  }

  public async remove(driverId: string, cell: TriHexId, version: number, cityId = 'default'): Promise<void> {
    this.registry.remove(cityId, driverId, cell, version);
  }

  public async findCandidates(cells: TriHexId[], limit: number, cityId = 'default'): Promise<string[]> {
    const result: string[] = [];
    for (const cell of cells) {
      const cellKey = formatCellKey(cityId, cell);
      const drivers = this.registry.getDriversInCell(cellKey);
      for (const d of drivers) {
        if (!result.includes(d)) {
          result.push(d);
          if (result.length >= limit) return result;
        }
      }
    }
    return result;
  }

  public getRegistry(): InMemoryDriverRegistry {
    return this.registry;
  }
}

/**
 * Production-grade Multi-Tier Mobility Dispatch Engine.
 *
 * Tier 1: High-recall spatial retrieval over expanding triangular disks with intra-city sharding.
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla matrix) on route-feasible candidate pool.
 * Tier 3: Multi-objective dispatch ranking (ETA, distance).
 */
export class DispatchEngine {
  private readonly redis?: RedisCommandClient;
  private readonly inMemory = new InMemoryDriverRegistry();
  private readonly routeCostProvider?: RouteCostProvider;
  private readonly cellTtl: number;
  private readonly driverTtl: number;
  private readonly tombstoneTtl: number;
  private readonly defaultAverageSpeedMps: number;
  private readonly tier1Limit: number;
  private readonly tier2Limit: number;
  private readonly maxCells: number;
  private readonly maxDriversPerCell: number;
  private readonly rejectCrossBarrierFallback: boolean;

  constructor(options: DispatchEngineOptions = {}) {
    this.redis = options.redisClient;
    this.routeCostProvider = options.routeCostProvider;
    this.cellTtl = options.cellTtlSeconds ?? 300;
    this.driverTtl = options.driverTtlSeconds ?? 60;
    this.tombstoneTtl = options.tombstoneTtlSeconds ?? 60;
    const speedKmh = options.defaultAverageSpeedKmh ?? 30;
    this.defaultAverageSpeedMps = (speedKmh * 1000) / 3600;
    this.tier1Limit = options.tier1CandidateLimit ?? 50;
    this.tier2Limit = options.tier2CandidateLimit ?? 5;
    this.maxCells = options.maxCellsPerSearch ?? 128;
    this.maxDriversPerCell = options.maxDriversPerCell ?? 250;
    this.rejectCrossBarrierFallback = options.rejectCrossBarrierFallback ?? false;
  }

  /**
   * Updates driver position atomically with authoritative monotonic version protection.
   * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
   */
  public async updateDriverPosition(position: DriverPosition): Promise<boolean> {
    validateCoordinates(position.lat, position.lng);
    validateCellId(position.cellId);

    const version = position.version !== undefined ? position.version : (position.updatedAt ?? Date.now());
    if (!Number.isFinite(version) || version < 0) {
      throw new TypeError(`version must be a non-negative number, received ${position.version}`);
    }

    const effectivePos: DriverPosition = { ...position, version };
    const newCellKey = formatCellKey(position.cityId, position.cellId);
    const driverKey = formatDriverKey(position.cityId, position.driverId, position.cellId);
    const payload = JSON.stringify({
      ...effectivePos,
      cellId: position.cellId.toString(),
      cellKey: newCellKey,
    });

    if (this.redis) {
      const res = await this.redis.eval(
        MIGRATE_DRIVER_LUA,
        2,
        newCellKey,
        driverKey,
        position.driverId,
        this.cellTtl,
        this.driverTtl,
        payload
      );
      return res === 1;
    } else {
      return this.inMemory.update(effectivePos);
    }
  }

  /**
   * Atomically removes a driver when they go offline, writing a tombstone to prevent resurrection.
   */
  public async removeDriver(
    cityId: string,
    driverId: string,
    currentCellId?: TriHexId,
    version?: number
  ): Promise<boolean> {
    const driverKey = formatDriverKey(cityId, driverId, currentCellId);
    const tombstoneVersion = version ?? Date.now();
    const tombstonePayload = JSON.stringify({
      driverId,
      cityId,
      version: tombstoneVersion,
      updatedAt: Date.now(),
      status: 'REMOVED',
    });

    if (this.redis) {
      const res = await this.redis.eval(
        REMOVE_DRIVER_LUA,
        1,
        driverKey,
        driverId,
        this.tombstoneTtl,
        tombstonePayload
      );
      return res === 1;
    } else {
      return this.inMemory.remove(cityId, driverId, currentCellId, tombstoneVersion);
    }
  }

  /**
   * Retrieves raw driver position by ID.
   */
  public async getDriverPosition(
    cityId: string,
    driverId: string,
    cellId?: TriHexId
  ): Promise<DriverPosition | null> {
    const driverKey = formatDriverKey(cityId, driverId, cellId);

    if (this.redis) {
      const raw = await this.redis.get(driverKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.status === 'REMOVED' || parsed.status === 'OFFLINE') return null;
        return {
          ...parsed,
          cellId: BigInt(parsed.cellId),
        };
      } catch {
        return null;
      }
    } else {
      return this.inMemory.getDriverPosition(driverKey);
    }
  }

  /**
   * Retrieves all driver IDs currently indexed in a spatial cell.
   */
  public async getDriversInCell(cityId: string, cellId: TriHexId): Promise<string[]> {
    const cellKey = formatCellKey(cityId, cellId);
    if (this.redis) {
      return await this.redis.smembers(cellKey);
    } else {
      return this.inMemory.getDriversInCell(cellKey);
    }
  }

  /**
   * Finds, ranks, and dispatches candidate drivers for a pickup request using 3-Tier candidate generation and evaluation:
   *  - Tier 1: High-recall spatial candidate generation.
   *  - Tier 2: Road network routing & turn-by-turn ETA evaluation of retained candidates.
   *  - Tier 3: Dispatch scoring optimization.
   * Note: The final routed candidate is optimal within the retained candidate pool.
   */
  public async findCandidates(query: CandidateQuery): Promise<CandidateScoring[]> {
    validateCoordinates(query.pickup.lat, query.pickup.lng);
    validateCellId(query.pickupCellId);

    const initialRadius = query.initialRadius ?? 1;
    const maxRadius = query.maxRadius ?? 3;
    const requiredStatus = query.requiredStatus ?? 'AVAILABLE';
    const maxResults = query.maxResults ?? this.tier2Limit;

    // Collect candidate driver IDs across expanding concentric triangular rings (avoiding duplicate ring scans)
    const seenDriverIds = new Set<string>();
    const seenCells = new Set<string>();
    const candidateIds: { driverId: string; cellId: TriHexId }[] = [];

    for (let r = initialRadius; r <= maxRadius; r++) {
      const ringCells = cellDisk(query.pickupCellId, r);

      for (const cell of ringCells) {
        const cKey = cell.toString();
        if (seenCells.has(cKey)) continue;
        seenCells.add(cKey);

        if (seenCells.size > this.maxCells) break;

        const cellKey = formatCellKey(query.cityId, cell);
        let driversInCell: string[] = [];

        if (this.redis) {
          if (typeof this.redis.srandmember === 'function') {
            driversInCell = await this.redis.srandmember(cellKey, this.maxDriversPerCell);
          } else {
            const allMembers = await this.redis.smembers(cellKey);
            driversInCell = allMembers.slice(0, this.maxDriversPerCell);
          }
        } else {
          const inMem = this.inMemory.getDriversInCell(cellKey);
          driversInCell = inMem.slice(0, this.maxDriversPerCell);
        }

        for (const dId of driversInCell) {
          if (!seenDriverIds.has(dId)) {
            seenDriverIds.add(dId);
            candidateIds.push({ driverId: dId, cellId: cell });
          }
        }
      }

      if (candidateIds.length >= this.tier1Limit || seenCells.size >= this.maxCells) {
        break;
      }
    }

    if (candidateIds.length === 0) {
      return [];
    }

    // ==========================================
    // TIER 1: Fetch Position Records & Pre-Rank
    // ==========================================
    const activeCandidates: DriverPosition[] = [];

    // Batched position fetching
    for (const cand of candidateIds) {
      const pos = await this.getDriverPosition(query.cityId, cand.driverId, cand.cellId);
      if (pos && (pos.status === undefined || pos.status === requiredStatus)) {
        activeCandidates.push(pos);
      }
    }

    if (activeCandidates.length === 0) {
      return [];
    }

    const tier1Scored = activeCandidates.map((cand) => {
      const dist = geodesicDistance({ lat: cand.lat, lng: cand.lng }, query.pickup);
      const durationSec = dist / this.defaultAverageSpeedMps;
      return { pos: cand, dist, durationSec };
    });

    tier1Scored.sort((a, b) => a.durationSec - b.durationSec);

    // Dynamic candidate pool for Tier 2:
    // We take up to Math.min(candidatePoolSize, activeCandidates.length)
    // To ensure high recall, we route a wider pool (e.g. up to 15 candidates) before culling to maxResults
    const tier2PoolSize = Math.max(maxResults, Math.min(15, tier1Scored.length));
    const tier2Candidates = tier1Scored.slice(0, tier2PoolSize);

    // ==========================================
    // TIER 2: Turn-by-Turn Road Network Routing
    // ==========================================
    const candidates: CandidateScoring[] = [];

    if (this.routeCostProvider) {
      const routePromises = tier2Candidates.map(async (cand): Promise<CandidateScoring | null> => {
        try {
          const cost = await this.routeCostProvider!.getRouteCost(
            { lat: cand.pos.lat, lng: cand.pos.lng },
            query.pickup
          );
          return {
            driverId: cand.pos.driverId,
            lat: cand.pos.lat,
            lng: cand.pos.lng,
            cellId: cand.pos.cellId,
            geodesicDistanceMeters: Math.round(cand.dist),
            estimatedDurationSeconds: Math.round(cand.durationSec),
            routeDistanceMeters: Math.round(cost.distanceMeters),
            routeDurationSeconds: Math.round(cost.durationSeconds),
            finalScore: cost.durationSeconds,
            rank: 0,
            routingFallback: false,
            barrierPenalized: false,
          };
        } catch {
          // Safe Routing Fallback (Section 29)
          // Never blindly fall back to straight-line distance across network barriers.
          const sameCluster = isSameCluster(cand.pos.cellId, query.pickupCellId);
          if (this.rejectCrossBarrierFallback && !sameCluster) {
            // Safety policy: reject unreachable cross-barrier candidate when routing is down
            return null;
          }

          // Evaluate topology-aware effective distance with barrier penalties
          const effectiveDist = effectiveDistance(cand.pos.cellId, query.pickupCellId, {
            barrierPenaltyMeters: 5000,
          });
          const isPenalized = effectiveDist > cand.dist * 1.2 || !sameCluster;
          // Conservative circuity factor: 1.6x for urban streets, 2.5x across barrier detours
          const circuityFactor = isPenalized ? 2.5 : 1.6;
          const fallbackDurationSec = (effectiveDist / this.defaultAverageSpeedMps) * circuityFactor;

          return {
            driverId: cand.pos.driverId,
            lat: cand.pos.lat,
            lng: cand.pos.lng,
            cellId: cand.pos.cellId,
            geodesicDistanceMeters: Math.round(cand.dist),
            estimatedDurationSeconds: Math.round(cand.durationSec),
            routeDistanceMeters: Math.round(effectiveDist),
            routeDurationSeconds: Math.round(fallbackDurationSec),
            finalScore: fallbackDurationSec,
            rank: 0,
            routingFallback: true,
            barrierPenalized: isPenalized,
          };
        }
      });

      const resolved = (await Promise.all(routePromises)).filter((item): item is CandidateScoring => item !== null);
      resolved.sort((a, b) => a.finalScore - b.finalScore);

      const culled = resolved.slice(0, maxResults);
      culled.forEach((item, index) => {
        item.rank = index + 1;
        candidates.push(item);
      });
    } else {
      const culled = tier2Candidates.slice(0, maxResults);
      culled.forEach((cand, index) => {
        const sameCluster = isSameCluster(cand.pos.cellId, query.pickupCellId);
        const effectiveDist = effectiveDistance(cand.pos.cellId, query.pickupCellId, {
          barrierPenaltyMeters: 5000,
        });
        const isPenalized = effectiveDist > cand.dist * 1.2 || !sameCluster;
        const circuity = isPenalized ? 2.5 : 1.6;
        const fallbackDur = (effectiveDist / this.defaultAverageSpeedMps) * circuity;

        candidates.push({
          driverId: cand.pos.driverId,
          lat: cand.pos.lat,
          lng: cand.pos.lng,
          cellId: cand.pos.cellId,
          geodesicDistanceMeters: Math.round(cand.dist),
          estimatedDurationSeconds: Math.round(cand.durationSec),
          routeDistanceMeters: Math.round(effectiveDist),
          routeDurationSeconds: Math.round(fallbackDur),
          finalScore: fallbackDur,
          rank: index + 1,
          routingFallback: true,
          barrierPenalized: isPenalized,
        });
      });
    }

    return candidates;
  }
}
