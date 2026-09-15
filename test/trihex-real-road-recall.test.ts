import {
  evaluateCandidateRecall,
  RecallMetrics,
} from '../src/candidate-recall';
import { DriverPosition } from '../src/dispatch';
import { TriHex } from '../src/index';
import { VersionedRoadGraph } from '../src/topology';
import { GeoCoord } from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * Creates a realistic multi-market urban road graph with 11 distinct scenarios
 */
function buildMetropolitanRoadNetwork(): {
  topology: VersionedRoadGraph;
  scenarios: {
    name: string;
    pickup: GeoCoord;
    fleet: { lat: number; lng: number; id: string }[];
  }[];
} {
  const topology = new VersionedRoadGraph('v_real_metro_1.0');

  // Define key landmarks around Lagos metropolitan area
  // Island:
  //   Marina: (6.4500, 3.4000)
  //   VI:     (6.4300, 3.4200)
  //   Ikoyi:  (6.4550, 3.4400)
  // Mainland:
  //   Yaba:     (6.5100, 3.3750)
  //   Surulere: (6.4950, 3.3550)
  //   Ikeja:    (6.5950, 3.3450)
  //   Airport:  (6.5800, 3.3250)
  // Bridges:
  //   Eko Bridge:     Marina <-> Iddo (6.4700, 3.3800) <-> Surulere
  //   3rd Mainland:   Ikoyi <-> Adekunle (6.4950, 3.3850) <-> Yaba <-> Oworonshoki (6.5500, 3.3850)
  // Highways:
  //   Ikorodu Road:   Yaba <-> Maryland (6.5650, 3.3650) <-> Ikeja
  //   Airport Road:   Oshodi (6.5450, 3.3500) <-> Airport

  // Add nodes
  const nodes: { id: string; lat: number; lng: number }[] = [
    { id: 'marina', lat: 6.4500, lng: 3.4000 },
    { id: 'vi', lat: 6.4300, lng: 3.4200 },
    { id: 'ikoyi', lat: 6.4550, lng: 3.4400 },
    { id: 'iddo', lat: 6.4700, lng: 3.3800 },
    { id: 'surulere', lat: 6.4950, lng: 3.3550 },
    { id: 'stadium', lat: 6.4980, lng: 3.3600 },
    { id: 'yaba', lat: 6.5100, lng: 3.3750 },
    { id: 'adekunle', lat: 6.4950, lng: 3.3850 },
    { id: 'oworonshoki', lat: 6.5500, lng: 3.3850 },
    { id: 'oshodi', lat: 6.5450, lng: 3.3500 },
    { id: 'maryland', lat: 6.5650, lng: 3.3650 },
    { id: 'ikeja', lat: 6.5950, lng: 3.3450 },
    { id: 'airport', lat: 6.5800, lng: 3.3250 },
    { id: 'suburban_north', lat: 6.6500, lng: 3.3300 },
    { id: 'rural_outskirts', lat: 6.7500, lng: 3.3000 },
  ];

  for (const n of nodes) {
    topology.addNode(n.id, { lat: n.lat, lng: n.lng });
  }

  // Add directed edges with realistic speed limits (km/h)
  const addRoad = (from: string, to: string, speedKmh: number, isOneWay = false) => {
    topology.addEdge(from, to, speedKmh, false);
    if (!isOneWay) {
      topology.addEdge(to, from, speedKmh, false);
    }
  };

  // Island local roads (35 km/h)
  addRoad('marina', 'vi', 35);
  addRoad('vi', 'ikoyi', 35);
  addRoad('ikoyi', 'marina', 35);

  // Bridges (Island <-> Mainland, 70 km/h)
  addRoad('marina', 'iddo', 70); // Eko Bridge
  addRoad('iddo', 'surulere', 40);
  addRoad('ikoyi', 'adekunle', 80); // Third Mainland Bridge
  addRoad('adekunle', 'yaba', 40);
  addRoad('adekunle', 'oworonshoki', 90); // 3MB express segment
  addRoad('oworonshoki', 'yaba', 50);

  // Mainland Arterials & Highways
  addRoad('surulere', 'stadium', 30);
  addRoad('surulere', 'oshodi', 50);
  addRoad('yaba', 'maryland', 60); // Ikorodu road
  addRoad('maryland', 'ikeja', 50);
  addRoad('oshodi', 'airport', 80, true); // One-way express inbound airport
  addRoad('airport', 'oshodi', 80, true); // Return corridor
  addRoad('oshodi', 'maryland', 60);
  addRoad('ikeja', 'airport', 40);

  // Outskirts & Rural
  addRoad('ikeja', 'suburban_north', 60);
  addRoad('suburban_north', 'rural_outskirts', 80);

  // Build the 11 scenarios
  const scenarios = [
    {
      name: '1. Urban Downtown Grid (Marina)',
      pickup: { lat: 6.4505, lng: 3.4005 },
      fleet: [
        { id: 'drv_u1', lat: 6.4510, lng: 3.4010 }, // 100m away
        { id: 'drv_u2', lat: 6.4490, lng: 3.3990 }, // 200m away
        { id: 'drv_u3', lat: 6.4310, lng: 3.4210 }, // VI (2km)
        { id: 'drv_u4', lat: 6.4950, lng: 3.3550 }, // Mainland (trapped across bridge)
      ],
    },
    {
      name: '2. River Barrier (Lagos Island vs Mainland)',
      pickup: { lat: 6.4500, lng: 3.4000 }, // Marina Island
      fleet: [
        { id: 'drv_b_island_1', lat: 6.4520, lng: 3.4020 },
        { id: 'drv_b_island_2', lat: 6.4300, lng: 3.4200 },
        { id: 'drv_b_mainland_close', lat: 6.4750, lng: 3.3850 }, // 2km straight-line, 12km by road
        { id: 'drv_b_mainland_far', lat: 6.5100, lng: 3.3750 },
      ],
    },
    {
      name: '3. Highway Corridor (Third Mainland Bridge)',
      pickup: { lat: 6.5300, lng: 3.3850 },
      fleet: [
        { id: 'drv_hw_1', lat: 6.5100, lng: 3.3850 }, // On highway at 90 km/h
        { id: 'drv_hw_2', lat: 6.5400, lng: 3.3850 }, // On highway
        { id: 'drv_hw_local', lat: 6.5300, lng: 3.3600 }, // Local street (congested)
      ],
    },
    {
      name: '4. One-Way Street Pattern (Airport Express)',
      pickup: { lat: 6.5800, lng: 3.3250 },
      fleet: [
        { id: 'drv_ow_inbound', lat: 6.5500, lng: 3.3450 }, // Coming with one-way flow
        { id: 'drv_ow_ikeja', lat: 6.5950, lng: 3.3450 }, // Alternative route
      ],
    },
    {
      name: '5. Bridges Limited Crossing Points',
      pickup: { lat: 6.4550, lng: 3.4400 }, // Ikoyi
      fleet: [
        { id: 'drv_brg_1', lat: 6.4540, lng: 3.4410 }, // Ikoyi local
        { id: 'drv_brg_2', lat: 6.4950, lng: 3.3850 }, // At bridgehead Adekunle
        { id: 'drv_brg_3', lat: 6.4950, lng: 3.3550 }, // Surulere (must cross bridge)
      ],
    },
    {
      name: '6. Airport Restricted Terminal Corridor',
      pickup: { lat: 6.5800, lng: 3.3250 },
      fleet: [
        { id: 'drv_air_1', lat: 6.5810, lng: 3.3260 },
        { id: 'drv_air_2', lat: 6.5900, lng: 3.3400 },
        { id: 'drv_air_3', lat: 6.5450, lng: 3.3500 },
      ],
    },
    {
      name: '7. Stadium Event Hotspot (Surulere Stadium)',
      pickup: { lat: 6.4980, lng: 3.3600 },
      fleet: [
        { id: 'drv_st_1', lat: 6.4975, lng: 3.3590 },
        { id: 'drv_st_2', lat: 6.4985, lng: 3.3610 },
        { id: 'drv_st_3', lat: 6.4990, lng: 3.3620 },
        { id: 'drv_st_4', lat: 6.4950, lng: 3.3550 },
        { id: 'drv_st_5', lat: 6.5100, lng: 3.3750 },
      ],
    },
    {
      name: '8. Suburban Moderate Density (Ikeja CBD)',
      pickup: { lat: 6.5950, lng: 3.3450 },
      fleet: [
        { id: 'drv_sub_1', lat: 6.5960, lng: 3.3460 },
        { id: 'drv_sub_2', lat: 6.5850, lng: 3.3350 },
        { id: 'drv_sub_3', lat: 6.5650, lng: 3.3650 },
      ],
    },
    {
      name: '9. Rural Outskirts Sparse Supply',
      pickup: { lat: 6.7500, lng: 3.3000 },
      fleet: [
        { id: 'drv_rur_1', lat: 6.7400, lng: 3.3050 },
        { id: 'drv_rur_2', lat: 6.6500, lng: 3.3300 }, // 12km away
      ],
    },
    {
      name: '10. Asymmetric Network Detour',
      pickup: { lat: 6.4700, lng: 3.3800 }, // Iddo
      fleet: [
        { id: 'drv_asym_1', lat: 6.4750, lng: 3.3780 },
        { id: 'drv_asym_2', lat: 6.4500, lng: 3.4000 }, // Marina (over bridge)
      ],
    },
    {
      name: '11. Long Detour vs Euclidean Proximity',
      pickup: { lat: 6.4500, lng: 3.4000 }, // Marina
      fleet: [
        { id: 'drv_euclid_close_mainland', lat: 6.4600, lng: 3.3900 }, // Across water, 1km Euclidean, 15km road
        { id: 'drv_road_fast_island', lat: 6.4350, lng: 3.4150 }, // Same island, 3km Euclidean, 4km road
      ],
    },
  ];

  return { topology, scenarios };
}

