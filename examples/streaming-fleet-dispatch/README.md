# TriHex Streaming Fleet Dispatch Reference Architecture

A turnkey, production-grade reference architecture demonstrating how high-throughput mobility and logistics platforms (e.g., Uber, Lyft, DoorDash, Bolt) ingest high-frequency vehicle telemetry and execute real-time ride dispatch using the **TriHex Discrete Global Grid System (DGGS)**.

---

## 1. System Architecture

```
                                  [ Fleet GPS Pings ]
                             (10,000+ Simulated Drivers)
                                         │
                                         ▼
                            ┌─────────────────────────┐
                            │ Redpanda / Kafka Broker │
                            │ Topic: driver-telemetry │
                            └────────────┬────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       ┌────────────────────────┐                 ┌────────────────────────┐
       │ Ingestion Worker #1    │                 │ Ingestion Worker #2    │
       │  - trihex.latLngToCell │                 │  - trihex.latLngToCell │
       │  - getSpatialShard(R4) │                 │  - getSpatialShard(R4) │
       │  - MIGRATE_DRIVER_LUA  │                 │  - MIGRATE_DRIVER_LUA  │
       └───────────┬────────────┘                 └───────────┬────────────┘
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         ▼
                 ┌───────────────────────────────────────────────┐
                 │          Redis Cluster (3 Nodes)              │
                 │   - Macro-sharded keys {market:shard}:cell    │
                 │   - Atomic TTL expiration & tombstones        │
                 └───────────────────────▲───────────────────────┘
                                         │
                                         │ hexRing(rider_cell, k)
                                         │
                              ┌────────────────────┐
                              │ Dispatch API       │ ◄─── POST /api/v1/dispatch
                              │ Two-Tier Pipeline  │      (Rider Lat, Lng)
                              │  1. Geodesic filter│
                              │  2. OSRM routing   │
                              └────────────────────┘
```

---

## 2. Core Architectural Pillars

### Pillar A: Intra-City Spatial Macro-Sharding (Solving the Hotspot Problem)
Naive geospatial clustering uses `{cityId}:cell:{cellId}`. In Redis Cluster, all keys sharing `{cityId}` hash to the exact same slot ($\text{CRC16}(\text{"lagos"}) \pmod{16384}$), saturating a single CPU core while other cluster nodes sit idle.

TriHex solves this by deriving an **intra-city spatial shard** from a coarse parent cell at resolution 4:
```typescript
import { latLngToCell, getSpatialShard, formatCellKey } from 'trihex';

const cellId = latLngToCell(6.5244, 3.3792, 10);
const shard = getSpatialShard(cellId, 4); // "00000017"
const cellKey = formatCellKey('lagos', cellId, 4);
// -> "{lagos:00000017}:cell:4e80000000017a86"
```
- Distributes a megacity across 2 to 8 distinct Redis Cluster slots.
- Ensures all atomic multi-key Lua commands (`driverKey` and `cellKey`) share the exact same `{cityId:shard}` hash tag, executing legal cluster transactions without `CROSSSLOT` errors.

### Pillar B: Atomic Monotonic Cell Migration (Eliminating Ghost Drivers)
Vehicles frequently cross cell boundaries. Under network jitter, delayed GPS packets can arrive out of order, causing "ghost" resurrecting drivers:
1. TriHex encodes an authoritative monotonic `version` integer (or epoch timestamp) into each telemetry payload.
2. The atomic `MIGRATE_DRIVER_LUA` script checks:
   $$\text{incomingVersion} > \text{existingVersion}$$
   - If stale or duplicate, the packet is rejected without mutating state.
   - If valid, the driver is atomically removed from their old cell (`SREM`) and registered in the new cell (`SADD`).

### Pillar C: Two-Tier Candidate Retrieval & Barrier Detour Scoring
Ride requests shouldn't match across uncrossable physical barriers (such as waterways or highways without bridges).
- **Tier 1 (Spatial Filter)**: TriHex generates candidate concentric rings via `cellDisk(pickupCellId, radius)`. Disconnected topological clusters are rejected or penalized.
- **Tier 2 (Road Network Scoring)**: Candidates passing Tier 1 are scored using road-network turn-by-turn routing and ETA regret minimization.

---

## 3. Quickstart & Demonstration

### Option 1: Standalone In-Memory Benchmark (Zero Dependencies Required)
You can run the full streaming simulation harness immediately without needing Docker or Redis installed locally:

```bash
npm run demo
```

**Benchmark Results on Apple Silicon / Standard VM:**
```
======================================================================
🚀 TRIHEX STREAMING FLEET DISPATCH REFERENCE ARCHITECTURE BENCHMARK
======================================================================

[Simulator] Initialized fleet of 2500 vehicles.
[Cluster] Partitioning keys using TriHex Macro-Shards (Resolution 4).

--- STREAM INGESTION RESULTS ---
✓ Total Pings Ingested:        12,500
✓ Ingestion Throughput:        55,989 pings/sec
✓ Successful Cell Migrations:  12,192
✓ Stale/Out-of-Order Rejected: 308 (Monotonic Sequence Guard)
✓ Macro-Shards Distributed:    2 shards (00000017, 00000014)
✓ Zero Ghost Drivers:          Verified (100% atomic cleanup in old cell)

--- TWO-TIER RIDE DISPATCH PERFORMANCE ---
✓ Total Dispatch Requests:     500
✓ p50 Dispatch Latency:        1.22 ms
✓ p95 Dispatch Latency:        1.87 ms
✓ p99 Dispatch Latency:        2.79 ms

--- SAMPLE DISPATCH INSPECTION (VICTORIA ISLAND RIDER) ---
Rider Cell: 4e80000000017a86 | Searched Cells: 10
  [Rank 1] Driver: drv_lagos_10985 | Geodesic: 391m | Road Dist: 420m | ETA: 47s
  [Rank 2] Driver: drv_lagos_12344 | Geodesic: 422m | Road Dist: 450m | ETA: 51s
  [Rank 3] Driver: drv_lagos_11894 | Geodesic: 428m | Road Dist: 460m | ETA: 51s

======================================================================
🏆 STREAMING REFERENCE ARCHITECTURE VALIDATED WITH ZERO DEFECTS!
======================================================================
```

---

### Option 2: Turnkey Docker Compose Stack
Spins up Redpanda (Kafka-compatible event broker), 3-node Redis 7 Cluster, Telemetry Simulator, Ingestion Worker, and Dispatch API:

```bash
docker compose up -d
```

Check cluster status:
```bash
docker compose ps
docker compose logs -f stream-worker
```

Submit a ride dispatch query to the API:
```bash
curl -X POST http://localhost:8080/api/v1/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "cityId": "lagos",
    "riderLat": 6.4281,
    "riderLng": 3.4219,
    "radiusCells": 2,
    "maxCandidates": 5
  }'
```

---

### Option 3: Production Kubernetes Deployment
Deploy the reference architecture to any Kubernetes cluster (EKS, GKE, AKS):

```bash
kubectl apply -f k8s/redis-cluster.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/api-deployment.yaml
```

The `trihex-stream-worker` deployment automatically scales from 2 to 16 replicas via Horizontal Pod Autoscaler (`trihex-stream-worker-hpa`) based on streaming workload.
