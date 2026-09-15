import {
  CandidateScoring,
  DispatchEngine,
  formatCellKey,
  formatDriverKey,
  MIGRATE_DRIVER_LUA,
  RedisCommandClient,
  RouteCostProvider,
  TriHex,
} from '../src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

/**
 * Mock in-memory Redis client implementing RedisCommandClient
 * to verify Lua script semantics, TTL behavior, and Cluster key conventions.
 */
class MockRedisClient implements RedisCommandClient {
  public readonly sets = new Map<string, Set<string>>();
  public readonly kvs = new Map<string, { value: string; expireAt?: number }>();
  public readonly ttls = new Map<string, number>();

  public async eval(
    script: string,
    _numkeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    // Assert script is the canonical migration script
    assert(script === MIGRATE_DRIVER_LUA, 'Script must match MIGRATE_DRIVER_LUA');
    const newCellKey = String(args[0] ?? '');
    const driverPosKey = String(args[1] ?? '');
    const driverId = String(args[2] ?? '');
    const cellTtl = Number(args[3] ?? 0);
    const driverTtl = Number(args[4] ?? 0);
    const payload = String(args[5] ?? '');
    const incoming = JSON.parse(payload) as { updatedAt: number };

    // Execute atomic Lua logic:
    const existing = this.kvs.get(driverPosKey);
    if (existing) {
      const previous = JSON.parse(existing.value) as { updatedAt: number; cellKey?: string };
      if (previous.updatedAt > incoming.updatedAt) return 0;
      if (previous.cellKey && previous.cellKey !== newCellKey) {
        this.sets.get(previous.cellKey)?.delete(driverId);
      }
    }

    if (!this.sets.has(newCellKey)) {
      this.sets.set(newCellKey, new Set());
    }
    this.sets.get(newCellKey)!.add(driverId);

    if (cellTtl > 0) {
      this.ttls.set(newCellKey, cellTtl);
    }

    this.kvs.set(driverPosKey, {
      value: payload || newCellKey,
      expireAt: driverTtl > 0 ? Date.now() + driverTtl * 1000 : undefined,
    });

    return 1;
  }

  public async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    let added = 0;
    for (const m of members) {
      if (!this.sets.get(key)!.has(m)) {
        this.sets.get(key)!.add(m);
        added++;
      }
    }
    return added;
  }

  public async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) {
      if (set.delete(m)) removed++;
    }
    return removed;
  }

  public async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  public async get(key: string): Promise<string | null> {
    const entry = this.kvs.get(key);
    if (!entry) return null;
    if (entry.expireAt && Date.now() > entry.expireAt) {
      this.kvs.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: string): Promise<unknown> {
    this.kvs.set(key, { value });
    return 'OK';
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.kvs.delete(k) || this.sets.delete(k)) count++;
    }
    return count;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    this.ttls.set(key, seconds);
    return 1;
  }
}

