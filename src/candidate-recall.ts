import { DispatchEngine, DriverPosition } from './dispatch';
import { TopologyRoutingProvider } from './routing';
import { RoadTopology, VersionedRoadGraph } from './topology';
import { GeoCoord, TriHexId } from './types';

export interface RecallMetrics {
  scenarioName: string;
  totalFleetSize: number;
  retrievedCount: number;
  recallAt5: number;
  recallAt10: number;
  recallAt25: number;
  recallAt50: number;
  recallAt100: number;
}

export interface ScenarioResult {
  metrics: RecallMetrics;
  groundTruthTop5: { driverId: string; durationSeconds: number; distanceMeters: number }[];
  trihexTop5: { driverId: string; durationSeconds: number; rank: number }[];
}

/**
 * Evaluates candidate recall against ground-truth Dijkstra road routing.
 */
export async function evaluateCandidateRecall(
  scenarioName: string,
  topology: RoadTopology,
  drivers: DriverPosition[],
  pickup: GeoCoord,
  pickupCellId: TriHexId,
  cityId = 'lagos'
): Promise<ScenarioResult> {
  // 1. Compute ground-truth road routing for ALL drivers in fleet
  const pickupPos = topology.locate(pickup);
  const groundTruthScored: { driverId: string; durationSeconds: number; distanceMeters: number }[] = [];

  for (const drv of drivers) {
    const drvPos = topology.locate({ lat: drv.lat, lng: drv.lng });
    const cost = topology.estimateCost(drvPos, pickupPos);
    if (cost.durationSeconds !== Infinity) {
      groundTruthScored.push({
        driverId: drv.driverId,
        durationSeconds: cost.durationSeconds,
        distanceMeters: cost.distanceMeters,
      });
    }
  }

  groundTruthScored.sort((a, b) => a.durationSeconds - b.durationSeconds);

  // 2. Set up TriHex dispatch engine with topology routing provider
  const routingProvider = new TopologyRoutingProvider(topology);
  const dispatchEngine = new DispatchEngine({
    routeCostProvider: routingProvider,
    tier1CandidateLimit: 200,
    tier2CandidateLimit: 50,
  });

  // Populate drivers
  for (const drv of drivers) {
    await dispatchEngine.updateDriverPosition(drv);
  }

  // 3. Execute TriHex candidate retrieval
  const candidates = await dispatchEngine.findCandidates({
    pickup,
    pickupCellId,
    cityId,
    initialRadius: 1,
    maxRadius: 6,
    maxResults: 100,
  });

  const retrievedDriverIds = new Set(candidates.map((c) => c.driverId));

  // 4. Calculate Recall@K
  const calcRecallAtK = (k: number): number => {
    const topK = groundTruthScored.slice(0, k);
    if (topK.length === 0) return 1.0;
    let found = 0;
    for (const item of topK) {
      if (retrievedDriverIds.has(item.driverId)) {
        found++;
      }
    }
    return found / topK.length;
  };

  const metrics: RecallMetrics = {
    scenarioName,
    totalFleetSize: drivers.length,
    retrievedCount: candidates.length,
    recallAt5: calcRecallAtK(5),
    recallAt10: calcRecallAtK(10),
    recallAt25: calcRecallAtK(25),
    recallAt50: calcRecallAtK(50),
    recallAt100: calcRecallAtK(100),
  };

  return {
    metrics,
    groundTruthTop5: groundTruthScored.slice(0, 5),
    trihexTop5: candidates.slice(0, 5).map((c) => ({
      driverId: c.driverId,
      durationSeconds: c.finalScore,
      rank: c.rank,
    })),
  };
}

/**
 * Benchmark Scenario 1: River Barrier with Single Bridge (e.g. Lagos Lagoon / Mainland vs Island)
 * Geodesically close drivers on the opposite bank must detour 15km to the bridge.
 */
