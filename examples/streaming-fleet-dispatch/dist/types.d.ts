import { DriverStatus, CandidateScoring } from './trihex-bridge';
/**
 * High-frequency vehicle GPS telemetry event emitted over Kafka / Redpanda
 */
export interface TelemetryPing {
    driverId: string;
    cityId: string;
    lat: number;
    lng: number;
    speedKmh: number;
    headingDeg: number;
    version: number;
    timestamp: number;
    status: DriverStatus;
}
/**
 * Ride-matching dispatch request query
 */
export interface DispatchRequest {
    cityId: string;
    riderLat: number;
    riderLng: number;
    radiusCells?: number;
    maxCandidates?: number;
}
/**
 * Dispatch response containing ranked candidate drivers
 */
export interface DispatchResponse {
    cityId: string;
    riderCellHex: string;
    riderCellId: string;
    searchRadiusCells: number;
    cellsQueriedCount: number;
    totalCandidatesEvaluated: number;
    rankedCandidates: CandidateScoring[];
    executionTimeMs: number;
}
/**
 * Real-time streaming pipeline observability metrics
 */
export interface PipelineMetrics {
    totalPingsProcessed: number;
    pingsPerSecond: number;
    stalePingsRejected: number;
    activeDriversCount: number;
    totalDispatchRequests: number;
    dispatchLatencyMsP50: number;
    dispatchLatencyMsP95: number;
    dispatchLatencyMsP99: number;
    clusterSlotsActive: number;
}
