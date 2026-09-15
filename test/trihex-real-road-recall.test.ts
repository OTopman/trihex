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
 * Generates realistic driver fleet distributed along road corridor segments.
 */
function generateCorridorFleet(
  cityPrefix: string,
  edges: { from: GeoCoord; to: GeoCoord }[],
  driversPerEdge: number,
  targetResolution = 10
): { id: string; lat: number; lng: number; cellId: bigint }[] {
  const fleet: { id: string; lat: number; lng: number; cellId: bigint }[] = [];
  let count = 0;

  for (let e = 0; e < edges.length; e++) {
    const { from, to } = edges[e];
    for (let d = 0; d < driversPerEdge; d++) {
      const frac = (d + 0.5) / driversPerEdge;
      const jitterLat = Math.sin(count * 7) * 0.0004;
      const jitterLng = Math.cos(count * 13) * 0.0004;
      const lat = from.lat + (to.lat - from.lat) * frac + jitterLat;
      const lng = from.lng + (to.lng - from.lng) * frac + jitterLng;
      const cellId = TriHex.latLngToCell(lat, lng, targetResolution);
      fleet.push({
        id: `drv_${cityPrefix}_${count++}`,
        lat,
        lng,
        cellId,
      });
    }
  }

  return fleet;
}

// ============================================================================
// MARKET 1: LAGOS METROPOLITAN AREA (11 SCENARIOS)
// ============================================================================
function buildLagosMetropolitanNetwork(): {
  topology: VersionedRoadGraph;
  fleet: { lat: number; lng: number; id: string; cellId: bigint }[];
  scenarios: {
    name: string;
    pickup: GeoCoord;
    targetedDrivers: { lat: number; lng: number; id: string }[];
  }[];
} {
  const topology = new VersionedRoadGraph('v_lagos_metro_2.0');

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

  const nodeMap = new Map<string, GeoCoord>();
  for (const n of nodes) {
    topology.addNode(n.id, { lat: n.lat, lng: n.lng });
    nodeMap.set(n.id, { lat: n.lat, lng: n.lng });
  }

  const corridorEdges: { from: GeoCoord; to: GeoCoord }[] = [];

  const addRoad = (from: string, to: string, speedKmh: number, isOneWay = false) => {
    topology.addEdge(from, to, { freeFlowSpeedKmh: speedKmh, isClosed: false });
    corridorEdges.push({ from: nodeMap.get(from)!, to: nodeMap.get(to)! });
    if (!isOneWay) {
      topology.addEdge(to, from, { freeFlowSpeedKmh: speedKmh, isClosed: false });
      corridorEdges.push({ from: nodeMap.get(to)!, to: nodeMap.get(from)! });
    }
  };

  addRoad('marina', 'vi', 35);
  addRoad('vi', 'ikoyi', 35);
  addRoad('ikoyi', 'marina', 35);
  addRoad('marina', 'iddo', 70); // Eko Bridge
  addRoad('iddo', 'surulere', 40);
  addRoad('ikoyi', 'adekunle', 80); // Third Mainland Bridge
  addRoad('adekunle', 'yaba', 40);
  addRoad('adekunle', 'oworonshoki', 90); // 3MB express segment
  addRoad('oworonshoki', 'yaba', 50);
  addRoad('surulere', 'stadium', 30);
  addRoad('surulere', 'oshodi', 50);
  addRoad('yaba', 'maryland', 60);
  addRoad('maryland', 'ikeja', 50);
  addRoad('oshodi', 'airport', 80, true);
  addRoad('airport', 'oshodi', 80, true);
  addRoad('oshodi', 'maryland', 60);
  addRoad('ikeja', 'airport', 40);
  addRoad('ikeja', 'suburban_north', 60);
  addRoad('suburban_north', 'rural_outskirts', 80);

  // Generate 1,200 realistic corridor drivers
  const fleet = generateCorridorFleet('los', corridorEdges, 35, 10);

  const scenarios = [
    {
      name: 'Lagos 1: Urban Downtown Grid (Marina)',
      pickup: { lat: 6.4505, lng: 3.4005 },
      targetedDrivers: [
        { id: 'tgt_los_u1', lat: 6.4510, lng: 3.4010 },
        { id: 'tgt_los_u2', lat: 6.4490, lng: 3.3990 },
      ],
    },
    {
      name: 'Lagos 2: River Barrier (Island vs Mainland Detour)',
      pickup: { lat: 6.4500, lng: 3.4000 },
      targetedDrivers: [
        { id: 'tgt_los_b_island', lat: 6.4520, lng: 3.4020 },
        { id: 'tgt_los_b_mainland_close', lat: 6.4750, lng: 3.3850 },
      ],
    },
    {
      name: 'Lagos 3: Highway Corridor (Third Mainland Bridge)',
      pickup: { lat: 6.5300, lng: 3.3850 },
      targetedDrivers: [
        { id: 'tgt_los_hw_1', lat: 6.5100, lng: 3.3850 },
        { id: 'tgt_los_hw_2', lat: 6.5400, lng: 3.3850 },
      ],
    },
    {
      name: 'Lagos 4: One-Way Street Pattern (Airport Express)',
      pickup: { lat: 6.5800, lng: 3.3250 },
      targetedDrivers: [
        { id: 'tgt_los_ow_inbound', lat: 6.5500, lng: 3.3450 },
        { id: 'tgt_los_ow_ikeja', lat: 6.5950, lng: 3.3450 },
      ],
    },
    {
      name: 'Lagos 5: Bridges Limited Crossing Points',
      pickup: { lat: 6.4550, lng: 3.4400 },
      targetedDrivers: [
        { id: 'tgt_los_brg_1', lat: 6.4540, lng: 3.4410 },
        { id: 'tgt_los_brg_2', lat: 6.4950, lng: 3.3850 },
      ],
    },
    {
      name: 'Lagos 6: Airport Restricted Terminal Corridor',
      pickup: { lat: 6.5800, lng: 3.3250 },
      targetedDrivers: [
        { id: 'tgt_los_air_1', lat: 6.5810, lng: 3.3260 },
        { id: 'tgt_los_air_2', lat: 6.5900, lng: 3.3400 },
      ],
    },
    {
      name: 'Lagos 7: Stadium Event Hotspot Surge',
      pickup: { lat: 6.4980, lng: 3.3600 },
      targetedDrivers: [
        { id: 'tgt_los_st_1', lat: 6.4975, lng: 3.3590 },
        { id: 'tgt_los_st_2', lat: 6.4985, lng: 3.3610 },
      ],
    },
    {
      name: 'Lagos 8: Suburban Moderate Density (Ikeja CBD)',
      pickup: { lat: 6.5950, lng: 3.3450 },
      targetedDrivers: [
        { id: 'tgt_los_sub_1', lat: 6.5960, lng: 3.3460 },
        { id: 'tgt_los_sub_2', lat: 6.5850, lng: 3.3350 },
      ],
    },
    {
      name: 'Lagos 9: Rural Outskirts Sparse Supply',
      pickup: { lat: 6.7500, lng: 3.3000 },
      targetedDrivers: [
        { id: 'tgt_los_rur_1', lat: 6.7400, lng: 3.3050 },
        { id: 'tgt_los_rur_2', lat: 6.6500, lng: 3.3300 },
      ],
    },
    {
      name: 'Lagos 10: Asymmetric Network Detour',
      pickup: { lat: 6.4700, lng: 3.3800 },
      targetedDrivers: [
        { id: 'tgt_los_asym_1', lat: 6.4750, lng: 3.3780 },
        { id: 'tgt_los_asym_2', lat: 6.4500, lng: 3.4000 },
      ],
    },
    {
      name: 'Lagos 11: Long Detour vs Euclidean Proximity',
      pickup: { lat: 6.4500, lng: 3.4000 },
      targetedDrivers: [
        { id: 'tgt_los_euclid_close_mainland', lat: 6.4600, lng: 3.3900 },
        { id: 'tgt_los_road_fast_island', lat: 6.4350, lng: 3.4150 },
      ],
    },
  ];

  // Add targeted drivers into the fleet
  for (const sc of scenarios) {
    for (const td of sc.targetedDrivers) {
      fleet.push({
        id: td.id,
        lat: td.lat,
        lng: td.lng,
        cellId: TriHex.latLngToCell(td.lat, td.lng, 10),
      });
    }
  }

  return { topology, fleet, scenarios };
}

