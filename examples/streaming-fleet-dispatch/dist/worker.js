"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryStreamWorker = void 0;
const trihex_bridge_1 = require("./trihex-bridge");
class TelemetryStreamWorker {
    engine;
    resolution;
    macroShardResolution;
    processedCount = 0;
    rejectedStaleCount = 0;
    migrationsCount = 0;
    activeShards = new Set();
    constructor(engine, config) {
        this.engine = engine;
        this.resolution = config?.resolution ?? 10;
        this.macroShardResolution = config?.macroShardResolution ?? 4;
    }
    /**
     * Processes a single telemetry ping from the Kafka/Redpanda stream.
     * Resolves coordinates to a 64-bit TriHex cell ID and updates driver position atomically in Redis.
     */
    async processPing(ping) {
        // 1. Compute discrete global spatial cell ID in sub-microsecond time
        const cellId = (0, trihex_bridge_1.latLngToCell)(ping.lat, ping.lng, this.resolution);
        // 2. Compute macro-shard to determine Redis Cluster hash slot
        const shard = (0, trihex_bridge_1.getSpatialShard)(cellId, this.macroShardResolution);
        this.activeShards.add(shard);
        const position = {
            driverId: ping.driverId,
            lat: ping.lat,
            lng: ping.lng,
            cellId,
            cityId: ping.cityId,
            version: ping.version,
            updatedAt: ping.timestamp,
            status: ping.status
        };
        // 3. Execute atomic migration in Redis Cluster
        const updated = await this.engine.updateDriverPosition(position);
        this.processedCount++;
        if (updated) {
            this.migrationsCount++;
        }
        else {
            this.rejectedStaleCount++;
        }
        return { success: updated, cellId, shard };
    }
    /**
     * Processes a batch of telemetry pings concurrently
     */
    async processBatch(pings) {
        await Promise.all(pings.map(p => this.processPing(p)));
    }
    getMetrics() {
        return {
            processedCount: this.processedCount,
            rejectedStaleCount: this.rejectedStaleCount,
            migrationsCount: this.migrationsCount,
            activeShardsCount: this.activeShards.size,
            activeShards: Array.from(this.activeShards)
        };
    }
}
exports.TelemetryStreamWorker = TelemetryStreamWorker;
// Entrypoint for running the stream worker standalone or in container
if (require.main === module) {
    const engine = new trihex_bridge_1.DispatchEngine({
        cellTtlSeconds: 60,
        driverTtlSeconds: 30
    });
    const worker = new TelemetryStreamWorker(engine, {
        resolution: 10,
        macroShardResolution: 4
    });
    console.log('⚡ TriHex Stream Ingestion Worker active. Listening for streaming telemetry...');
    // Periodic heartbeat
    const interval = setInterval(() => {
        const m = worker.getMetrics();
        console.log(`[Worker Status] Processed: ${m.processedCount} | Migrations: ${m.migrationsCount} | Rejected Stale: ${m.rejectedStaleCount} | Active Shards: ${m.activeShardsCount}`);
    }, 5000);
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('Stream Worker stopped.');
        process.exit(0);
    });
}
