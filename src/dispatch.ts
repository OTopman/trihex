import { hexRing } from './hex-dual';
import { geodesicDistance } from './network-metric';
import { cellToString } from './serialization';
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
  getRouteCost(
    origin: GeoCoord,
    destination: GeoCoord
  ): Promise<{ distanceMeters: number; durationSeconds: number }>;
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
export const MIGRATE_DRIVER_LUA = `
local oldCellKey = KEYS[1]
local newCellKey = KEYS[2]
local driverPosKey = KEYS[3]
local driverId = ARGV[1]
local cellTtl = tonumber(ARGV[2])
local driverTtl = tonumber(ARGV[3])
local payload = ARGV[4]

if oldCellKey and oldCellKey ~= "" and oldCellKey ~= newCellKey then
  redis.call("SREM", oldCellKey, driverId)
end

redis.call("SADD", newCellKey, driverId)
if cellTtl and cellTtl > 0 then
  redis.call("EXPIRE", newCellKey, cellTtl)
end

if payload and payload ~= "" then
  redis.call("SET", driverPosKey, payload, "EX", driverTtl)
else
  redis.call("SET", driverPosKey, newCellKey, "EX", driverTtl)
end

return 1
`;

/**
 * Generates a Redis cluster-safe hash-tagged key for a spatial cell.
 * Format: {cityId}:cell:{cellIdHex}
 * The curly braces ensure all cells and drivers in the same city hash to the same Redis slot.
 */
export function formatCellKey(cityId: string, cellId: TriHexId): string {
  const hex = cellToString(cellId);
  return `{${cityId}}:cell:${hex}`;
}

/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {cityId}:driver:{driverId}
 */
export function formatDriverKey(cityId: string, driverId: string): string {
  return `{${cityId}}:driver:${driverId}`;
}

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
export class InMemoryDriverRegistry {
  private readonly cellDrivers = new Map<string, Set<string>>();
  private readonly driverPositions = new Map<string, DriverPosition>();

  public update(pos: DriverPosition, oldCellId?: TriHexId): void {
    if (oldCellId !== undefined && oldCellId !== pos.cellId) {
      const oldKey = formatCellKey(pos.cityId, oldCellId);
      this.cellDrivers.get(oldKey)?.delete(pos.driverId);
    }

    const newKey = formatCellKey(pos.cityId, pos.cellId);
    if (!this.cellDrivers.has(newKey)) {
      this.cellDrivers.set(newKey, new Set());
    }
    this.cellDrivers.get(newKey)!.add(pos.driverId);

    const driverKey = formatDriverKey(pos.cityId, pos.driverId);
    this.driverPositions.set(driverKey, { ...pos });
  }

  public remove(cityId: string, driverId: string, currentCellId?: TriHexId): void {
    if (currentCellId !== undefined) {
      const cellKey = formatCellKey(cityId, currentCellId);
      this.cellDrivers.get(cellKey)?.delete(driverId);
    }
    const driverKey = formatDriverKey(cityId, driverId);
    this.driverPositions.delete(driverKey);
  }

  public getDriversInCell(cellKey: string): string[] {
    return Array.from(this.cellDrivers.get(cellKey) ?? []);
  }

  public getDriverPosition(driverKey: string): DriverPosition | null {
    return this.driverPositions.get(driverKey) ?? null;
  }

  public clear(): void {
    this.cellDrivers.clear();
    this.driverPositions.clear();
  }
}

/**
 * Production-grade Two-Tier Mobility Dispatch Engine
 *
 * Tier 1: In-memory Haversine geodesic distance pre-filtering and candidate culling (N -> K).
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla) on top K candidates.
 */
export class DispatchEngine {
  private readonly redis?: RedisCommandClient;
  private readonly inMemory = new InMemoryDriverRegistry();
  private readonly routeCostProvider?: RouteCostProvider;
  private readonly cellTtl: number;
  private readonly driverTtl: number;
  private readonly defaultAverageSpeedMps: number;
  private readonly tier1Limit: number;
  private readonly tier2Limit: number;

  constructor(options: DispatchEngineOptions = {}) {
    this.redis = options.redisClient;
    this.routeCostProvider = options.routeCostProvider;
    this.cellTtl = options.cellTtlSeconds ?? 300; // 5 minutes
    this.driverTtl = options.driverTtlSeconds ?? 60; // 1 minute
    const speedKmh = options.defaultAverageSpeedKmh ?? 30; // 30 km/h average urban speed
    this.defaultAverageSpeedMps = (speedKmh * 1000) / 3600;
    this.tier1Limit = options.tier1CandidateLimit ?? 50;
    this.tier2Limit = options.tier2CandidateLimit ?? 5;
  }

  /**
   * Updates driver position atomically.
   * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
   */
  public async updateDriverPosition(
    position: DriverPosition,
    oldCellId?: TriHexId
  ): Promise<void> {
    const newCellKey = formatCellKey(position.cityId, position.cellId);
    const oldCellKey = oldCellId !== undefined ? formatCellKey(position.cityId, oldCellId) : '';
    const driverKey = formatDriverKey(position.cityId, position.driverId);
    const payload = JSON.stringify({
      ...position,
      cellId: position.cellId.toString(),
    });

    if (this.redis) {
      await this.redis.eval(
        MIGRATE_DRIVER_LUA,
        3,
        oldCellKey,
        newCellKey,
        driverKey,
        position.driverId,
        this.cellTtl,
        this.driverTtl,
        payload
      );
    } else {
      this.inMemory.update(position, oldCellId);
    }
  }

