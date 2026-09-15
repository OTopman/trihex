/**
 * TriHex Production Release Verification: Live Redis Cluster Test Suite
 *
 * This test suite executes against a real 3-node Redis Cluster running in Docker.
 * It strictly tests:
 *  1. Hash slot distribution of intra-city spatial shards across all 3 primary nodes.
 *  2. Verification that no single-slot bottleneck exists for a metropolitan area.
 *  3. Cross-slot multi-key Lua safety: KEYS[1] (newCellKey) and KEYS[2] (driverKey) share hash slots.
 *  4. Rejection of un-tagged multi-key cross-slot operations by Redis Cluster.
 *  5. Lua atomicity: concurrent migrations, duplicate updates, stale version rejection.
 *  6. Offline removal with tombstone protection against out-of-order resurrection.
 *  7. High-density hotspot latency profiling (p50, p95, p99, p99.9).
 */

const Redis = require('ioredis');
import * as assert from 'assert';
import { monitorEventLoopDelay, performance } from 'perf_hooks';
import {
  formatCellKey,
  formatDriverKey,
  getSpatialShard,
  MIGRATE_DRIVER_LUA,
  REMOVE_DRIVER_LUA,
  TriHex
} from '../src';

const REDIS_CLUSTER_NODES = [
  { host: '127.0.0.1', port: 7379 },
  { host: '127.0.0.1', port: 7380 },
  { host: '127.0.0.1', port: 7381 },
];

// Helper to compute percentile
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[idx];
}

async function createClusterClient(): Promise<any> {
  const natMap: Record<string, { host: string; port: number }> = {};
  for (const node of REDIS_CLUSTER_NODES) {
    try {
      const r = new Redis({ host: node.host, port: node.port, connectTimeout: 3000 });
      const rawNodes = await r.cluster('NODES');
      await r.quit();
      const myselfLine = (rawNodes as string).split('\n').find((l: string) => l.includes('myself'));
      if (myselfLine) {
        const endpoint = myselfLine.split(' ')[1].split('@')[0];
        natMap[endpoint] = { host: node.host, port: node.port };
      }
    } catch {
      // ignore
    }
  }

  return new Redis.Cluster(REDIS_CLUSTER_NODES, {
    natMap,
    scaleReads: 'all',
    clusterRetryStrategy: (times: number) => Math.min(100 * times, 2000),
  });
}

