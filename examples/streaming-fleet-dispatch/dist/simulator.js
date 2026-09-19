"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FleetSimulator = void 0;
class FleetSimulator {
    drivers = [];
    config;
    constructor(config) {
        this.config = {
            outOfOrderRate: 0.02, // 2% realistic network packet reordering
            ...config
        };
        this.initFleet();
    }
    initFleet() {
        const { driverCount, centerLat, centerLng, radiusKm } = this.config;
        const degPerKm = 1 / 111.0;
        for (let i = 0; i < driverCount; i++) {
            // Uniform circle distribution
            const r = Math.sqrt(Math.random()) * radiusKm * degPerKm;
            const theta = Math.random() * 2 * Math.PI;
            const lat = centerLat + r * Math.cos(theta);
            const lng = centerLng + (r * Math.sin(theta)) / Math.cos((centerLat * Math.PI) / 180);
            this.drivers.push({
                id: `drv_${this.config.cityId}_${(10000 + i).toString()}`,
                lat,
                lng,
                headingDeg: Math.random() * 360,
                speedKmh: 20 + Math.random() * 45, // 20 - 65 km/h
                version: 1,
                status: Math.random() > 0.15 ? 'AVAILABLE' : 'BUSY'
            });
        }
    }
    /**
     * Advances the simulation by deltaSeconds and produces a batch of telemetry pings
     */
    tick(deltaSeconds = 1.0) {
        const pings = [];
        const degPerMeter = 1 / 111319.5;
        const now = Date.now();
        for (const d of this.drivers) {
            // Occasional status toggle
            if (Math.random() < 0.01) {
                d.status = d.status === 'AVAILABLE' ? 'BUSY' : 'AVAILABLE';
            }
            // Random turn (-15 deg to +15 deg)
            d.headingDeg = (d.headingDeg + (Math.random() - 0.5) * 30 + 360) % 360;
            // Speed fluctuation
            d.speedKmh = Math.max(10, Math.min(80, d.speedKmh + (Math.random() - 0.5) * 5));
            // Displace position
            const distanceMeters = (d.speedKmh * 1000 / 3600) * deltaSeconds;
            const rad = (d.headingDeg * Math.PI) / 180;
            const dLat = Math.cos(rad) * distanceMeters * degPerMeter;
            const dLng = (Math.sin(rad) * distanceMeters * degPerMeter) / Math.cos((d.lat * Math.PI) / 180);
            d.lat += dLat;
            d.lng += dLng;
            d.version += 1;
            const isStale = Math.random() < (this.config.outOfOrderRate || 0);
            const versionToSend = isStale ? Math.max(1, d.version - 2) : d.version;
            pings.push({
                driverId: d.id,
                cityId: this.config.cityId,
                lat: Number(d.lat.toFixed(6)),
                lng: Number(d.lng.toFixed(6)),
                speedKmh: Number(d.speedKmh.toFixed(1)),
                headingDeg: Number(d.headingDeg.toFixed(1)),
                version: versionToSend,
                timestamp: now,
                status: d.status
            });
        }
        return pings;
    }
    getDriverCount() {
        return this.drivers.length;
    }
}
exports.FleetSimulator = FleetSimulator;
// Entrypoint for running the simulator standalone or in container
if (require.main === module) {
    const driverCount = process.env.DRIVER_COUNT ? parseInt(process.env.DRIVER_COUNT, 10) : 1000;
    const cityId = process.env.CITY_ID || 'lagos';
    const sim = new FleetSimulator({
        cityId,
        driverCount,
        centerLat: 6.5244,
        centerLng: 3.3792,
        radiusKm: 12.0
    });
    console.log(`🚗 TriHex Fleet Simulator started: ${driverCount} vehicles in ${cityId}`);
    let totalEmitted = 0;
    const interval = setInterval(() => {
        const pings = sim.tick(1.0);
        totalEmitted += pings.length;
        console.log(`[Simulator] Generated batch of ${pings.length} telemetry events | Total: ${totalEmitted}`);
    }, 2000);
    process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('Fleet Simulator stopped.');
        process.exit(0);
    });
}
