"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchEngine = exports.InMemoryDriverRegistry = exports.REMOVE_DRIVER_LUA = exports.MIGRATE_DRIVER_LUA = exports.DEFAULT_SHARD_RESOLUTION = void 0;
exports.getSpatialShard = getSpatialShard;
exports.formatCellKey = formatCellKey;
exports.formatDriverKey = formatDriverKey;
const adjacency_1 = require("./adjacency");
const icosahedron_1 = require("./icosahedron");
const serialization_1 = require("./serialization");
const triangle_quadtree_1 = require("./triangle-quadtree");
const validation_1 = require("./validation");
/**
 * Shard resolution for spatial partitioning (e.g. res 4 divides Earth into ~5,120 spatial macro-shards).
 * Distributes megacity spatial cells across multiple Redis Cluster slots.
 */
exports.DEFAULT_SHARD_RESOLUTION = 4;
/**
 * Generates an intra-city spatial shard identifier from a cell's coarse parent.
 */
function getSpatialShard(cellId, shardResolution = exports.DEFAULT_SHARD_RESOLUTION) {
    const parent = (0, triangle_quadtree_1.cellToParent)(cellId, shardResolution);
    return (0, serialization_1.cellToString)(parent).substring(8, 16);
}
/**
 * Generates a Redis cluster-safe hash-tagged key for a spatial cell.
 * Format: {market:shard}:cell:{cellIdHex}
 * Spatially distributes different parts of a city across all 16,384 Redis Cluster slots.
 */
function formatCellKey(cityId, cellId, shardResolution = exports.DEFAULT_SHARD_RESOLUTION) {
    const shard = getSpatialShard(cellId, shardResolution);
    const hex = (0, serialization_1.cellToString)(cellId);
    return `{${cityId}:${shard}}:cell:${hex}`;
}
/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {market:shard}:driver:{driverId}
 */
