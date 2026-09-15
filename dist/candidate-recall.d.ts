import { DriverPosition } from './dispatch';
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
    groundTruthTop5: {
        driverId: string;
        durationSeconds: number;
        distanceMeters: number;
    }[];
    trihexTop5: {
        driverId: string;
        durationSeconds: number;
        rank: number;
    }[];
}
/**
 * Evaluates candidate recall against ground-truth Dijkstra road routing.
 */
export declare function evaluateCandidateRecall(scenarioName: string, topology: RoadTopology, drivers: DriverPosition[], pickup: GeoCoord, pickupCellId: TriHexId, cityId?: string): Promise<ScenarioResult>;
/**
 * Benchmark Scenario 1: River Barrier with Single Bridge (e.g. Lagos Lagoon / Mainland vs Island)
 * Geodesically close drivers on the opposite bank must detour 15km to the bridge.
 */
export declare function createRiverBarrierTopology(): {
    topology: VersionedRoadGraph;
    pickup: GeoCoord;
    bridgeNode: string;
};
/**
 * Benchmark Scenario 2: High-Speed Highway vs Slow Congested Streets
 */
export declare function createHighwayTopology(): {
    topology: VersionedRoadGraph;
    pickup: GeoCoord;
};