async function runDispatchTests() {
  console.log('🚗 Starting TriHex Distributed Mobility Dispatch Test Suite...\n');

  // =========================================================================
  // TEST 1: Redis Cluster Hash-Tagging & Key Schema
  // =========================================================================
  console.log('▶ Test 1: Redis Cluster Hash-Tagging & Key Schema');
  const cityId = 'lagos';
  const sampleCell = TriHex.latLngToCell(6.4281, 3.4219, 9);
  const cellKey = formatCellKey(cityId, sampleCell);
  const driverKey = formatDriverKey(cityId, 'drv_1001');

  assert(cellKey.startsWith('{lagos}:cell:'), `Cell key must be hash-tagged with {cityId}: ${cellKey}`);
  assert(driverKey === '{lagos}:driver:drv_1001', `Driver key must be hash-tagged with {cityId}: ${driverKey}`);

  // Verify hash-tag extraction: both must yield exact same hash tag "lagos"
  const tagCell = cellKey.substring(cellKey.indexOf('{') + 1, cellKey.indexOf('}'));
  const tagDriver = driverKey.substring(driverKey.indexOf('{') + 1, driverKey.indexOf('}'));
  assert(
    tagCell === 'lagos' && tagDriver === 'lagos',
    'Both cell and driver keys must share identical cluster hash tags'
  );
  console.log(`  ✓ Cluster keys correctly hash-tagged: ${cellKey} & ${driverKey}`);

  // =========================================================================
  // TEST 2: Atomic Lua Driver Cell Migration & Ghost Driver Elimination
  // =========================================================================
  console.log('\n▶ Test 2: Atomic Lua Driver Migration (Ghost Elimination)');
  const mockRedis = new MockRedisClient();
  const dispatchWithRedis = new DispatchEngine({
    redisClient: mockRedis,
    cellTtlSeconds: 300,
    driverTtlSeconds: 60,
  });

  const cellA = TriHex.latLngToCell(6.4281, 3.4219, 9); // Victoria Island
  const neighbors = TriHex.getCellNeighbors(cellA);
  const cellB = neighbors[0]; // Adjacent cell

  // 1. Initial driver update
  await dispatchWithRedis.updateDriverPosition({
    driverId: 'drv_2001',
    lat: 6.4281,
    lng: 3.4219,
    cellId: cellA,
    cityId,
    updatedAt: Date.now(),
    status: 'AVAILABLE',
  });

  const driversInA_1 = await mockRedis.smembers(formatCellKey(cityId, cellA));
  assert(driversInA_1.includes('drv_2001'), 'Driver must exist in cell A');

  // 2. Driver migrates to cell B
  await dispatchWithRedis.updateDriverPosition(
    {
      driverId: 'drv_2001',
      lat: 6.435,
      lng: 3.425,
      cellId: cellB,
      cityId,
      updatedAt: Date.now(),
      status: 'AVAILABLE',
    },
    cellA
  );

  const driversInA_2 = await mockRedis.smembers(formatCellKey(cityId, cellA));
  const driversInB_2 = await mockRedis.smembers(formatCellKey(cityId, cellB));

  assert(!driversInA_2.includes('drv_2001'), 'Driver must be atomically REMOVED from old cell A');
  assert(driversInB_2.includes('drv_2001'), 'Driver must be atomically ADDED to new cell B');
  console.log('  ✓ Verified atomic migration: 0 ghost drivers left in old cell.');

  // 3. A delayed older ping must not move the driver back to cell A.
  await dispatchWithRedis.updateDriverPosition(
    {
      driverId: 'drv_2001',
      lat: 6.4281,
      lng: 3.4219,
      cellId: cellA,
      cityId,
      updatedAt: 1,
      status: 'AVAILABLE',
    },
    cellB
  );
  assert(
    (await mockRedis.smembers(formatCellKey(cityId, cellB))).includes('drv_2001'),
    'Delayed older update must leave driver in authoritative newer cell'
  );
  assert(
    !(await mockRedis.smembers(formatCellKey(cityId, cellA))).includes('drv_2001'),
    'Delayed older update must not restore old-cell membership'
  );
  console.log('  ✓ Rejected delayed stale update without moving driver backward.');

  // =========================================================================
  // TEST 3: 2-Tier Candidate Dispatch Pipeline
  // =========================================================================
  console.log('\n▶ Test 3: Two-Tier Candidate Dispatch Pipeline (Geodesic + Turn-by-Turn)');
  const mockRoutingProvider: RouteCostProvider = {
    async getRouteCost(origin, destination) {
      const geoDist = TriHex.geodesicDistance(origin, destination);
      // Simulate road network detour factor of 1.35x and urban speed of 25 km/h
      const roadDist = geoDist * 1.35;
      const durationSec = roadDist / (25 * 1000 / 3600);
      return {
        distanceMeters: Math.round(roadDist),
        durationSeconds: Math.round(durationSec),
      };
    },
  };

  const dispatchEngine = new DispatchEngine({
    routeCostProvider: mockRoutingProvider,
    tier1CandidateLimit: 50,
    tier2CandidateLimit: 5,
  });

  // Rider pickup location: Victoria Island, Lagos
  const riderPickup = { lat: 6.4281, lng: 3.4219 };
  const riderCell = TriHex.latLngToCell(riderPickup.lat, riderPickup.lng, 9);

  // Populate 10 candidate drivers around the rider at varying distances
  const ring1Cells = TriHex.cellDisk(riderCell, 1);
  const ring2Cells = TriHex.cellDisk(riderCell, 2);

  // 3 Close drivers (Ring 1) - Available
  for (let i = 1; i <= 3; i++) {
    const center = TriHex.cellToLatLng(ring1Cells[i]);
    await dispatchEngine.updateDriverPosition({
      driverId: `drv_close_${i}`,
      lat: center.lat,
      lng: center.lng,
      cellId: ring1Cells[i],
      cityId,
      updatedAt: Date.now(),
      status: 'AVAILABLE',
    });
  }

  // 1 Close driver in Ring 1 - BUSY (Must be filtered out)
  const busyCenter = TriHex.cellToLatLng(ring1Cells[0]);
  await dispatchEngine.updateDriverPosition({
    driverId: 'drv_busy_1',
    lat: busyCenter.lat,
    lng: busyCenter.lng,
    cellId: ring1Cells[0],
    cityId,
    updatedAt: Date.now(),
    status: 'BUSY',
  });

  // 4 Medium-distance drivers (Ring 2) - Available
  for (let i = 1; i <= 4; i++) {
    const center = TriHex.cellToLatLng(ring2Cells[i + 3]);
    await dispatchEngine.updateDriverPosition({
      driverId: `drv_medium_${i}`,
      lat: center.lat,
      lng: center.lng,
      cellId: ring2Cells[i + 3],
      cityId,
      updatedAt: Date.now(),
      status: 'AVAILABLE',
    });
  }

  // Execute 2-tier candidate dispatch search
  const candidates: CandidateScoring[] = await dispatchEngine.findCandidates({
    pickup: riderPickup,
    pickupCellId: riderCell,
    cityId,
    initialRadius: 1,
    maxRadius: 2,
    requiredStatus: 'AVAILABLE',
    maxResults: 5,
  });

  assert(candidates.length > 0, 'Candidates must be found');
  assert(candidates.length <= 5, 'Must respect maxResults / tier2CandidateLimit');

  // Verify busy driver was excluded
  const hasBusy = candidates.some((c) => c.driverId === 'drv_busy_1');
  assert(!hasBusy, 'Busy driver must be completely filtered out');

  // Verify rankings are ordered ascending by finalScore (ETA duration in seconds)
  for (let i = 0; i < candidates.length - 1; i++) {
    assert(
      candidates[i].finalScore <= candidates[i + 1].finalScore,
      `Candidates must be sorted by score ascending: rank ${candidates[i].rank} vs ${candidates[i + 1].rank}`
    );
    assert(candidates[i].rank === i + 1, `Candidate rank must be sequential: expected ${i + 1}`);
  }

  // Closest driver should be rank 1
  const rank1 = candidates[0];
  assert(rank1.driverId.startsWith('drv_close_'), 'Rank 1 candidate should be from close ring');
  console.log(`  ✓ Dispatched ${candidates.length} candidates.`);
  console.log(`  ✓ Rank 1 Driver: ${rank1.driverId}, Road Distance: ${rank1.routeDistanceMeters}m, ETA: ${rank1.routeDurationSeconds}s`);

  // =========================================================================
  // TEST 4: Dense 1D B-Tree Interval Proof (Zero Gap Traversal)
  // =========================================================================
  console.log('\n▶ Test 4: Dense 1D B-Tree Interval Proof (Zero Gap Traversal)');
  for (let res = 1; res <= 10; res++) {
    const cell = TriHex.latLngToCell(6.5244, 3.3792, res);
    const targetRes = res + 2;
    const range = TriHex.cellToChildrenRange(cell, targetRes);
    const expectedCount = 1n << (BigInt(targetRes - res) * 2n); // 4^2 = 16
    const exactDifference = range.end - range.start + 1n;

    assert(
      exactDifference === expectedCount,
      `Resolution ${res} to ${targetRes}: Expected exactly ${expectedCount} consecutive IDs, got ${exactDifference}`
    );
  }
  console.log('  ✓ Verified 100% dense B-Tree interval density (end - start + 1 == 4^ΔR) across all resolutions.');

  console.log('\n🏆 ALL MOBILITY DISPATCH TESTS COMPLETED WITH ZERO DEFECTS!\n');
}

runDispatchTests();
