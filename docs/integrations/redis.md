# TriHex Redis & Distributed Dispatch Integration Guide

This guide documents the distributed mobility architecture, Redis key schemas, atomic Lua lifecycle scripts, and intra-city spatial sharding mechanisms used by the TriHex Mobility Dispatch Engine.

---

## 1. Architectural Overview

Large-scale ride-hailing platforms (Uber, Lyft, Bolt) decouple their spatial storage into two distinct layers:

1. **Durable Persistence Layer (PostgreSQL / CockroachDB)**:
   - Stores user accounts, completed trips, billing records, and audit logs.
   - Indexed via 1D B-Tree scalar intervals (see [PostgreSQL Integration Guide](postgresql.md)).

2. **Ephemeral Telemetry & Dispatch Layer (Redis Cluster / Valkey)**:
   - Ingests high-frequency GPS pings (up to 100,000 updates/sec).
   - Manages real-time driver cell memberships and spatial availability sets.
   - Executes multi-tier candidate retrieval with sub-10ms response times.

---

## 2. Intra-City Spatial Sharding (Redis Cluster)

### The Anti-Pattern: Single-Slot City Keys
A common failure mode in naive geospatial systems is hash-tagging keys by city name:
`{lagos}:cell:4e40000000005ea2`

In Redis Cluster, all keys sharing `{lagos}` map to the exact same hash slot:
$$\text{CRC16}(\text{"lagos"}) \pmod{16384}$$

In a megacity like Lagos (20M+ residents, 100k+ active drivers), this forces:
- All writes, reads, and memory allocations onto a **single Redis shard**.
- The remaining 99% of Redis Cluster nodes remain idle while one CPU core spikes to 100%, causing network timeouts and packet drops.

### The TriHex Solution: Macro-Shard Partitioning
TriHex solves this by deriving an **intra-city spatial shard** from a coarse parent cell at resolution 4:

```
getSpatialShard(cellId, 4)
```

At resolution 4, the globe is divided into 5,120 macro-cells. A metropolitan area naturally spans 2 to 8 distinct macro-cells.

Keys are formatted with compound hash tags:
- Cell Key: `{cityId:spatialShard}:cell:{cellIdHex}`
- Driver Key: `{cityId:spatialShard}:driver:{driverId}`

```typescript
import { formatCellKey, formatDriverKey } from 'trihex';

const cityId = 'lagos';
const cellId = 0x4e40000000005ea2n;

const cellKey = formatCellKey(cityId, cellId);
// -> "{lagos:00000017}:cell:4e40000000005ea2"

const driverKey = formatDriverKey(cityId, 'drv_1001', cellId);
// -> "{lagos:00000017}:driver:drv_1001"
```

**Benefits**:
1. **Cluster Distribution**: Workload distributes across multiple Redis Cluster slots.
2. **Multi-Key Lua Legality**: Because both `cellKey` and `driverKey` share `{lagos:00000017}`, atomic multi-key Lua scripts execute on the same shard without cross-slot errors.
3. **Spatial Locality**: Micro-cells within the same district share the same node, optimizing pipeline batching.

---

## 3. Atomic Driver Migration & Ghost Driver Prevention

A critical problem in mobility dispatch is **ghost driver duplication**:
- Driver moves from Cell A to Cell B.
- If `SREM cellA` and `SADD cellB` are sent as separate commands, a network partition or crash between them leaves the driver indexed in both cells.
- If a late, delayed GPS ping from Cell A arrives after Cell B, the driver is resurrected in Cell A.

### Canonical Lua Script: `MIGRATE_DRIVER_LUA`

TriHex executes atomic cell migration via an authoritative Lua script:

```lua
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
```

### Guarantees:
1. **Monotonic Sequence Enforcement**: If `incoming.version <= existing.version`, the update is rejected with return code `0`. Out-of-order cellular packets cannot move a vehicle backwards.
2. **Authoritative Old Cell Removal**: The old cell is read directly from the stored driver record, not trusted from client headers.
3. **Zero Ghost Drivers**: `SREM`, `SADD`, and `SET` happen atomically in a single Redis event-loop tick.

---

## 4. Offline Removal & Tombstone Lifecycle

When a driver goes offline, closing the app or losing connectivity:
Calling `SREM` followed by `DEL` leaves a window where a queued in-flight GPS packet resurrects the driver.

### Canonical Lua Script: `REMOVE_DRIVER_LUA`

```lua
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
```

A **tombstone record** is written with status `'REMOVED'` and a TTL (default 60 seconds). Any delayed GPS update whose version is less than or equal to the tombstone version is rejected.

---

## 5. Multi-Tier Candidate Dispatch Pipeline

When a rider requests a pickup at coordinate $P$:

```
+-------------------------------------------------------------------------+
|                               PICKUP REQUEST                            |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| TIER 1: High-Recall Spatial Retrieval (Concentric Triangular Disks)      |
|  - Start at radius r=1 around pickup cell.                              |
|  - Expand to r=2, r=3 until candidatePoolSize >= tier1Limit (e.g. 50).   |
|  - Fetch driver positions using pipelined MGET.                         |
|  - Filter by status ('AVAILABLE') and pre-rank by geodesic distance.    |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| TIER 2: Turn-by-Turn Road Network Routing (RouteCostProvider)           |
|  - Call road network engine (OSRM, Valhalla, GraphHopper).              |
|  - Compute true travel distance and driving duration (ETA).             |
|  - Bounded pool: routes top 15-25 candidates to protect routing latency. |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| TIER 3: Multi-Objective Ranking & Dispatch                              |
|  - Rank by route duration (ETA).                                        |
|  - Return top K candidates (e.g. 5) to matching engine.                 |
+-------------------------------------------------------------------------+
```

### TypeScript Usage with ioredis

```typescript
import Redis from 'ioredis';
import { DispatchEngine, TriHex } from 'trihex';

const redis = new Redis.Cluster([
  { host: 'redis-node-1.internal', port: 6379 },
  { host: 'redis-node-2.internal', port: 6379 },
  { host: 'redis-node-3.internal', port: 6379 },
]);

const engine = new DispatchEngine({
  redisClient: redis,
  cellTtlSeconds: 300,
  driverTtlSeconds: 60,
  tombstoneTtlSeconds: 60,
  tier1CandidateLimit: 50,
  tier2CandidateLimit: 5,
});

// Update position from GPS stream
await engine.updateDriverPosition({
  driverId: 'drv_lagos_441',
  lat: 6.4281,
  lng: 3.4219,
  cellId: TriHex.latLngToCell(6.4281, 3.4219, 9),
  cityId: 'lagos',
  version: 42,
  updatedAt: Date.now(),
  status: 'AVAILABLE',
});

// Find candidates for pickup
const candidates = await engine.findCandidates({
  pickup: { lat: 6.4350, lng: 3.4280 },
  pickupCellId: TriHex.latLngToCell(6.4350, 3.4280, 9),
  cityId: 'lagos',
  initialRadius: 1,
  maxRadius: 3,
  maxResults: 5,
});
```