  /**
   * Removes a driver when they go offline.
   */
  public async removeDriver(
    cityId: string,
    driverId: string,
    currentCellId?: TriHexId
  ): Promise<void> {
    const driverKey = formatDriverKey(cityId, driverId);

    if (this.redis) {
      if (currentCellId !== undefined) {
        const cellKey = formatCellKey(cityId, currentCellId);
        await this.redis.srem(cellKey, driverId);
      }
      await this.redis.del(driverKey);
    } else {
      this.inMemory.remove(cityId, driverId, currentCellId);
    }
  }

  /**
   * Retrieves raw driver position by ID.
   */
  public async getDriverPosition(
    cityId: string,
    driverId: string
  ): Promise<DriverPosition | null> {
    const driverKey = formatDriverKey(cityId, driverId);

    if (this.redis) {
      const raw = await this.redis.get(driverKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
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
   * Finds, ranks, and dispatches the optimal drivers for a pickup request using 2-Tier dispatch.
   */
  public async findCandidates(query: CandidateQuery): Promise<CandidateScoring[]> {
    const initialRadius = query.initialRadius ?? 1;
    const maxRadius = query.maxRadius ?? 3;
    const requiredStatus = query.requiredStatus ?? 'AVAILABLE';
    const maxResults = query.maxResults ?? this.tier2Limit;

    // Collect candidate driver IDs across concentric hex rings
    const seenDriverIds = new Set<string>();
    const candidateIds: string[] = [];

    for (let r = initialRadius; r <= maxRadius; r++) {
      const ringCells = hexRing(query.pickupCellId, r);

      // Collect drivers in these ring cells
      for (const cell of ringCells) {
        const cellKey = formatCellKey(query.cityId, cell);
        let driversInCell: string[] = [];

        if (this.redis) {
          driversInCell = await this.redis.smembers(cellKey);
        } else {
          driversInCell = this.inMemory.getDriversInCell(cellKey);
        }

        for (const dId of driversInCell) {
          if (!seenDriverIds.has(dId)) {
            seenDriverIds.add(dId);
            candidateIds.push(dId);
          }
        }
      }

      // If we have collected enough candidates for Tier 1 culling, break early
      if (candidateIds.length >= this.tier1Limit) {
        break;
      }
    }

    if (candidateIds.length === 0) {
      return [];
    }

    // Fetch full position records for candidate drivers
    const activeCandidates: DriverPosition[] = [];
    for (const dId of candidateIds) {
      const pos = await this.getDriverPosition(query.cityId, dId);
      if (pos && (pos.status === undefined || pos.status === requiredStatus)) {
        activeCandidates.push(pos);
      }
    }

    if (activeCandidates.length === 0) {
      return [];
    }

    // ==========================================
    // TIER 1: In-Memory Haversine Geodesic Pre-Ranking
    // ==========================================
    const tier1Scored: {
      pos: DriverPosition;
      dist: number;
      durationSec: number;
    }[] = [];

    for (const cand of activeCandidates) {
      const dist = geodesicDistance(
        { lat: cand.lat, lng: cand.lng },
        query.pickup
      );
      const durationSec = dist / this.defaultAverageSpeedMps;
      tier1Scored.push({ pos: cand, dist, durationSec });
    }

    // Sort by estimated free-flow duration / distance ascending
    tier1Scored.sort((a, b) => a.durationSec - b.durationSec);

    // Cull to top K candidates for expensive Tier 2 road network calculation
    const topK = tier1Scored.slice(0, Math.min(this.tier2Limit, maxResults));

    // ==========================================
    // TIER 2: Turn-by-Turn Road Network Routing
    // ==========================================
    const candidates: CandidateScoring[] = [];

    if (this.routeCostProvider) {
      // Query route cost provider in parallel
      const routePromises = topK.map(async (cand) => {
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
          };
        } catch {
          // Fallback to Tier 1 estimate if routing engine fails/times out
          return {
            driverId: cand.pos.driverId,
            lat: cand.pos.lat,
            lng: cand.pos.lng,
            cellId: cand.pos.cellId,
            geodesicDistanceMeters: Math.round(cand.dist),
            estimatedDurationSeconds: Math.round(cand.durationSec),
            finalScore: cand.durationSec,
            rank: 0,
          };
        }
      });

      const resolved = await Promise.all(routePromises);
      resolved.sort((a, b) => a.finalScore - b.finalScore);

      resolved.forEach((item, index) => {
        item.rank = index + 1;
        candidates.push(item);
      });
    } else {
      // Without Tier 2 routing provider, use Tier 1 geodesic metrics
      topK.forEach((cand, index) => {
        candidates.push({
          driverId: cand.pos.driverId,
          lat: cand.pos.lat,
          lng: cand.pos.lng,
          cellId: cand.pos.cellId,
          geodesicDistanceMeters: Math.round(cand.dist),
          estimatedDurationSeconds: Math.round(cand.durationSec),
          finalScore: cand.durationSec,
          rank: index + 1,
        });
      });
    }

    return candidates;
  }
}