async function runRealRoadRecallSuite() {
  console.log('🚗 EXECUTING REAL ROAD NETWORK CANDIDATE RECALL EVALUATION (11 SCENARIOS)...\n');

  const { topology, scenarios } = buildMetropolitanRoadNetwork();
  const allResults: RecallMetrics[] = [];

  for (const sc of scenarios) {
    const pickupCell = TriHex.latLngToCell(sc.pickup.lat, sc.pickup.lng, 10);
    const driverPositions: DriverPosition[] = sc.fleet.map((d, i) => ({
      driverId: d.id,
      lat: d.lat,
      lng: d.lng,
      cellId: TriHex.latLngToCell(d.lat, d.lng, 10),
      cityId: 'lagos',
      version: 1,
      updatedAt: Date.now() + i,
      status: 'AVAILABLE',
    }));

    const result = await evaluateCandidateRecall(
      sc.name,
      topology,
      driverPositions,
      sc.pickup,
      pickupCell,
      'lagos'
    );

    allResults.push(result.metrics);

    console.log(`▶ Scenario: ${sc.name}`);
    console.log(`  Fleet Size: ${result.metrics.totalFleetSize} | Retrieved: ${result.metrics.retrievedCount}`);
    console.log(`  Recall@1: ${(result.metrics.recallAt1 * 100).toFixed(1)}% | Recall@5: ${(result.metrics.recallAt5 * 100).toFixed(1)}% | MRR: ${result.metrics.mrr.toFixed(3)}`);
    console.log(`  ETA Regret: ${result.metrics.etaRegretSeconds.toFixed(1)}s (Relative: ${result.metrics.relativeEtaRegretPct.toFixed(1)}%) | False Negatives: ${result.metrics.falseNegativeCount}`);
    console.log(`  Top Candidate: ${result.trihexTop5[0]?.driverId} (ETA: ${result.trihexTop5[0]?.durationSeconds}s) vs Ground Truth: ${result.groundTruthTop5[0]?.driverId} (ETA: ${result.groundTruthTop5[0]?.durationSeconds}s)\n`);

    assert(result.metrics.recallAt5 >= 0.80, `Recall@5 must be >= 80% in ${sc.name}`);
    assert(result.metrics.etaRegretSeconds < 60, `ETA regret must be < 60s in ${sc.name}`);
  }

  // Summary Metrics
  const avgRecall1 = allResults.reduce((a, b) => a + b.recallAt1, 0) / allResults.length;
  const avgRecall5 = allResults.reduce((a, b) => a + b.recallAt5, 0) / allResults.length;
  const avgMRR = allResults.reduce((a, b) => a + b.mrr, 0) / allResults.length;
  const maxRegret = Math.max(...allResults.map((r) => r.etaRegretSeconds));
  const p95Regret = allResults.map((r) => r.etaRegretSeconds).sort((a, b) => a - b)[
    Math.floor(allResults.length * 0.95)
  ];

  console.log('================================================================');
  console.log('🏆 11-SCENARIO REAL ROAD-NETWORK DISPATCH RECALL SUMMARY:');
  console.log(`  • Average Recall@1:    ${(avgRecall1 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@5:    ${(avgRecall5 * 100).toFixed(1)}%`);
  console.log(`  • Average MRR:         ${avgMRR.toFixed(3)}`);
  console.log(`  • p95 ETA Regret:      ${p95Regret.toFixed(1)}s`);
  console.log(`  • Worst-Case Regret:   ${maxRegret.toFixed(1)}s`);
  console.log('================================================================\n');
}

runRealRoadRecallSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