function formatDriverKey(cityId, driverId, cellId, shardResolution = exports.DEFAULT_SHARD_RESOLUTION) {
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
exports.MIGRATE_DRIVER_LUA = `
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
    redis.call("SREM", oldCellKey, driverId)
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
exports.REMOVE_DRIVER_LUA = `
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
    redis.call("SREM", cellKey, driverId)
  end
end

redis.call("SET", driverPosKey, tombstonePayload, "EX", tombstoneTtl)
return 1
`;
/**
 * In-memory fallback driver store supporting atomic versioned transitions and tombstones
 */
class InMemoryDriverRegistry {
    cellDrivers = new Map();
    driverPositions = new Map();
    getDriverCanonicalKey(cityId, driverId) {
        return `${cityId}:${driverId}`;
    }
    update(pos) {
        const canonicalKey = this.getDriverCanonicalKey(pos.cityId, pos.driverId);
        const existing = this.driverPositions.get(canonicalKey);
        if (existing && existing.version >= pos.version) {
            return false; // Stale or duplicate
        }
        const newCellKey = formatCellKey(pos.cityId, pos.cellId);
        if (existing && existing.cellKey && existing.cellKey !== newCellKey) {
            this.cellDrivers.get(existing.cellKey)?.delete(pos.driverId);
        }
        if (!this.cellDrivers.has(newCellKey)) {
            this.cellDrivers.set(newCellKey, new Set());
        }
        this.cellDrivers.get(newCellKey).add(pos.driverId);
        this.driverPositions.set(canonicalKey, { ...pos, cellKey: newCellKey });
        return true;
    }
    remove(cityId, driverId, currentCellId, version) {
        const canonicalKey = this.getDriverCanonicalKey(cityId, driverId);
        const existing = this.driverPositions.get(canonicalKey);
        const tombstoneVer = version ?? (existing ? existing.version + 1 : 1);
        if (existing && existing.version > tombstoneVer) {
            return false;
        }
        if (existing && existing.cellKey) {
            this.cellDrivers.get(existing.cellKey)?.delete(driverId);
        }
        else if (currentCellId !== undefined) {
            const cellKey = formatCellKey(cityId, currentCellId);
            this.cellDrivers.get(cellKey)?.delete(driverId);
        }
        this.driverPositions.set(canonicalKey, {
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
    getDriversInCell(cellKey) {
        return Array.from(this.cellDrivers.get(cellKey) ?? []);
    }
    getDriverPosition(driverKey) {
        let pos = this.driverPositions.get(driverKey);
        if (!pos) {
            const match = driverKey.match(/\{([^:]+):[^}]+\}:driver:(.+)/);
            if (match) {
                pos = this.driverPositions.get(`${match[1]}:${match[2]}`);
            }
        }
        if (!pos || pos.status === 'REMOVED' || pos.status === 'OFFLINE')
            return null;
        return pos;
    }
    clear() {
        this.cellDrivers.clear();
        this.driverPositions.clear();
    }
}
exports.InMemoryDriverRegistry = InMemoryDriverRegistry;
/**
 * Production-grade Multi-Tier Mobility Dispatch Engine.
 *
 * Tier 1: High-recall spatial retrieval over expanding triangular disks with intra-city sharding.
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla matrix) on route-feasible candidate pool.
 * Tier 3: Multi-objective dispatch ranking (ETA, distance).
 */
class DispatchEngine {
    redis;
    inMemory = new InMemoryDriverRegistry();
    routeCostProvider;
    cellTtl;
    driverTtl;
    tombstoneTtl;
    defaultAverageSpeedMps;
    tier1Limit;
    tier2Limit;
    maxCells;
    constructor(options = {}) {
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
    }
    /**
     * Updates driver position atomically with authoritative monotonic version protection.
     * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
     */
    async updateDriverPosition(position) {
        (0, validation_1.validateCoordinates)(position.lat, position.lng);
        (0, validation_1.validateCellId)(position.cellId);
        const version = position.version !== undefined ? position.version : (position.updatedAt ?? Date.now());
        if (!Number.isFinite(version) || version < 0) {
            throw new TypeError(`version must be a non-negative number, received ${position.version}`);
        }
        const effectivePos = { ...position, version };
        const newCellKey = formatCellKey(position.cityId, position.cellId);
        const driverKey = formatDriverKey(position.cityId, position.driverId, position.cellId);
        const payload = JSON.stringify({
            ...effectivePos,
            cellId: position.cellId.toString(),
            cellKey: newCellKey,
        });
        if (this.redis) {
            const res = await this.redis.eval(exports.MIGRATE_DRIVER_LUA, 2, newCellKey, driverKey, position.driverId, this.cellTtl, this.driverTtl, payload);
            return res === 1;
        }
        else {
            return this.inMemory.update(effectivePos);
        }
    }
    /**
     * Atomically removes a driver when they go offline, writing a tombstone to prevent resurrection.
     */
    async removeDriver(cityId, driverId, currentCellId, version) {
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
            const res = await this.redis.eval(exports.REMOVE_DRIVER_LUA, 1, driverKey, driverId, this.tombstoneTtl, tombstonePayload);
            return res === 1;
        }
        else {
            return this.inMemory.remove(cityId, driverId, currentCellId, tombstoneVersion);
        }
    }
    /**
     * Retrieves raw driver position by ID.
     */
    async getDriverPosition(cityId, driverId, cellId) {
        const driverKey = formatDriverKey(cityId, driverId, cellId);
        if (this.redis) {
            const raw = await this.redis.get(driverKey);
            if (!raw)
                return null;
            try {
                const parsed = JSON.parse(raw);
                if (parsed.status === 'REMOVED' || parsed.status === 'OFFLINE')
                    return null;
                return {
                    ...parsed,
                    cellId: BigInt(parsed.cellId),
                };
            }
            catch {
                return null;
            }
        }
        else {
            return this.inMemory.getDriverPosition(driverKey);
        }
    }
    /**
     * Retrieves all driver IDs currently indexed in a spatial cell.
     */
    async getDriversInCell(cityId, cellId) {
        const cellKey = formatCellKey(cityId, cellId);
        if (this.redis) {
            return await this.redis.smembers(cellKey);
        }
        else {
            return this.inMemory.getDriversInCell(cellKey);
        }
    }
    /**
     * Finds, ranks, and dispatches the optimal drivers for a pickup request using 3-Tier dispatch.
     */
    async findCandidates(query) {
        (0, validation_1.validateCoordinates)(query.pickup.lat, query.pickup.lng);
        (0, validation_1.validateCellId)(query.pickupCellId);
        const initialRadius = query.initialRadius ?? 1;
        const maxRadius = query.maxRadius ?? 3;
        const requiredStatus = query.requiredStatus ?? 'AVAILABLE';
        const maxResults = query.maxResults ?? this.tier2Limit;
        // Collect candidate driver IDs across expanding concentric triangular rings (avoiding duplicate ring scans)
        const seenDriverIds = new Set();
        const seenCells = new Set();
        const candidateIds = [];
        for (let r = initialRadius; r <= maxRadius; r++) {
            const ringCells = (0, adjacency_1.cellDisk)(query.pickupCellId, r);
            for (const cell of ringCells) {
                const cKey = cell.toString();
                if (seenCells.has(cKey))
                    continue;
                seenCells.add(cKey);
                if (seenCells.size > this.maxCells)
                    break;
                const cellKey = formatCellKey(query.cityId, cell);
                let driversInCell = [];
                if (this.redis) {
                    driversInCell = await this.redis.smembers(cellKey);
                }
                else {
                    driversInCell = this.inMemory.getDriversInCell(cellKey);
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
        const activeCandidates = [];
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
            const dist = (0, icosahedron_1.geodesicDistance)({ lat: cand.lat, lng: cand.lng }, query.pickup);
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
        const candidates = [];
        if (this.routeCostProvider) {
            const routePromises = tier2Candidates.map(async (cand) => {
                try {
                    const cost = await this.routeCostProvider.getRouteCost({ lat: cand.pos.lat, lng: cand.pos.lng }, query.pickup);
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
                }
                catch {
                    // Fallback to Tier 1 estimate if routing fails
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
            const culled = resolved.slice(0, maxResults);
            culled.forEach((item, index) => {
                item.rank = index + 1;
                candidates.push(item);
            });
        }
        else {
            const culled = tier2Candidates.slice(0, maxResults);
            culled.forEach((cand, index) => {
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
exports.DispatchEngine = DispatchEngine;
