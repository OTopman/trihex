"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchEngine = exports.InMemoryDriverRegistry = exports.MIGRATE_DRIVER_LUA = void 0;
exports.formatCellKey = formatCellKey;
exports.formatDriverKey = formatDriverKey;
const hex_dual_1 = require("./hex-dual");
const network_metric_1 = require("./network-metric");
const serialization_1 = require("./serialization");
/**
 * Atomic Redis Lua script for driver cell migration.
 *
 * Atomically accepts only non-stale driver updates, removes membership from the
 * authoritative previous cell, adds the new membership, refreshes TTLs, and
 * records the new position. The previous cell is read from the stored record;
 * it is never trusted from a caller-provided oldCellId.
 */
exports.MIGRATE_DRIVER_LUA = `
local newCellKey = KEYS[1]
local driverPosKey = KEYS[2]
local driverId = ARGV[1]
local cellTtl = tonumber(ARGV[2])
local driverTtl = tonumber(ARGV[3])
local payload = ARGV[4]
local incoming = cjson.decode(payload)
local existingRaw = redis.call("GET", driverPosKey)

if existingRaw then
  local existing = cjson.decode(existingRaw)
  if tonumber(existing.updatedAt) > tonumber(incoming.updatedAt) then
    return 0
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
function formatCellKey(cityId, cellId) {
    const hex = (0, serialization_1.cellToString)(cellId);
    return `{${cityId}}:cell:${hex}`;
}
/**
 * Generates a Redis cluster-safe hash-tagged key for a driver's position record.
 * Format: {cityId}:driver:{driverId}
 */
function formatDriverKey(cityId, driverId) {
    return `{${cityId}}:driver:${driverId}`;
}
/**
 * In-memory fallback driver store when running locally or without Redis
 */
class InMemoryDriverRegistry {
    cellDrivers = new Map();
    driverPositions = new Map();
    update(pos, oldCellId) {
        const current = this.driverPositions.get(formatDriverKey(pos.cityId, pos.driverId));
        if (current && current.updatedAt > pos.updatedAt) {
            return;
        }
        const authoritativeOldCellId = current?.cellId ?? oldCellId;
        if (authoritativeOldCellId !== undefined && authoritativeOldCellId !== pos.cellId) {
            const oldKey = formatCellKey(pos.cityId, authoritativeOldCellId);
            this.cellDrivers.get(oldKey)?.delete(pos.driverId);
        }
        const newKey = formatCellKey(pos.cityId, pos.cellId);
        if (!this.cellDrivers.has(newKey)) {
            this.cellDrivers.set(newKey, new Set());
        }
        this.cellDrivers.get(newKey).add(pos.driverId);
        const driverKey = formatDriverKey(pos.cityId, pos.driverId);
        this.driverPositions.set(driverKey, { ...pos });
    }
    remove(cityId, driverId, currentCellId) {
        if (currentCellId !== undefined) {
            const cellKey = formatCellKey(cityId, currentCellId);
            this.cellDrivers.get(cellKey)?.delete(driverId);
        }
        const driverKey = formatDriverKey(cityId, driverId);
        this.driverPositions.delete(driverKey);
    }
    getDriversInCell(cellKey) {
        return Array.from(this.cellDrivers.get(cellKey) ?? []);
    }
    getDriverPosition(driverKey) {
        return this.driverPositions.get(driverKey) ?? null;
    }
    clear() {
        this.cellDrivers.clear();
        this.driverPositions.clear();
    }
}
exports.InMemoryDriverRegistry = InMemoryDriverRegistry;
/**
 * Production-grade Two-Tier Mobility Dispatch Engine
 *
 * Tier 1: In-memory Haversine geodesic distance pre-filtering and candidate culling (N -> K).
 * Tier 2: Turn-by-turn road network routing (OSRM/Valhalla) on top K candidates.
 */
class DispatchEngine {
    redis;
    inMemory = new InMemoryDriverRegistry();
    routeCostProvider;
    cellTtl;
    driverTtl;
    defaultAverageSpeedMps;
    tier1Limit;
    tier2Limit;
    constructor(options = {}) {
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
    async updateDriverPosition(position, oldCellId) {
        if (!Number.isFinite(position.updatedAt)) {
            throw new TypeError(`updatedAt must be a finite timestamp, received ${position.updatedAt}`);
        }
        const newCellKey = formatCellKey(position.cityId, position.cellId);
        const driverKey = formatDriverKey(position.cityId, position.driverId);
        const payload = JSON.stringify({
            ...position,
            cellId: position.cellId.toString(),
            cellKey: newCellKey,
        });
        if (this.redis) {
            await this.redis.eval(exports.MIGRATE_DRIVER_LUA, 2, newCellKey, driverKey, position.driverId, this.cellTtl, this.driverTtl, payload);
        }
        else {
            this.inMemory.update(position, oldCellId);
        }
    }
    /**
     * Removes a driver when they go offline.
     */
    async removeDriver(cityId, driverId, currentCellId) {
        const driverKey = formatDriverKey(cityId, driverId);
        if (this.redis) {
            if (currentCellId !== undefined) {
                const cellKey = formatCellKey(cityId, currentCellId);
                await this.redis.srem(cellKey, driverId);
            }
            await this.redis.del(driverKey);
        }
        else {
            this.inMemory.remove(cityId, driverId, currentCellId);
        }
    }
    /**
     * Retrieves raw driver position by ID.
     */
    async getDriverPosition(cityId, driverId) {
        const driverKey = formatDriverKey(cityId, driverId);
        if (this.redis) {
            const raw = await this.redis.get(driverKey);
            if (!raw)
                return null;
            try {
                const parsed = JSON.parse(raw);
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
     * Finds, ranks, and dispatches the optimal drivers for a pickup request using 2-Tier dispatch.
     */
    async findCandidates(query) {
        const initialRadius = query.initialRadius ?? 1;
        const maxRadius = query.maxRadius ?? 3;
        const requiredStatus = query.requiredStatus ?? 'AVAILABLE';
        const maxResults = query.maxResults ?? this.tier2Limit;
        // Collect candidate driver IDs across concentric triangular graph disks.
        const seenDriverIds = new Set();
        const candidateIds = [];
        for (let r = initialRadius; r <= maxRadius; r++) {
            const ringCells = (0, hex_dual_1.cellDisk)(query.pickupCellId, r);
            // Collect drivers in these ring cells
            for (const cell of ringCells) {
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
        const activeCandidates = [];
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
        const tier1Scored = [];
        for (const cand of activeCandidates) {
            const dist = (0, network_metric_1.geodesicDistance)({ lat: cand.lat, lng: cand.lng }, query.pickup);
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
        const candidates = [];
        if (this.routeCostProvider) {
            // Query route cost provider in parallel
            const routePromises = topK.map(async (cand) => {
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
        }
        else {
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
exports.DispatchEngine = DispatchEngine;
