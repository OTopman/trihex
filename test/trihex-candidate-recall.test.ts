import {
  createHighwayTopology,
  createRiverBarrierTopology,
  evaluateCandidateRecall,
} from '../src/candidate-recall';
import { DriverPosition } from '../src/dispatch';
import { TriHex } from '../src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runCandidateRecallTests() {
  console.log('🚗 Starting TriHex Candidate Recall Evaluation Test Suite...\n');

  // =========================================================================
  // SCENARIO 1: River Barrier with Distant Bridge Detour
  // =========================================================================
  console.log('▶ Scenario 1: River Barrier (Island vs Mainland Detour)');
  const { topology: riverTopology, pickup: riverPickup } = createRiverBarrierTopology();
  const riverPickupCell = TriHex.latLngToCell(riverPickup.lat, riverPickup.lng, 9);

  // Fleet setup:
  // 10 drivers on the Island (same bank as pickup)
  // 30 drivers on the Mainland (across water, geodesically close but 20km road detour)
  const riverDrivers: DriverPosition[] = [];

  // Island drivers (close in road time)
  for (let i = 0; i < 10; i++) {
    const lat = 6.450 + (i % 3) * 0.005;
    const lng = 3.420 + Math.floor(i / 3) * 0.005;
    const cellId = TriHex.latLngToCell(lat, lng, 9);
    riverDrivers.push({
      driverId: `drv_island_${i}`,
      lat,
      lng,
      cellId,
      cityId: 'lagos',
      updatedAt: Date.now(),
      status: 'AVAILABLE',
      version: 1,
    });
  }

  // Mainland drivers (geodesically close but topologically far)
  for (let i = 0; i < 30; i++) {
    const lat = 6.480 + (i % 5) * 0.003;
    const lng = 3.420 + Math.floor(i / 5) * 0.003;
    const cellId = TriHex.latLngToCell(lat, lng, 9);
    riverDrivers.push({
      driverId: `drv_mainland_${i}`,
      lat,
      lng,
      cellId,
      cityId: 'lagos',
      updatedAt: Date.now(),
      status: 'AVAILABLE',
      version: 1,
    });
  }

  const riverResult = await evaluateCandidateRecall(
    'River Barrier (Mainland/Island)',
    riverTopology,
    riverDrivers,
    riverPickup,
    riverPickupCell,
    'lagos'
  );

  console.log(`  ✓ Fleet: ${riverResult.metrics.totalFleetSize} drivers, Retrieved: ${riverResult.metrics.retrievedCount}`);
  console.log(`  ✓ Recall@5:   ${(riverResult.metrics.recallAt5 * 100).toFixed(1)}%`);
  console.log(`  ✓ Recall@10:  ${(riverResult.metrics.recallAt10 * 100).toFixed(1)}%`);
  console.log(`  ✓ Recall@25:  ${(riverResult.metrics.recallAt25 * 100).toFixed(1)}%`);

  // Assertions
  assert(riverResult.metrics.recallAt5 >= 0.80, `Recall@5 should be >= 0.80, got ${riverResult.metrics.recallAt5}`);
  assert(riverResult.metrics.recallAt10 >= 0.80, `Recall@10 should be >= 0.80, got ${riverResult.metrics.recallAt10}`);

  // Ensure top 5 are indeed island drivers (due to road routing cost)
  for (const item of riverResult.trihexTop5) {
    assert(
      item.driverId.startsWith('drv_island'),
      `Top ranked candidate ${item.driverId} must be on Island due to bridge detour`
    );
  }
  console.log('  ✓ Top 5 candidates correctly prioritized Island drivers over across-river drivers');

  // =========================================================================
  // SCENARIO 2: High-Speed Expressway Corridor vs Congested Local Streets
  // =========================================================================
  console.log('\n▶ Scenario 2: High-Speed Highway vs Congested Urban Streets');
  const { topology: hwTopology, pickup: hwPickup } = createHighwayTopology();
  const hwPickupCell = TriHex.latLngToCell(hwPickup.lat, hwPickup.lng, 9);

  const hwDrivers: DriverPosition[] = [];

  // Drivers along high-speed corridor (fast despite distance)
  for (let i = 0; i < 15; i++) {
    const lat = 6.500 + i * 0.006;
    const lng = 3.300 + i * 0.006;
    const cellId = TriHex.latLngToCell(lat, lng, 9);
    hwDrivers.push({
      driverId: `drv_highway_${i}`,
      lat,
      lng,
      cellId,
      cityId: 'lagos',
      updatedAt: Date.now(),
      status: 'AVAILABLE',
      version: 1,
    });
  }

  // Drivers in congested local streets (geodesically near, low speed)
  for (let i = 0; i < 10; i++) {
    const lat = 6.585 + (i % 3) * 0.002;
    const lng = 3.385 + Math.floor(i / 3) * 0.002;
    const cellId = TriHex.latLngToCell(lat, lng, 9);
    hwDrivers.push({
      driverId: `drv_local_${i}`,
      lat,
      lng,
      cellId,
      cityId: 'lagos',
      updatedAt: Date.now(),
      status: 'AVAILABLE',
      version: 1,
    });
  }

  const hwResult = await evaluateCandidateRecall(
    'Highway vs Local Streets',
    hwTopology,
    hwDrivers,
    hwPickup,
    hwPickupCell,
    'lagos'
  );

  console.log(`  ✓ Fleet: ${hwResult.metrics.totalFleetSize} drivers, Retrieved: ${hwResult.metrics.retrievedCount}`);
  console.log(`  ✓ Recall@5:   ${(hwResult.metrics.recallAt5 * 100).toFixed(1)}%`);
  console.log(`  ✓ Recall@10:  ${(hwResult.metrics.recallAt10 * 100).toFixed(1)}%`);
  console.log(`  ✓ Recall@25:  ${(hwResult.metrics.recallAt25 * 100).toFixed(1)}%`);

  assert(hwResult.metrics.recallAt5 >= 0.80, `Recall@5 should be >= 0.80, got ${hwResult.metrics.recallAt5}`);
  assert(hwResult.metrics.recallAt10 >= 0.80, `Recall@10 should be >= 0.80, got ${hwResult.metrics.recallAt10}`);

  console.log('\n🏆 ALL CANDIDATE RECALL EVALUATIONS PASSED WITH HIGH FIDELITY!\n');
}

runCandidateRecallTests().catch((err) => {
  console.error('Fatal error during candidate recall tests:', err);
  process.exit(1);
});