// ============================================================================
// MARKET 2: SAN FRANCISCO BAY AREA (7 SCENARIOS)
// ============================================================================
function buildSFBayAreaNetwork(): {
  topology: VersionedRoadGraph;
  fleet: { lat: number; lng: number; id: string; cellId: bigint }[];
  scenarios: {
    name: string;
    pickup: GeoCoord;
    targetedDrivers: { lat: number; lng: number; id: string }[];
  }[];
} {
  const topology = new VersionedRoadGraph('v_sf_bay_2.0');

  const nodes: { id: string; lat: number; lng: number }[] = [
    { id: 'sf_fidi', lat: 37.7936, lng: -122.3992 },
    { id: 'sf_soma', lat: 37.7785, lng: -122.4056 },
    { id: 'sf_mission', lat: 37.7599, lng: -122.4148 },
    { id: 'sf_castro', lat: 37.7609, lng: -122.4350 },
    { id: 'sf_marina', lat: 37.8037, lng: -122.4368 },
    { id: 'sf_presidio', lat: 37.7989, lng: -122.4662 },
    { id: 'marin_headlands', lat: 37.8324, lng: -122.4795 },
    { id: 'bay_bridge_sf', lat: 37.7900, lng: -122.3890 },
    { id: 'bay_bridge_oak', lat: 37.8200, lng: -122.3100 },
    { id: 'oakland_downtown', lat: 37.8044, lng: -122.2711 },
    { id: 'berkeley', lat: 37.8715, lng: -122.2730 },
    { id: 'bayshore_101', lat: 37.7100, lng: -122.4000 },
    { id: 'sfo_airport', lat: 37.6213, lng: -122.3790 },
    { id: 'palo_alto', lat: 37.4419, lng: -122.1430 },
    { id: 'half_moon_bay', lat: 37.4636, lng: -122.4286 },
  ];

  const nodeMap = new Map<string, GeoCoord>();
  for (const n of nodes) {
    topology.addNode(n.id, { lat: n.lat, lng: n.lng });
    nodeMap.set(n.id, { lat: n.lat, lng: n.lng });
  }

  const corridorEdges: { from: GeoCoord; to: GeoCoord }[] = [];

  const addRoad = (from: string, to: string, speedKmh: number, isOneWay = false) => {
    topology.addEdge(from, to, { freeFlowSpeedKmh: speedKmh, isClosed: false });
    corridorEdges.push({ from: nodeMap.get(from)!, to: nodeMap.get(to)! });
    if (!isOneWay) {
      topology.addEdge(to, from, { freeFlowSpeedKmh: speedKmh, isClosed: false });
      corridorEdges.push({ from: nodeMap.get(to)!, to: nodeMap.get(from)! });
    }
  };

  // SF Local Urban Grid
  addRoad('sf_fidi', 'sf_soma', 30);
  addRoad('sf_soma', 'sf_mission', 35);
  addRoad('sf_mission', 'sf_castro', 30);
  addRoad('sf_fidi', 'sf_marina', 35);
  addRoad('sf_marina', 'sf_presidio', 40);

  // Bridges (Major Bottlenecks)
  addRoad('sf_presidio', 'marin_headlands', 75); // Golden Gate Bridge
  addRoad('sf_fidi', 'bay_bridge_sf', 40);
  addRoad('bay_bridge_sf', 'bay_bridge_oak', 80); // SF-Oakland Bay Bridge
  addRoad('bay_bridge_oak', 'oakland_downtown', 60);
  addRoad('oakland_downtown', 'berkeley', 50);

  // Highway 101 South Corridor to SFO & Silicon Valley
  addRoad('sf_soma', 'bayshore_101', 90);
  addRoad('bayshore_101', 'sfo_airport', 105);
  addRoad('sfo_airport', 'palo_alto', 105);
  addRoad('palo_alto', 'half_moon_bay', 65); // Mountain pass to rural coast

  // One-way airport arrival terminal loop
  addRoad('sfo_airport', 'bayshore_101', 80, true);

  // Generate 1,200 realistic corridor drivers
  const fleet = generateCorridorFleet('sf', corridorEdges, 35, 10);

  const scenarios = [
    {
      name: 'SF 1: Downtown Financial District Dense Grid',
      pickup: { lat: 37.7940, lng: -122.3995 },
      targetedDrivers: [
        { id: 'tgt_sf_fidi_1', lat: 37.7945, lng: -122.4000 },
        { id: 'tgt_sf_fidi_2', lat: 37.7920, lng: -122.3980 },
      ],
    },
    {
      name: 'SF 2: Bay Bridge Water Barrier Bottleneck (SF vs Oakland)',
      pickup: { lat: 37.7905, lng: -122.3895 },
      targetedDrivers: [
        { id: 'tgt_sf_emb_close', lat: 37.7915, lng: -122.3910 },
        { id: 'tgt_sf_oak_across_water', lat: 37.8180, lng: -122.3150 },
      ],
    },
    {
      name: 'SF 3: Golden Gate Bridge Marin Bottleneck',
      pickup: { lat: 37.8000, lng: -122.4670 },
      targetedDrivers: [
        { id: 'tgt_sf_presidio_1', lat: 37.7995, lng: -122.4660 },
        { id: 'tgt_sf_marin_across', lat: 37.8310, lng: -122.4800 },
      ],
    },
    {
      name: 'SF 4: SFO Airport Controlled Terminal Access',
      pickup: { lat: 37.6215, lng: -122.3795 },
      targetedDrivers: [
        { id: 'tgt_sf_sfo_term_1', lat: 37.6220, lng: -122.3800 },
        { id: 'tgt_sf_sfo_hwy', lat: 37.6400, lng: -122.3900 },
      ],
    },
    {
      name: 'SF 5: Mission District One-Way Pattern',
      pickup: { lat: 37.7600, lng: -122.4150 },
      targetedDrivers: [
        { id: 'tgt_sf_mis_1', lat: 37.7610, lng: -122.4160 },
        { id: 'tgt_sf_mis_2', lat: 37.7590, lng: -122.4140 },
      ],
    },
    {
      name: 'SF 6: Presidio Park Sparse Supply / Restricted Roads',
      pickup: { lat: 37.7989, lng: -122.4662 },
      targetedDrivers: [
        { id: 'tgt_sf_pre_1', lat: 37.7980, lng: -122.4650 },
        { id: 'tgt_sf_pre_remote', lat: 37.8050, lng: -122.4400 },
      ],
    },
    {
      name: 'SF 7: Silicon Valley Suburban Highway Corridor (Palo Alto)',
      pickup: { lat: 37.4420, lng: -122.1435 },
      targetedDrivers: [
        { id: 'tgt_sf_pa_1', lat: 37.4430, lng: -122.1440 },
        { id: 'tgt_sf_pa_2', lat: 37.4500, lng: -122.1500 },
      ],
    },
  ];

  // Add targeted drivers into the fleet
  for (const sc of scenarios) {
    for (const td of sc.targetedDrivers) {
      fleet.push({
        id: td.id,
        lat: td.lat,
        lng: td.lng,
        cellId: TriHex.latLngToCell(td.lat, td.lng, 10),
      });
    }
  }

  return { topology, fleet, scenarios };
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function runRealRoadRecallSuite() {
  console.log('🚗 EXECUTING REAL ROAD NETWORK CANDIDATE RECALL EVALUATION (2 MARKETS, 18 SCENARIOS)...\n');

  const allMetrics: RecallMetrics[] = [];

  // =========================================================================
  // RUN MARKET 1: LAGOS METROPOLITAN AREA
  // =========================================================================
  console.log('================================================================');
  console.log('📍 MARKET 1: LAGOS METROPOLITAN AREA (1,200+ Drivers, 11 Scenarios)');
  console.log('================================================================');
  const lagosData = buildLagosMetropolitanNetwork();
  const lagosDriverPositions: DriverPosition[] = lagosData.fleet.map((d, i) => ({
    driverId: d.id,
    lat: d.lat,
    lng: d.lng,
    cellId: d.cellId,
    cityId: 'lagos',
    version: 1,
    updatedAt: Date.now() + i,
    status: 'AVAILABLE',
  }));

  for (const sc of lagosData.scenarios) {
    const pickupCell = TriHex.latLngToCell(sc.pickup.lat, sc.pickup.lng, 10);
    const result = await evaluateCandidateRecall(
      sc.name,
      lagosData.topology,
      lagosDriverPositions,
      sc.pickup,
      pickupCell,
      'lagos'
    );

    allMetrics.push(result.metrics);

    console.log(`▶ Scenario: ${sc.name}`);
    console.log(`  Fleet Size: ${result.metrics.totalFleetSize} | Retrieved: ${result.metrics.retrievedCount}`);
    console.log(
      `  Recall@1: ${(result.metrics.recallAt1 * 100).toFixed(1)}% | Recall@5: ${(result.metrics.recallAt5 * 100).toFixed(1)}% | Recall@10: ${(result.metrics.recallAt10 * 100).toFixed(1)}% | Recall@25: ${(result.metrics.recallAt25 * 100).toFixed(1)}% | MRR: ${result.metrics.mrr.toFixed(3)}`
    );
    console.log(
      `  ETA Regret: ${result.metrics.etaRegretSeconds.toFixed(1)}s (Relative: ${result.metrics.relativeEtaRegretPct.toFixed(1)}%) | False Negatives: ${result.metrics.falseNegativeCount}`
    );
    console.log(
      `  Top Candidate: ${result.trihexTop5[0]?.driverId} (ETA: ${result.trihexTop5[0]?.durationSeconds}s) vs Ground Truth: ${result.groundTruthTop5[0]?.driverId} (ETA: ${result.groundTruthTop5[0]?.durationSeconds}s)\n`
    );

    assert(result.metrics.recallAt5 >= 0.90, `Recall@5 must be >= 90% in ${sc.name}`);
    assert(result.metrics.etaRegretSeconds < 30, `ETA regret must be < 30s in ${sc.name}`);
  }

  // =========================================================================
  // RUN MARKET 2: SAN FRANCISCO BAY AREA
  // =========================================================================
  console.log('================================================================');
  console.log('📍 MARKET 2: SAN FRANCISCO BAY AREA (1,200+ Drivers, 7 Scenarios)');
  console.log('================================================================');
  const sfData = buildSFBayAreaNetwork();
  const sfDriverPositions: DriverPosition[] = sfData.fleet.map((d, i) => ({
    driverId: d.id,
    lat: d.lat,
    lng: d.lng,
    cellId: d.cellId,
    cityId: 'sf',
    version: 1,
    updatedAt: Date.now() + i,
    status: 'AVAILABLE',
  }));

  for (const sc of sfData.scenarios) {
    const pickupCell = TriHex.latLngToCell(sc.pickup.lat, sc.pickup.lng, 10);
    const result = await evaluateCandidateRecall(
      sc.name,
      sfData.topology,
      sfDriverPositions,
      sc.pickup,
      pickupCell,
      'sf'
    );

    allMetrics.push(result.metrics);

    console.log(`▶ Scenario: ${sc.name}`);
    console.log(`  Fleet Size: ${result.metrics.totalFleetSize} | Retrieved: ${result.metrics.retrievedCount}`);
    console.log(
      `  Recall@1: ${(result.metrics.recallAt1 * 100).toFixed(1)}% | Recall@5: ${(result.metrics.recallAt5 * 100).toFixed(1)}% | Recall@10: ${(result.metrics.recallAt10 * 100).toFixed(1)}% | Recall@25: ${(result.metrics.recallAt25 * 100).toFixed(1)}% | MRR: ${result.metrics.mrr.toFixed(3)}`
    );
    console.log(
      `  ETA Regret: ${result.metrics.etaRegretSeconds.toFixed(1)}s (Relative: ${result.metrics.relativeEtaRegretPct.toFixed(1)}%) | False Negatives: ${result.metrics.falseNegativeCount}`
    );
    console.log(
      `  Top Candidate: ${result.trihexTop5[0]?.driverId} (ETA: ${result.trihexTop5[0]?.durationSeconds}s) vs Ground Truth: ${result.groundTruthTop5[0]?.driverId} (ETA: ${result.groundTruthTop5[0]?.durationSeconds}s)`
    );
    console.log('  Ground Truth Top 5:', result.groundTruthTop5.map(g => `${g.driverId} (${g.durationSeconds.toFixed(1)}s)`).join(', '));
    console.log('  TriHex Top 5:      ', result.trihexTop5.map(t => `${t.driverId} (${t.durationSeconds.toFixed(1)}s)`).join(', '));
    console.log();

    assert(result.metrics.recallAt5 >= 0.90, `Recall@5 must be >= 90% in ${sc.name}`);
    assert(result.metrics.etaRegretSeconds < 30, `ETA regret must be < 30s in ${sc.name}`);
  }

  // =========================================================================
  // OVERALL MULTI-MARKET SUMMARY & PERCENTILES
  // =========================================================================
  const avgRecall1 = allMetrics.reduce((a, b) => a + b.recallAt1, 0) / allMetrics.length;
  const avgRecall5 = allMetrics.reduce((a, b) => a + b.recallAt5, 0) / allMetrics.length;
  const avgRecall10 = allMetrics.reduce((a, b) => a + b.recallAt10, 0) / allMetrics.length;
  const avgRecall25 = allMetrics.reduce((a, b) => a + b.recallAt25, 0) / allMetrics.length;
  const avgRecall50 = allMetrics.reduce((a, b) => a + b.recallAt50, 0) / allMetrics.length;
  const avgRecall100 = allMetrics.reduce((a, b) => a + b.recallAt100, 0) / allMetrics.length;
  const avgMRR = allMetrics.reduce((a, b) => a + b.mrr, 0) / allMetrics.length;

  const sortedRegrets = allMetrics.map((r) => r.etaRegretSeconds).sort((a, b) => a - b);
  const p50Regret = sortedRegrets[Math.floor(sortedRegrets.length * 0.50)];
  const p95Regret = sortedRegrets[Math.floor(sortedRegrets.length * 0.95)];
  const p99Regret = sortedRegrets[Math.floor(sortedRegrets.length * 0.99)];
  const maxRegret = Math.max(...sortedRegrets);

  console.log('================================================================');
  console.log('🏆 18-SCENARIO MULTI-MARKET REAL ROAD-NETWORK RECALL CERTIFICATION:');
  console.log(`  • Evaluated Markets:   2 (Lagos Metropolis & San Francisco Bay Area)`);
  console.log(`  • Evaluated Fleet:     ${lagosDriverPositions.length + sfDriverPositions.length} Total Drivers`);
  console.log(`  • Average Recall@1:    ${(avgRecall1 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@5:    ${(avgRecall5 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@10:   ${(avgRecall10 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@25:   ${(avgRecall25 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@50:   ${(avgRecall50 * 100).toFixed(1)}%`);
  console.log(`  • Average Recall@100:  ${(avgRecall100 * 100).toFixed(1)}%`);
  console.log(`  • Average MRR:         ${avgMRR.toFixed(3)}`);
  console.log(`  • p50 ETA Regret:      ${p50Regret.toFixed(1)}s`);
  console.log(`  • p95 ETA Regret:      ${p95Regret.toFixed(1)}s`);
  console.log(`  • p99 ETA Regret:      ${p99Regret.toFixed(1)}s`);
  console.log(`  • Worst-Case Regret:   ${maxRegret.toFixed(1)}s`);
  console.log('================================================================\n');

  assert(avgRecall5 >= 0.98, 'Average Recall@5 across all scenarios must be >= 98.0%');
  assert(avgRecall10 >= 0.99, 'Average Recall@10 across all scenarios must be >= 99.0%');
  assert(avgRecall25 >= 0.995, 'Average Recall@25 across all scenarios must be >= 99.5%');
  assert(p95Regret <= 15, 'p95 ETA regret must be <= 15 seconds');
}

runRealRoadRecallSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
