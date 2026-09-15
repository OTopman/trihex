import {
  DispatchEngine,
  formatCellKey,
  formatDriverKey,
  getSpatialShard
} from '../src/dispatch';
import { TriHex } from '../src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runConcurrencyTests() {
  console.log('⚡ Starting TriHex Concurrency, Atomic Lifecycle & Spatial Sharding Test Suite...\n');

  // =========================================================================
  // TEST 1: Out-of-Order GPS Packet Ingestion & Monotonic Rejection
  // =========================================================================
  console.log('▶ Test 1: Out-of-Order GPS Packet Ingestion & Monotonic Sequence Protection');
  const engine = new DispatchEngine();
  const cityId = 'lagos';
  const driverId = 'drv_async_101';
  const cellA = TriHex.latLngToCell(6.5244, 3.3792, 9);
  const cellB = TriHex.latLngToCell(6.6000, 3.4500, 9);

  // 1. Ingest initial position at version 10
  const updated1 = await engine.updateDriverPosition({
    driverId,
    cityId,
    cellId: cellA,
    lat: 6.5244,
    lng: 3.3792,
    version: 10,
    updatedAt: 1000,
    status: 'AVAILABLE',
  });
  assert(updated1 === true, 'Initial update at version 10 must succeed');

  const pos1 = await engine.getDriverPosition(cityId, driverId, cellA);
  assert(pos1 !== null && pos1.version === 10, 'Driver position must reflect version 10');
  assert(pos1?.cellId === cellA, 'Driver must be in cellA');

  // 2. Delayed/stale packet arrives from the past with version 8 (e.g. cellular packet reordering)
  const updatedStale = await engine.updateDriverPosition({
    driverId,
    cityId,
    cellId: cellB,
    lat: 6.5300,
    lng: 3.3850,
    version: 8,
    updatedAt: 900,
    status: 'AVAILABLE',
  });
  assert(updatedStale === false, 'Stale packet with version 8 < 10 must be strictly rejected');

  // Verify driver remained in cellA with version 10
  const posAfterStale = await engine.getDriverPosition(cityId, driverId, cellA);
  assert(posAfterStale !== null && posAfterStale.version === 10, 'Driver must remain at version 10');
  assert(posAfterStale?.cellId === cellA, 'Driver must not have moved to cellB on stale packet');
  console.log('  ✓ Stale out-of-order GPS packet rejected, state remained authoritative at version 10');

  // =========================================================================
  // TEST 2: Atomic Cell Migration Without Ghost Duplication
  // =========================================================================
  console.log('\n▶ Test 2: Atomic Cell Migration & Zero Ghost Duplication');
  const migrateSuccess = await engine.updateDriverPosition({
    driverId,
    cityId,
    cellId: cellB,
    lat: 6.5300,
    lng: 3.3850,
    version: 11,
    updatedAt: 1100,
    status: 'AVAILABLE',
  });
  assert(migrateSuccess === true, 'Newer update at version 11 must succeed');

  const inCellA = await engine.getDriversInCell(cityId, cellA);
  const inCellB = await engine.getDriversInCell(cityId, cellB);
  assert(!inCellA.includes(driverId), 'Driver must be removed from old cellA');
  assert(inCellB.includes(driverId), 'Driver must be present in new cellB');
  console.log('  ✓ Driver migrated from cellA to cellB atomically with zero ghost duplicates in cellA');

  // =========================================================================
  // TEST 3: Offline Tombstone & Resurrection Prevention
  // =========================================================================
  console.log('\n▶ Test 3: Offline Tombstone Lifecycle & Resurrection Prevention');
  const removeSuccess = await engine.removeDriver(cityId, driverId, cellB, 12);
  assert(removeSuccess === true, 'Driver removal with tombstone version 12 must succeed');

  const inCellBAfterRemove = await engine.getDriversInCell(cityId, cellB);
  assert(!inCellBAfterRemove.includes(driverId), 'Driver must be removed from cellB index');

  const posAfterRemove = await engine.getDriverPosition(cityId, driverId, cellB);
  assert(posAfterRemove === null, 'Driver position query must return null after removal');

  // Late delayed update arrives after removal with version 11
  const resurrectAttempt = await engine.updateDriverPosition({
    driverId,
    cityId,
    cellId: cellB,
    lat: 6.5300,
    lng: 3.3850,
    version: 11,
    updatedAt: 1150,
    status: 'AVAILABLE',
  });
  assert(resurrectAttempt === false, 'Late update with version 11 <= tombstone version 12 must be rejected');

  const posAfterResurrect = await engine.getDriverPosition(cityId, driverId, cellB);
  assert(posAfterResurrect === null, 'Driver must NOT be resurrected by stale GPS packet');
  console.log('  ✓ Offline tombstone successfully prevented resurrection by delayed packets');

  // =========================================================================
  // TEST 4: Intra-City Spatial Sharding (Cluster Slot Diversity)
  // =========================================================================
  console.log('\n▶ Test 4: Intra-City Spatial Sharding (Megacity Cluster Slot Distribution)');
  // Generate locations across Lagos (Mainland, Island, Ikeja, Lekki, Badagry)
  const lagosLocations = [
    { name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
    { name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
    { name: 'Lekki Phase 1', lat: 6.4474, lng: 3.4731 },
    { name: 'Yaba', lat: 6.5095, lng: 3.3711 },
    { name: 'Surulere', lat: 6.4975, lng: 3.3582 },
    { name: 'Ikorodu', lat: 6.6194, lng: 3.5105 },
  ];

  const shardKeys = new Set<string>();
  for (const loc of lagosLocations) {
    const cell = TriHex.latLngToCell(loc.lat, loc.lng, 9);
    const shard = getSpatialShard(cell, 4);
    const cellKey = formatCellKey('lagos', cell);
    const driverKey = formatDriverKey('lagos', 'test_drv', cell);

    assert(cellKey.includes(`{lagos:${shard}}`), `Cell key must include hashtag {lagos:${shard}}`);
    assert(driverKey.includes(`{lagos:${shard}}`), `Driver key must include hashtag {lagos:${shard}}`);
    shardKeys.add(shard);
  }

  assert(shardKeys.size > 1, `Megacity Lagos must distribute across multiple spatial shards (found ${shardKeys.size})`);
  console.log(`  ✓ Lagos locations distributed across ${shardKeys.size} distinct Redis Cluster hash tags`);

  // =========================================================================
  // TEST 5: Real Asynchronous Concurrency Stress Test
  // =========================================================================
  console.log('\n▶ Test 5: Concurrent Asynchronous Race Condition Stress Test');
  const concurrentDriverId = 'drv_race_200';
  const raceCell = TriHex.latLngToCell(6.4500, 3.4000, 9);

  // Fire 100 concurrent position updates with shuffled version numbers [1..100] in parallel
  const versions = Array.from({ length: 100 }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = versions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [versions[i], versions[j]] = [versions[j], versions[i]];
  }

  // Execute in parallel Promise.all
  await Promise.all(
    versions.map((ver) =>
      engine.updateDriverPosition({
        driverId: concurrentDriverId,
        cityId,
        cellId: raceCell,
        lat: 6.4500 + ver * 0.00001,
        lng: 3.4000 + ver * 0.00001,
        version: ver,
        updatedAt: Date.now() + ver,
        status: 'AVAILABLE',
      })
    )
  );

  const finalPos = await engine.getDriverPosition(cityId, concurrentDriverId, raceCell);
  assert(finalPos !== null, 'Final position must exist');
  assert(finalPos?.version === 100, `Final driver state must have highest version 100, got ${finalPos?.version}`);

  const driversInRaceCell = await engine.getDriversInCell(cityId, raceCell);
  assert(driversInRaceCell.filter((d) => d === concurrentDriverId).length === 1, 'Driver must appear exactly once in cell set');
  console.log(`  ✓ 100 concurrent shuffled updates resolved with 100% determinism: final version = ${finalPos?.version}`);

  console.log('\n🏆 ALL CONCURRENCY, LIFECYCLE & SPATIAL SHARDING TESTS PASSED PERFECTLY!\n');
}

runConcurrencyTests().catch((err) => {
  console.error('Fatal error during concurrency tests:', err);
  process.exit(1);
});