export function createRiverBarrierTopology(): {
  topology: VersionedRoadGraph;
  pickup: GeoCoord;
  bridgeNode: string;
} {
  const graph = new VersionedRoadGraph('river-barrier-v1');

  // South bank (Island)
  graph.addNode('island_1', { lat: 6.450, lng: 3.420 });
  graph.addNode('island_2', { lat: 6.455, lng: 3.425 }); // Pickup
  graph.addNode('island_3', { lat: 6.460, lng: 3.430 });

  // North bank (Mainland) - geodesically close across water
  graph.addNode('mainland_1', { lat: 6.480, lng: 3.420 });
  graph.addNode('mainland_2', { lat: 6.485, lng: 3.425 });
  graph.addNode('mainland_3', { lat: 6.490, lng: 3.430 });

  // Bridge 10 km to the west connecting the two banks
  graph.addNode('bridge_south', { lat: 6.460, lng: 3.350 });
  graph.addNode('bridge_north', { lat: 6.480, lng: 3.350 });

  // Island roads (Speed: 40 km/h)
  graph.addEdge('island_1', 'island_2', { freeFlowSpeedKmh: 40 });
  graph.addEdge('island_2', 'island_1', { freeFlowSpeedKmh: 40 });
  graph.addEdge('island_2', 'island_3', { freeFlowSpeedKmh: 40 });
  graph.addEdge('island_3', 'island_2', { freeFlowSpeedKmh: 40 });
  graph.addEdge('island_1', 'bridge_south', { distanceMeters: 8000, freeFlowSpeedKmh: 60 });
  graph.addEdge('bridge_south', 'island_1', { distanceMeters: 8000, freeFlowSpeedKmh: 60 });

  // Mainland roads
  graph.addEdge('mainland_1', 'mainland_2', { freeFlowSpeedKmh: 40 });
  graph.addEdge('mainland_2', 'mainland_1', { freeFlowSpeedKmh: 40 });
  graph.addEdge('mainland_2', 'mainland_3', { freeFlowSpeedKmh: 40 });
  graph.addEdge('mainland_3', 'mainland_2', { freeFlowSpeedKmh: 40 });
  graph.addEdge('mainland_1', 'bridge_north', { distanceMeters: 8000, freeFlowSpeedKmh: 60 });
  graph.addEdge('bridge_north', 'mainland_1', { distanceMeters: 8000, freeFlowSpeedKmh: 60 });

  // The Bridge itself (Speed: 70 km/h)
  graph.addEdge('bridge_south', 'bridge_north', { distanceMeters: 2500, freeFlowSpeedKmh: 70 });
  graph.addEdge('bridge_north', 'bridge_south', { distanceMeters: 2500, freeFlowSpeedKmh: 70 });

  return {
    topology: graph,
    pickup: { lat: 6.455, lng: 3.425 },
    bridgeNode: 'bridge_south',
  };
}

/**
 * Benchmark Scenario 2: High-Speed Highway vs Slow Congested Streets
 */
export function createHighwayTopology(): {
  topology: VersionedRoadGraph;
  pickup: GeoCoord;
} {
  const graph = new VersionedRoadGraph('highway-v1');

  // Highway corridor: nodes along expressway (100 km/h)
  graph.addNode('hw_0', { lat: 6.500, lng: 3.300 });
  graph.addNode('hw_1', { lat: 6.530, lng: 3.330 });
  graph.addNode('hw_2', { lat: 6.560, lng: 3.360 });
  graph.addNode('hw_3', { lat: 6.590, lng: 3.390 }); // Exit to pickup

  graph.addEdge('hw_0', 'hw_1', { freeFlowSpeedKmh: 100 });
  graph.addEdge('hw_1', 'hw_2', { freeFlowSpeedKmh: 100 });
  graph.addEdge('hw_2', 'hw_3', { freeFlowSpeedKmh: 100 });

  // Congested local neighborhood streets (15 km/h)
  graph.addNode('local_1', { lat: 6.585, lng: 3.385 });
  graph.addNode('local_2', { lat: 6.588, lng: 3.388 });
  graph.addNode('pickup', { lat: 6.592, lng: 3.392 });

  graph.addEdge('hw_3', 'pickup', { distanceMeters: 400, freeFlowSpeedKmh: 40 });
  graph.addEdge('local_1', 'local_2', { distanceMeters: 800, freeFlowSpeedKmh: 15 });
  graph.addEdge('local_2', 'pickup', { distanceMeters: 800, freeFlowSpeedKmh: 15 });

  return {
    topology: graph,
    pickup: { lat: 6.592, lng: 3.392 },
  };
}