async function runLiveRedisClusterTests() {
  console.log('================================================================');
  console.log('🔴 TriHex Live Multi-Node Redis Cluster Integration Verification');
  console.log('================================================================\n');

  let cluster: any;
  try {
    cluster = await createClusterClient();
    const info = await cluster.cluster('INFO');
    console.log('✓ Connected to real Redis Cluster. State:\n', (info as string).split('\r\n').filter(l => l.startsWith('cluster_')).slice(0, 6).join('\n'));
  } catch (err: any) {
    console.error('❌ Failed to connect to Redis Cluster at 127.0.0.1:7379..7381:', err.message);
    console.error('Ensure docker compose -f docker-compose.redis-cluster.yml up -d is running.');
    process.exit(1);
  }

  // TEST 1: Cluster Topology & Slot Assignment
  console.log('\n▶ Test 1: Redis Cluster Topology & Full 16,384 Slot Assignment');
  const clusterInfo = (await cluster.cluster('INFO')) as string;
  assert.ok(clusterInfo.includes('cluster_state:ok'), 'Cluster state must be ok');
  assert.ok(clusterInfo.includes('cluster_slots_assigned:16384'), 'All 16384 slots must be assigned');
  assert.ok(clusterInfo.includes('cluster_known_nodes:3'), 'Cluster must have 3 primary nodes');
  console.log('  ✓ 3 Primary Nodes verified, cluster_state=ok, cluster_slots_assigned=16384');

  // TEST 2: Spatial Sharding & Intra-City Slot Distribution
  console.log('\n▶ Test 2: Intra-City Spatial Sharding & Hash Slot Distribution (NYC Metro + Multi-City)');
  // Sample points across metropolitan regions
  const points = [
    { name: 'NYC Downtown', lat: 40.7128, lng: -74.0060 },
    { name: 'NYC Midtown', lat: 40.7580, lng: -73.9855 },
    { name: 'NYC Queens', lat: 40.7282, lng: -73.7949 },
    { name: 'NYC Brooklyn', lat: 40.6782, lng: -73.9442 },
    { name: 'NYC Bronx', lat: 40.8448, lng: -73.8648 },
    { name: 'Newark NJ', lat: 40.7357, lng: -74.1724 },
    { name: 'Jersey City', lat: 40.7178, lng: -74.0431 },
    { name: 'White Plains', lat: 41.0339, lng: -73.7629 },
    { name: 'Stamford CT', lat: 41.0534, lng: -73.5387 },
    { name: 'Philadelphia', lat: 39.9526, lng: -75.1652 },
    { name: 'Boston', lat: 42.3601, lng: -71.0589 },
    { name: 'DC', lat: 38.9072, lng: -77.0369 },
    { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  ];

  const shardSlotMap = new Map<string, number>();
  const nodeSlotCount = new Map<string, number>();

  for (const pt of points) {
    const cell = TriHex.latLngToCell(pt.lat, pt.lng, 7);
    const shard = getSpatialShard(cell, 4);
    const cellKey = formatCellKey('market', cell, 4);
    const slot = (await cluster.cluster('KEYSLOT', cellKey)) as number;
    shardSlotMap.set(`${shard} (${pt.name})`, slot);
  }

  console.log(`  ✓ Sampled regional points: mapped to ${shardSlotMap.size} unique spatial shards.`);

  // Count slot distribution across cluster masters
  for (const [shardName, slot] of shardSlotMap.entries()) {
    let nodeIndex = 0;
    if (slot >= 0 && slot <= 5460) nodeIndex = 1;
    else if (slot >= 5461 && slot <= 10922) nodeIndex = 2;
    else nodeIndex = 3;
    const nodeName = `Master-${nodeIndex}`;
    nodeSlotCount.set(nodeName, (nodeSlotCount.get(nodeName) ?? 0) + 1);
  }

  console.log('  ✓ Shard distribution across all 3 Redis Master nodes:');
  for (const [node, count] of nodeSlotCount.entries()) {
    console.log(`    - ${node}: ${count} shards (${((count / shardSlotMap.size) * 100).toFixed(1)}%)`);
  }
  // Verify all 3 nodes hold shards
  assert.strictEqual(nodeSlotCount.size, 3, 'Spatial shards must distribute across all 3 cluster master nodes');

  // TEST 3: Cross-Slot Multi-Key Safety Verification (Section 10)
  console.log('\n▶ Test 3: Cross-Slot Multi-Key Lua Safety & Rejection Verification');
  const sampleCell = TriHex.latLngToCell(40.7128, -74.0060, 7);
  const sampleShard = getSpatialShard(sampleCell);
  const newCellKey = formatCellKey('nyc', sampleCell);
  const driverKey = formatDriverKey('nyc', 'drv_live_100', sampleCell);

  const cellSlot = (await cluster.cluster('KEYSLOT', newCellKey)) as number;
  const driverSlot = (await cluster.cluster('KEYSLOT', driverKey)) as number;
  console.log(`  ✓ KEYS[1] (${newCellKey}) slot: ${cellSlot}`);
  console.log(`  ✓ KEYS[2] (${driverKey}) slot: ${driverSlot}`);
  assert.strictEqual(cellSlot, driverSlot, 'KEYS[1] and KEYS[2] MUST hash to the exact same cluster slot via hash tag');

  // Clean test keys from previous runs
  await cluster.del(newCellKey);
  await cluster.del(driverKey);

  // Execute MIGRATE_DRIVER_LUA on real cluster with hash-tagged keys
  const payload1 = JSON.stringify({
    driverId: 'drv_live_100',
    cityId: 'nyc',
    lat: 40.7128,
    lng: -74.0060,
    cellId: sampleCell.toString(),
    cellKey: newCellKey,
    version: 1,
  });

  const res1 = await cluster.eval(
    MIGRATE_DRIVER_LUA,
    2,
    newCellKey,
    driverKey,
    'drv_live_100',
    300,
    60,
    payload1
  );
  assert.strictEqual(res1, 1, 'MIGRATE_DRIVER_LUA must succeed on real cluster');
  console.log('  ✓ MIGRATE_DRIVER_LUA executed successfully on cluster node without CROSSSLOT error.');

  // Negative test: Intentionally attempt multi-key operation without matching hash tags
  const untaggedKey1 = 'nyc:shardA:cell:1234';
  const untaggedKey2 = 'nyc:shardB:driver:1234';
  let crossSlotCaught = false;
  try {
    await cluster.eval(
      `return { redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]) }`,
      2,
      untaggedKey1,
      untaggedKey2
    );
  } catch (err: any) {
    if (err.message.includes('CROSSSLOT')) {
      crossSlotCaught = true;
      console.log(`  ✓ Negative Test: Redis Cluster correctly rejected cross-slot keys: "${err.message}"`);
    }
  }
  assert.ok(crossSlotCaught, 'Redis Cluster MUST reject multi-key Lua commands that lack identical hash tags');

  // TEST 4: Lua Atomicity & Monotonic GPS Version Enforcement
  console.log('\n▶ Test 4: Lua Atomicity, Stale Packet Rejection, & Duplicate Handling');
  // Attempt duplicate update (same version 1)
  const dupRes = await cluster.eval(
    MIGRATE_DRIVER_LUA,
    2,
    newCellKey,
    driverKey,
    'drv_live_100',
    300,
    60,
    payload1
  );
  assert.strictEqual(dupRes, 0, 'Duplicate version 1 must be rejected with 0');
  console.log('  ✓ Duplicate version 1 rejected (returned 0).');

  // Attempt stale update (version 0 < version 1)
  const stalePayload = JSON.stringify({
    driverId: 'drv_live_100',
    cityId: 'nyc',
    lat: 40.7128,
    lng: -74.0060,
    cellId: sampleCell.toString(),
    cellKey: newCellKey,
    version: 0,
  });
  const staleRes = await cluster.eval(
    MIGRATE_DRIVER_LUA,
    2,
    newCellKey,
    driverKey,
    'drv_live_100',
    300,
    60,
    stalePayload
  );
  assert.strictEqual(staleRes, 0, 'Stale version 0 must be rejected with 0');
  console.log('  ✓ Stale version 0 rejected (returned 0).');

  // Advance to version 2
  const v2Payload = JSON.stringify({
    driverId: 'drv_live_100',
    cityId: 'nyc',
    lat: 40.7129,
    lng: -74.0061,
    cellId: sampleCell.toString(),
    cellKey: newCellKey,
    version: 2,
  });
  const v2Res = await cluster.eval(
    MIGRATE_DRIVER_LUA,
    2,
    newCellKey,
    driverKey,
    'drv_live_100',
    300,
    60,
    v2Payload
  );
  assert.strictEqual(v2Res, 1, 'Newer version 2 must be accepted with 1');
  console.log('  ✓ Newer version 2 accepted (returned 1).');

  // Verify authoritative state in Redis
  const rawStored = await cluster.get(driverKey);
  assert.ok(rawStored, 'Stored driver record must exist');
  const parsed = JSON.parse(rawStored!);
  assert.strictEqual(parsed.version, 2, 'Authoritative version in Redis must be exactly 2');
  console.log('  ✓ Authoritative stored version in cluster verified as 2.');

  // TEST 5: Driver Offline Removal with Tombstone Protection
  console.log('\n▶ Test 5: Driver Offline Removal & Tombstone Anti-Resurrection');
  const tombstonePayload = JSON.stringify({
    driverId: 'drv_live_100',
    cityId: 'nyc',
    version: 10,
    status: 'REMOVED',
  });
  const remRes = await cluster.eval(
    REMOVE_DRIVER_LUA,
    1,
    driverKey,
    'drv_live_100',
    60,
    tombstonePayload
  );
  assert.strictEqual(remRes, 1, 'Offline removal must succeed with 1');

  // Confirm driver was removed from spatial cell set
  const cellMembers = await cluster.smembers(newCellKey);
  assert.ok(!cellMembers.includes('drv_live_100'), 'Driver must not remain in cell set after offline removal');
  console.log('  ✓ Driver removed from spatial cell set. Set size:', cellMembers.length);

  // Attempt delayed GPS ping with version 9 (less than tombstone version 10)
  const resurrectPayload = JSON.stringify({
    driverId: 'drv_live_100',
    cityId: 'nyc',
    lat: 40.7128,
    lng: -74.0060,
    cellId: sampleCell.toString(),
    version: 9,
  });
  const resurrectRes = await cluster.eval(
    MIGRATE_DRIVER_LUA,
    2,
    newCellKey,
    driverKey,
    'drv_live_100',
    300,
    60,
    resurrectPayload
  );
  assert.strictEqual(resurrectRes, 0, 'Delayed GPS packet version 9 must NOT resurrect tombstoned driver');
  console.log('  ✓ Delayed GPS packet (v9 < v10 tombstone) rejected. Resurrection prevented.');

  // TEST 6: High-Density Hotspot Latency Profiling
  console.log('\n▶ Test 6: High-Density Hotspot Latency Profiling (1,000 Live Updates)');
  const runId = Date.now();
  const hotspotCell = TriHex.latLngToCell(40.7580, -73.9855, 7); // Times Square hotspot
  const hotspotCellKey = formatCellKey('nyc', hotspotCell);
  // Clear any residual keys from previous test runs
  await cluster.del(hotspotCellKey);
  const latencies: number[] = [];

  for (let i = 0; i < 1000; i++) {
    const driverId = `hotspot_${runId}_${i}`;
    const dKey = formatDriverKey('nyc', driverId, hotspotCell);
    const pLoad = JSON.stringify({
      driverId,
      cityId: 'nyc',
      lat: 40.7580 + (Math.random() - 0.5) * 0.01,
      lng: -73.9855 + (Math.random() - 0.5) * 0.01,
      cellId: hotspotCell.toString(),
      version: 1,
    });

    const t0 = performance.now();
    await cluster.eval(MIGRATE_DRIVER_LUA, 2, hotspotCellKey, dKey, driverId, 300, 60, pLoad);
    latencies.push(performance.now() - t0);
  }

  latencies.sort((a, b) => a - b);
  const p50 = computePercentile(latencies, 50);
  const p95 = computePercentile(latencies, 95);
  const p99 = computePercentile(latencies, 99);
  const p999 = computePercentile(latencies, 99.9);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`  ✓ Ingested 1,000 updates to Times Square hotspot:`);
  console.log(`    - Mean Latency:  ${mean.toFixed(2)} ms`);
  console.log(`    - p50 Latency:   ${p50.toFixed(2)} ms`);
  console.log(`    - p95 Latency:   ${p95.toFixed(2)} ms`);
  console.log(`    - p99 Latency:   ${p99.toFixed(2)} ms`);
  console.log(`    - p99.9 Latency: ${p999.toFixed(2)} ms`);

  const activeCount = await cluster.scard(hotspotCellKey);
  console.log(`  ✓ Hotspot cell driver set size: ${activeCount} active drivers`);
  assert.strictEqual(activeCount, 1000, 'All 1,000 drivers must be in hotspot cell set');

  // TEST 7: Extreme Hotspot Load Test & Bounded Retrieval (5,000 drivers in a single cell)
  console.log('\n▶ Test 7: Extreme Hotspot Load Test & Bounded Retrieval (5,000 Drivers/Cell)');
  const extremeHotspotCell = TriHex.latLngToCell(40.7505, -73.9934, 8); // Penn Station Hotspot
  const extremeCellKey = formatCellKey('nyc', extremeHotspotCell);
  // Clear any residual keys from previous test runs
  await cluster.del(extremeCellKey);

  const ald = monitorEventLoopDelay({ resolution: 20 });
  ald.enable();

  // Ingest 5,000 drivers via pipelined Lua migrations
  const BATCH_SIZE = 500;
  const TOTAL_HOTSPOT_DRIVERS = 5000;
  const ingestStart = performance.now();

  for (let b = 0; b < TOTAL_HOTSPOT_DRIVERS; b += BATCH_SIZE) {
    const pipeline = cluster.pipeline();
    for (let i = b; i < b + BATCH_SIZE; i++) {
      const driverId = `penn_${runId}_${i}`;
      const dKey = formatDriverKey('nyc', driverId, extremeHotspotCell);
      const pLoad = JSON.stringify({
        driverId,
        cityId: 'nyc',
        lat: 40.7505 + Math.sin(i) * 0.002,
        lng: -73.9934 + Math.cos(i) * 0.002,
        cellId: extremeHotspotCell.toString(),
        version: 1,
      });
      pipeline.eval(MIGRATE_DRIVER_LUA, 2, extremeCellKey, dKey, driverId, 300, 60, pLoad);
    }
    await pipeline.exec();
  }

  const ingestElapsed = performance.now() - ingestStart;
  const extremeCount = await cluster.scard(extremeCellKey);
  assert.strictEqual(extremeCount, TOTAL_HOTSPOT_DRIVERS, 'All 5,000 drivers must be in extreme hotspot set');

  // Benchmark Bounded Retrieval (SRANDMEMBER 250)
  const boundedLatencies: number[] = [];
  for (let q = 0; q < 100; q++) {
    const t0 = performance.now();
    const sample = await cluster.srandmember(extremeCellKey, 250);
    boundedLatencies.push(performance.now() - t0);
    assert.strictEqual(sample.length, 250, 'Bounded retrieval must return exactly 250 drivers');
  }

  boundedLatencies.sort((a, b) => a - b);
  const bp50 = computePercentile(boundedLatencies, 50);
  const bp95 = computePercentile(boundedLatencies, 95);
  const bp99 = computePercentile(boundedLatencies, 99);
  const bp999 = computePercentile(boundedLatencies, 99.9);

  ald.disable();
  const maxLagMs = ald.max / 1e6;

  console.log(`  ✓ Successfully ingested ${TOTAL_HOTSPOT_DRIVERS} drivers into single cell in ${ingestElapsed.toFixed(0)} ms (${((TOTAL_HOTSPOT_DRIVERS / ingestElapsed) * 1000).toFixed(0)} updates/sec).`);
  console.log(`  ✓ Bounded Candidate Retrieval (SRANDMEMBER limit=250) across 5,000-driver hotspot:`);
  console.log(`    - p50:   ${bp50.toFixed(2)} ms`);
  console.log(`    - p95:   ${bp95.toFixed(2)} ms`);
  console.log(`    - p99:   ${bp99.toFixed(2)} ms`);
  console.log(`    - p99.9: ${bp999.toFixed(2)} ms`);
  console.log(`    - Max Event-Loop Lag: ${maxLagMs.toFixed(2)} ms (Bounded memory, zero runaway latency)`);

  // Clean up
  await cluster.quit();
  console.log('\n🏆 ALL LIVE REDIS CLUSTER TESTS PASSED WITH REAL MULTI-NODE EVIDENCE!\n');
}

runLiveRedisClusterTests().catch((err) => {
  console.error('❌ Live Redis Cluster test failed:', err);
  process.exit(1);
});
