import { DispatchEngine, TriHexId } from './trihex-bridge';
import { TelemetryPing } from './types';
export interface WorkerConfig {
    resolution?: number;
    macroShardResolution?: number;
}
export declare class TelemetryStreamWorker {
    private engine;
    private resolution;
    private macroShardResolution;
    private processedCount;
    private rejectedStaleCount;
    private migrationsCount;
    private activeShards;
    constructor(engine: DispatchEngine, config?: WorkerConfig);
    /**
     * Processes a single telemetry ping from the Kafka/Redpanda stream.
     * Resolves coordinates to a 64-bit TriHex cell ID and updates driver position atomically in Redis.
     */
    processPing(ping: TelemetryPing): Promise<{
        success: boolean;
        cellId: TriHexId;
        shard: string;
    }>;
    /**
     * Processes a batch of telemetry pings concurrently
     */
    processBatch(pings: TelemetryPing[]): Promise<void>;
    getMetrics(): {
        processedCount: number;
        rejectedStaleCount: number;
        migrationsCount: number;
        activeShardsCount: number;
        activeShards: string[];
    };
}
